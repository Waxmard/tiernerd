import { ApiError, api } from './api';

// Types matching backend schemas
export interface User {
  user_id: string;
  email: string;
  username?: string;
  created_at: string;
  updated_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface RegisterData {
  email: string;
  password: string;
  username?: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
}

export const authService = {
  /**
   * Register a new user
   * POST /api/users/
   */
  async register(data: RegisterData): Promise<AuthResult> {
    try {
      const user = await api.post<User>('/api/users/', data);

      // After registration, login to get token
      const loginResult = await authService.login(data.email, data.password);
      if (!loginResult.success) {
        return { success: true, user, error: 'Registered but failed to login' };
      }

      return {
        success: true,
        user,
        token: loginResult.token,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        let message = 'Registration failed';
        if (Array.isArray(error.data?.detail)) {
          // Pydantic validation error - extract first message
          message = error.data.detail[0]?.msg || message;
        } else if (typeof error.data?.detail === 'string') {
          message = error.data.detail;
        }
        return { success: false, error: message };
      }
      return { success: false, error: 'Network error' };
    }
  },

  /**
   * Login with email/username and password
   * POST /api/users/token (form-encoded)
   */
  async login(emailOrUsername: string, password: string): Promise<AuthResult> {
    try {
      // Backend expects form-encoded data, not JSON
      const formData = new URLSearchParams();
      formData.append('username', emailOrUsername);
      formData.append('password', password);

      const tokenResponse = await api.post<TokenResponse>(
        '/api/users/token',
        formData
      );

      // Fetch user info with the new token
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
      if (error instanceof ApiError) {
        let message = 'Login failed';
        if (Array.isArray(error.data?.detail)) {
          message = error.data.detail[0]?.msg || message;
        } else if (typeof error.data?.detail === 'string') {
          message = error.data.detail;
        }
        return { success: false, error: message };
      }
      return { success: false, error: 'Network error' };
    }
  },

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
      if (error instanceof ApiError) {
        let message = 'Google sign-in failed';
        if (Array.isArray(error.data?.detail)) {
          message = error.data.detail[0]?.msg || message;
        } else if (typeof error.data?.detail === 'string') {
          message = error.data.detail;
        }
        return { success: false, error: message };
      }
      return { success: false, error: 'Network error' };
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
    const user = await authService.getCurrentUser(token);
    if (user) {
      return { success: true, user, token };
    }
    return { success: false, error: 'Invalid or expired token' };
  },
};
