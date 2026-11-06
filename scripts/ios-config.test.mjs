import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateIosConfig, validateReactRendererVersion } from './ios-config.mjs';

const clientId = '123456-abcdef.apps.googleusercontent.com';

test('iOS Release requires a public HTTPS API and an iOS client ID', () => {
  for (const url of ['https://example.com', 'https://8.8.8.8', 'https://[2606:4700:4700::1111]']) {
    assert.doesNotThrow(() => validateIosConfig(url, clientId));
  }
  for (const url of [
    '', 'http://example.com', 'https://localhost', 'https://api.localhost', 'https://device.local',
    'https://user@example.com', 'https://:pass@example.com',
    'https://127.1', 'https://10.0.0.1', 'https://172.16.0.1', 'https://192.168.1.1',
    'https://169.254.1.1', 'https://100.64.0.1', 'https://[::1]', 'https://[fc00::1]',
    'https://[fe80::1]', 'https://[::ffff:127.0.0.1]',
  ]) {
    assert.throws(() => validateIosConfig(url, clientId), /EXPO_PUBLIC_API_URL/, url);
  }
  for (const id of ['', 'not-a-client-id', 'abc.apps.googleusercontent.com']) {
    assert.throws(() => validateIosConfig('https://example.com', id), /EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID/);
  }
});

test('React version matches React Native embedded renderer', () => {
  assert.throws(
    () => validateReactRendererVersion('19.1.10', 'reconcilerVersion: "19.1.4"'),
    /Incompatible React versions: react is 19\.1\.10 but react-native renderer requires 19\.1\.4\./,
  );
  assert.throws(
    () => validateReactRendererVersion('19.1.4', 'no reconciler version here'),
    /Incompatible React versions/,
  );

  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const reactPkg = JSON.parse(readFileSync(resolve(rootDir, 'frontend/node_modules/react/package.json'), 'utf8'));
  const rendererSource = readFileSync(
    resolve(rootDir, 'frontend/node_modules/react-native/Libraries/Renderer/implementations/ReactFabric-prod.js'),
    'utf8',
  );
  assert.doesNotThrow(() => validateReactRendererVersion(reactPkg.version, rendererSource));
});
