import { createPrivateKey, sign } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const API_ORIGIN = 'https://api.appstoreconnect.apple.com';

class BuildNumberError extends Error {}

export function nextBuildNumber(versions) {
  if (!Array.isArray(versions)) {
    throw new BuildNumberError('Invalid build versions returned by App Store Connect.');
  }

  let highest = null;
  for (const version of versions) {
    if (typeof version !== 'string' || !/^[0-9]+(\.[0-9]+){0,2}$/.test(version)) {
      throw new BuildNumberError('Invalid build version returned by App Store Connect.');
    }
    const parts = version.split('.');
    const numbers = parts.map(Number);
    if (numbers.some((number, index) => !Number.isSafeInteger(number) || number < (index === 0 ? 1 : 0) || number > (index === 0 ? 9999 : 99))) {
      throw new BuildNumberError('Invalid build version returned by App Store Connect.');
    }
    let comparison = 0;
    for (let index = 0; highest && index < 3 && comparison === 0; index++) {
      comparison = (numbers[index] ?? 0) - (Number(highest[index]) || 0);
    }
    if (!highest || comparison > 0) highest = parts;
  }

  if (!highest) return '1';
  const last = highest.length - 1;
  const next = Number(highest[last]) + 1;
  if (next > (last === 0 ? 9999 : 99)) {
    throw new BuildNumberError('Build number limit reached; supply a known-unused IOS_BUILD_NUMBER.');
  }
  highest[last] = String(next);
  return highest.join('.');
}

export async function resolveBuildNumber({ bundleId, marketingVersion, keyId, issuerId, privateKey, fetch: fetchImpl = globalThis.fetch }) {
  if (![bundleId, marketingVersion, keyId, issuerId, privateKey].every((value) => typeof value === 'string' && value.length > 0)) {
    throw new BuildNumberError('App Store Connect lookup requires a bundle ID, marketing version, and API credentials.');
  }

  let token;
  try {
    const key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
      throw new Error();
    }
    const now = Math.floor(Date.now() / 1000);
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const payload = `${encode({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${encode({ iss: issuerId, iat: now, exp: now + 300, aud: 'appstoreconnect-v1' })}`;
    token = `${payload}.${sign('sha256', Buffer.from(payload), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  } catch {
    throw new BuildNumberError('Unable to sign the App Store Connect token; check the API private key.');
  }

  async function getResources(initialUrl, type) {
    const resources = [];
    const visited = new Set();
    let next = initialUrl;
    while (next !== null) {
      let url;
      try {
        url = new URL(next, API_ORIGIN);
      } catch {
        throw new BuildNumberError('Invalid App Store Connect pagination URL.');
      }
      if (url.origin !== API_ORIGIN || url.username || url.password) {
        throw new BuildNumberError('Unexpected App Store Connect pagination origin.');
      }
      if (visited.has(url.href)) throw new BuildNumberError('App Store Connect pagination repeated a page.');
      visited.add(url.href);

      let response;
      try {
        response = await fetchImpl(url, {
          headers: { Authorization: `Bearer ${token}` },
          redirect: 'error',
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        throw new BuildNumberError('App Store Connect request failed or timed out.');
      }
      if (!response || typeof response.ok !== 'boolean') {
        throw new BuildNumberError('Malformed App Store Connect response.');
      }
      if (!response.ok) {
        const status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? ` (HTTP ${response.status})` : '';
        throw new BuildNumberError(`App Store Connect request failed${status}.`);
      }
      let body;
      try {
        body = await response.json();
      } catch {
        throw new BuildNumberError('Malformed App Store Connect response.');
      }
      if (!body || typeof body !== 'object' || !Array.isArray(body.data) ||
          !body.links || typeof body.links !== 'object' || Array.isArray(body.links) ||
          typeof body.links.self !== 'string' || !body.links.self ||
          body.data.some((resource) => !resource || resource.type !== type || typeof resource.id !== 'string' || !resource.id)) {
        throw new BuildNumberError('Malformed App Store Connect response.');
      }
      resources.push(...body.data);
      next = body.links.next ?? null;
      if (next !== null && (typeof next !== 'string' || !next)) {
        throw new BuildNumberError('Malformed App Store Connect pagination.');
      }
    }
    return resources;
  }

  const appsUrl = new URL('/v1/apps', API_ORIGIN);
  appsUrl.searchParams.set('filter[bundleId]', bundleId);
  const apps = await getResources(appsUrl, 'apps');
  if (apps.length !== 1) {
    throw new BuildNumberError('Expected exactly one App Store Connect app for the bundle ID.');
  }

  const buildsUrl = new URL('/v1/builds', API_ORIGIN);
  buildsUrl.searchParams.set('filter[app]', apps[0].id);
  buildsUrl.searchParams.set('filter[preReleaseVersion.version]', marketingVersion);
  buildsUrl.searchParams.set('filter[preReleaseVersion.platform]', 'IOS');
  buildsUrl.searchParams.set('limit', '200');
  const builds = await getResources(buildsUrl, 'builds');
  return nextBuildNumber(builds.map((build) => build.attributes?.version));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const number = await resolveBuildNumber({
      bundleId: process.env.IOS_BUNDLE_ID,
      marketingVersion: process.env.MARKETING_VERSION,
      keyId: process.env.ASC_KEY_ID,
      issuerId: process.env.ASC_ISSUER_ID,
      privateKey: process.env.ASC_PRIVATE_KEY,
    });
    process.stdout.write(`${number}\n`);
  } catch (error) {
    console.error(error instanceof BuildNumberError ? error.message : 'Unable to resolve the TestFlight build number.');
    process.exitCode = 1;
  }
}
