import { api } from './api';
import { ApiError, getApiErrorMessage } from './apiError';

// Types matching backend schemas
export interface User {
  user_id: string;
  email: string;
  username?: string;
  photo_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
  tokenRejected?: boolean;
}

export const authService = {
  /**
   * Login with a Google ID token
   * POST /api/users/google
   */
  async loginWithGoogle(idToken: string): Promise<AuthResult> {
    try {
      const tokenResponse = await api.post<TokenResponse>('/api/users/google', {
        id_token: idToken,
      });

      const user = await authService.getCurrentUser(tokenResponse.access_token);
      if (!user) {
        return { success: false, error: 'Failed to fetch user info' };
      }

      return {
        success: true,
        user,
        token: tokenResponse.access_token,
      };
    } catch (error) {
      return {
        success: false,
        error: getApiErrorMessage(error, 'Google sign-in failed'),
      };
    }
  },

  /**
   * Get current user info
   * GET /api/users/me
   */
  async getCurrentUser(token: string): Promise<User | null> {
    try {
      return await api.get<User>('/api/users/me', token);
    } catch (error) {
      console.error('Failed to get current user:', error);
      return null;
    }
  },

  /**
   * Validate a stored token by fetching user info
   */
  async validateToken(token: string): Promise<AuthResult> {
    try {
      const user = await api.get<User>('/api/users/me', token);
      return { success: true, user, token };
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        return {
          success: false,
          error: 'Invalid or expired token',
          tokenRejected: true,
        };
      }
      const detail = error instanceof ApiError ? ` (HTTP ${error.status})` : '';
      return { success: false, error: `Could not reach the server${detail}` };
    }
  },
};
