import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { GOOGLE_CLIENT_ID } from '../config/api';
import { parseGoogleRedirect, readIdTokenNonce } from './googleRedirectParams';

const GOOGLE_STATE_KEY = 'googleAuthState';
const GOOGLE_NONCE_KEY = 'googleAuthNonce';
const AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const UNVERIFIED_ERROR =
  'Google sign-in could not be verified. Please try again.';

export const googleSignInAvailable =
  Platform.OS === 'web' && GOOGLE_CLIENT_ID.length > 0;

export type ConsumedRedirect =
  | { status: 'none' }
  | { status: 'token'; idToken: string }
  | { status: 'error'; error: string };

// iOS home-screen web apps cannot open popups: window.open() returns null and
// openAuthSessionAsync never settles. A full-page redirect instead renders in an
// in-app browser, which closes itself and hands the in-scope URL back to this
// window once Google redirects to our own origin.
export async function startGoogleRedirect(): Promise<void> {
  const state = Crypto.randomUUID();
  const nonce = Crypto.randomUUID();
  await AsyncStorage.multiSet([
    [GOOGLE_STATE_KEY, state],
    [GOOGLE_NONCE_KEY, nonce],
  ]);
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: window.location.origin,
    response_type: 'id_token',
    response_mode: 'fragment',
    scope: 'openid email profile',
    state,
    nonce,
  });
  window.location.assign(`${AUTHORIZE_ENDPOINT}?${params}`);
}

export async function consumeGoogleRedirect(): Promise<ConsumedRedirect> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return { status: 'none' };
  }
  const parsed = parseGoogleRedirect(window.location.hash);
  if (!parsed) {
    return { status: 'none' };
  }
  window.history.replaceState(
    null,
    '',
    window.location.pathname + window.location.search
  );
  const expected = await AsyncStorage.getItem(GOOGLE_STATE_KEY);
  const expectedNonce = await AsyncStorage.getItem(GOOGLE_NONCE_KEY);
  await AsyncStorage.multiRemove([GOOGLE_STATE_KEY, GOOGLE_NONCE_KEY]);
  if (!expected || parsed.state !== expected) {
    return { status: 'error', error: UNVERIFIED_ERROR };
  }
  if (parsed.error) {
    return { status: 'error', error: parsed.error };
  }
  if (parsed.idToken) {
    // Google requires a nonce for response_type=id_token, and checking the claim
    // it echoes keeps an id token minted for another request out of this session.
    if (readIdTokenNonce(parsed.idToken) !== expectedNonce) {
      return { status: 'error', error: UNVERIFIED_ERROR };
    }
    return { status: 'token', idToken: parsed.idToken };
  }
  return { status: 'error', error: 'Google sign-in failed' };
}
