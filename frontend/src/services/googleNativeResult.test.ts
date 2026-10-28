import assert from 'node:assert/strict';
import { test } from 'node:test';
import { googleNativeIdToken } from './googleNativeResult.ts';

test('accepts a token, ignores cancellation and rejects missing tokens', () => {
  assert.equal(
    googleNativeIdToken({ type: 'success', data: { idToken: 'token' } }),
    'token'
  );
  assert.equal(googleNativeIdToken({ type: 'cancelled', data: null }), null);
  assert.throws(
    () => googleNativeIdToken({ type: 'success', data: { idToken: null } }),
    /did not return an ID token/
  );
});
