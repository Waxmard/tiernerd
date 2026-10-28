import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GOOGLE_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '../config/api';
import { googleNativeIdToken } from './googleNativeResult';

export const googleSignInAvailable =
  GOOGLE_CLIENT_ID.length > 0 && GOOGLE_IOS_CLIENT_ID.length > 0;

if (googleSignInAvailable) {
  GoogleSignin.configure({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    webClientId: GOOGLE_CLIENT_ID,
  });
}

export async function signInNativeGoogle(): Promise<string | null> {
  try {
    return googleNativeIdToken(await GoogleSignin.signIn());
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : '';
    throw new Error(`Google sign-in failed. Please try again.${detail}`);
  }
}

export async function signOutNativeGoogle(): Promise<void> {
  if (googleSignInAvailable) {
    try {
      await GoogleSignin.signOut();
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : '';
      throw new Error(`Google sign-out failed.${detail}`);
    }
  }
}
