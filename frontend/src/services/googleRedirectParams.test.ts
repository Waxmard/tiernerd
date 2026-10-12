import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseGoogleRedirect,
  readIdTokenNonce,
} from './googleRedirectParams.ts';

test('reads the id token from a successful fragment', () => {
  assert.deepEqual(
    parseGoogleRedirect('#id_token=abc.def&state=s1&authuser=0'),
    {
      idToken: 'abc.def',
      state: 's1',
    }
  );
});

test('accepts a fragment without the leading hash', () => {
  assert.deepEqual(parseGoogleRedirect('id_token=abc.def&state=s1'), {
    idToken: 'abc.def',
    state: 's1',
  });
});

test('prefers the error and decodes its description', () => {
  assert.deepEqual(
    parseGoogleRedirect(
      '#error=access_denied&error_description=User%20denied%20access&state=s1'
    ),
    { error: 'User denied access', state: 's1' }
  );
});

test('falls back to the error code when there is no description', () => {
  assert.deepEqual(parseGoogleRedirect('#error=access_denied&state=s1'), {
    error: 'access_denied',
    state: 's1',
  });
});

test('reports a missing state rather than inventing one', () => {
  assert.deepEqual(parseGoogleRedirect('#id_token=abc.def'), {
    idToken: 'abc.def',
    state: null,
  });
});

test('ignores fragments that are not a Google response', () => {
  assert.equal(parseGoogleRedirect(''), null);
  assert.equal(parseGoogleRedirect('#/lists'), null);
});

const fakeIdToken = (payload: unknown) =>
  [
    Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'signature',
  ].join('.');

test('reads the nonce claim from an id token payload', () => {
  assert.equal(
    readIdTokenNonce(fakeIdToken({ nonce: 'n1', email: 'a@b.c' })),
    'n1'
  );
});

test('reports no nonce when the claim is absent or not a string', () => {
  assert.equal(readIdTokenNonce(fakeIdToken({ email: 'a@b.c' })), null);
  assert.equal(readIdTokenNonce(fakeIdToken({ nonce: 42 })), null);
});

test('reports no nonce for a token that cannot be decoded', () => {
  assert.equal(readIdTokenNonce('not-a-token'), null);
  assert.equal(readIdTokenNonce('header.!!!not-base64!!!.sig'), null);
  assert.equal(readIdTokenNonce(''), null);
});
