export const googleSignInAvailable = false;

export async function signInNativeGoogle(): Promise<string | null> {
  throw new Error('Google sign-in is only available on iOS.');
}

export async function signOutNativeGoogle(): Promise<void> {}
