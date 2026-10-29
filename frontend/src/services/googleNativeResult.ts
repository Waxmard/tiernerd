type GoogleNativeResult =
  | { type: 'cancelled'; data: null }
  | { type: 'success'; data: { idToken: string | null } };

export function googleNativeIdToken(result: GoogleNativeResult): string | null {
  if (result.type === 'cancelled') {
    return null;
  }
  if (!result.data.idToken) {
    throw new Error(
      'Google sign-in did not return an ID token. Please try again.'
    );
  }
  return result.data.idToken;
}
