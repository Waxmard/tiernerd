import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';

export function validateIosConfig(apiUrl, clientId) {
  if (!/^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId ?? '')) {
    throw new Error('Set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID to a valid iOS Google OAuth client ID.');
  }

  let url;
  try {
    url = new URL(apiUrl);
  } catch {
    throw new Error('EXPO_PUBLIC_API_URL must be a public HTTPS URL.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  const ipVersion = isIP(host);
  const octets = ipVersion === 4 ? host.split('.').map(Number) : [];
  const privateIpv4 = ipVersion === 4 && (
    octets[0] === 0 || octets[0] === 10 || octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
  );
  const privateIpv6 = ipVersion === 6 && (
    host.startsWith('::') ||
    /^(fc|fd)/.test(host) || /^fe[89ab]/.test(host)
  );
  if (url.protocol !== 'https:' || url.username || url.password ||
      host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      privateIpv4 || privateIpv6) {
    throw new Error('EXPO_PUBLIC_API_URL must be a public HTTPS URL, not localhost or a private network address.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    validateIosConfig(process.env.EXPO_PUBLIC_API_URL, process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
