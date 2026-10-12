export interface GoogleRedirectResult {
  idToken?: string;
  error?: string;
  state: string | null;
}

export function parseGoogleRedirect(hash: string): GoogleRedirectResult | null {
  const params = new URLSearchParams(
    hash.startsWith('#') ? hash.slice(1) : hash
  );
  const error = params.get('error');
  if (error) {
    return {
      error: params.get('error_description') ?? error,
      state: params.get('state'),
    };
  }
  const idToken = params.get('id_token');
  if (!idToken) {
    return null;
  }
  return { idToken, state: params.get('state') };
}

const BASE64URL_PAD = '=';

export function readIdTokenNonce(idToken: string): string | null {
  const payload = idToken.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const padded = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, BASE64URL_PAD);
    const { nonce } = JSON.parse(atob(padded)) as { nonce?: unknown };
    return typeof nonce === 'string' ? nonce : null;
  } catch {
    return null;
  }
}
