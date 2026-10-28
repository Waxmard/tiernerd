import assert from 'node:assert/strict';
import test from 'node:test';
import { validateIosConfig } from './ios-config.mjs';

const clientId = '123456-abcdef.apps.googleusercontent.com';

test('iOS Release requires a public HTTPS API and an iOS client ID', () => {
  for (const url of ['https://example.com', 'https://8.8.8.8', 'https://[2606:4700:4700::1111]']) {
    assert.doesNotThrow(() => validateIosConfig(url, clientId));
  }
  for (const url of [
    '', 'http://example.com', 'https://localhost', 'https://api.localhost', 'https://device.local',
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
