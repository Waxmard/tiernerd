import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { nextBuildNumber, resolveBuildNumber } from './testflight-build-number.mjs';

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const credentials = {
  bundleId: 'com.example.app',
  marketingVersion: '1.2.3',
  keyId: 'EXAMPLEKEY',
  issuerId: 'example-issuer',
  privateKey,
};
const app = { type: 'apps', id: 'app-123' };
const build = (id, version) => ({ type: 'builds', id, attributes: { version } });
const page = (data, links = {}) => new Response(JSON.stringify({ data, links: { self: 'https://api.appstoreconnect.apple.com/', ...links } }), { status: 200 });

test('build versions compare as numeric tuples and increment the last component', () => {
  assert.equal(nextBuildNumber([]), '1');
  assert.equal(nextBuildNumber(['9.9', '10.2']), '10.3');
  assert.equal(nextBuildNumber(['12.9', '12.10']), '12.11');
  assert.equal(nextBuildNumber(['9.99.99', '10']), '11');
  assert.equal(nextBuildNumber(['1.2', '1.2.1']), '1.2.2');
  assert.equal(nextBuildNumber(['9999.99.98']), '9999.99.99');
});

test('invalid build versions and component overflow fail', () => {
  for (const version of ['', '0', '10000', '-1', '1.100', '1.1.100', '1.2.3.4', '1.2a', null]) {
    assert.throws(() => nextBuildNumber([version]), /Invalid build version/);
  }
  for (const version of ['9999', '1.99', '1.2.99']) {
    assert.throws(() => nextBuildNumber([version]), /supply a known-unused IOS_BUILD_NUMBER/);
  }
});

test('the resolver signs a token and reads filtered build pages', async () => {
  const before = Math.floor(Date.now() / 1000);
  const requests = [];
  const responses = [
    page([app]),
    page([build('build-1', '12.9')], { next: 'https://api.appstoreconnect.apple.com/v1/builds?cursor=second' }),
    page([build('build-2', '12.10')]),
  ];
  const number = await resolveBuildNumber({
    ...credentials,
    fetch: async (url, options) => {
      requests.push({ url: new URL(url), options });
      return responses.shift();
    },
  });
  assert.equal(number, '12.11');
  assert.equal(requests.length, 3);
  assert.equal(requests[0].url.origin, 'https://api.appstoreconnect.apple.com');
  assert.equal(requests[0].url.pathname, '/v1/apps');
  assert.deepEqual(Object.fromEntries(requests[0].url.searchParams), { 'filter[bundleId]': 'com.example.app' });
  assert.equal(requests[1].url.pathname, '/v1/builds');
  assert.deepEqual(Object.fromEntries(requests[1].url.searchParams), {
    'filter[app]': 'app-123',
    'filter[preReleaseVersion.version]': '1.2.3',
    'filter[preReleaseVersion.platform]': 'IOS',
    limit: '200',
  });
  assert.equal(requests[2].url.href, 'https://api.appstoreconnect.apple.com/v1/builds?cursor=second');
  for (const { options } of requests) {
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.Authorization, requests[0].options.headers.Authorization);
  }
  const [header, payload, signature] = requests[0].options.headers.Authorization.replace(/^Bearer /, '').split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'ES256', kid: 'EXAMPLEKEY', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.equal(claims.iss, 'example-issuer');
  assert.equal(claims.aud, 'appstoreconnect-v1');
  assert.equal(claims.exp - claims.iat, 300);
  assert.ok(claims.iat >= before && claims.iat <= Math.floor(Date.now() / 1000));
  assert.ok(verify('sha256', Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')));
});

test('a successful empty build list starts at one', async () => {
  const responses = [page([app]), page([])];
  assert.equal(await resolveBuildNumber({ ...credentials, fetch: async () => responses.shift() }), '1');
});

test('API failures and malformed data never become build one', async () => {
  await assert.rejects(resolveBuildNumber({ ...credentials, fetch: async () => new Response('', { status: 401 }) }), /HTTP 401/);
  await assert.rejects(resolveBuildNumber({ ...credentials, fetch: async () => new Response('not JSON', { status: 200 }) }), /Malformed/);
  await assert.rejects(resolveBuildNumber({ ...credentials, fetch: async () => new Response(JSON.stringify({ data: [], links: {} }), { status: 200 }) }), /Malformed/);
  await assert.rejects(resolveBuildNumber({ ...credentials, fetch: async () => page([]) }), /exactly one/);
  await assert.rejects(resolveBuildNumber({ ...credentials, fetch: async () => page([app, app]) }), /exactly one/);
  const responses = [page([app]), page([{ type: 'builds', id: 'build-1' }])];
  await assert.rejects(resolveBuildNumber({ ...credentials, fetch: async () => responses.shift() }), /Invalid build version/);
});

test('pagination rejects other origins before sending a token', async () => {
  const responses = [page([app]), page([], { next: 'https://example.com/collect' })];
  let calls = 0;
  await assert.rejects(resolveBuildNumber({
    ...credentials,
    fetch: async () => {
      calls++;
      return responses.shift();
    },
  }), /pagination origin/);
  assert.equal(calls, 2);
});

test('request and CLI errors do not expose credentials or tokens', async () => {
  await assert.rejects(resolveBuildNumber({
    ...credentials,
    fetch: async (_url, options) => { throw new Error(`secret ${privateKey} ${options.headers.Authorization}`); },
  }), (error) => {
    assert.equal(error.message, 'App Store Connect request failed or timed out.');
    return true;
  });
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./testflight-build-number.mjs', import.meta.url))], {
    encoding: 'utf8',
    env: {
      IOS_BUNDLE_ID: 'com.example.app',
      MARKETING_VERSION: '1.2.3',
      ASC_KEY_ID: 'SECRET-KEY-ID',
      ASC_ISSUER_ID: 'SECRET-ISSUER-ID',
      ASC_PRIVATE_KEY: 'SECRET-PRIVATE-KEY',
    },
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Unable to sign/);
  assert.doesNotMatch(result.stderr, /SECRET/);
});
