import AsyncStorage from '@react-native-async-storage/async-storage';
import type React from 'react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { USE_MOCK_AUTH } from '../config/api';
import { type User as ApiUser, authService } from '../services/authService';
import {
  consumeGoogleRedirect,
  googleSignInAvailable,
  startGoogleRedirect,
} from '../services/googleSignIn';

interface User {
  id: string;
  email: string;
  displayName: string;
  photoUrl?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isRestoring: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<boolean>;
  register: (
    email: string,
    password: string,
    username?: string
  ) => Promise<boolean>;
  signInWithGoogle: () => Promise<void>;
  googleAvailable: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

// Storage keys
const AUTH_TOKEN_KEY = 'authToken';
const USER_DATA_KEY = 'userData';

// Convert API user to local user format
const toLocalUser = (apiUser: ApiUser): User => ({
  id: apiUser.user_id,
  email: apiUser.email,
  displayName: apiUser.username || apiUser.email.split('@')[0] || apiUser.email,
  photoUrl: undefined,
});

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper to persist auth state to storage and update state
  const saveAuthState = useCallback(async (newToken: string, newUser: User) => {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, newToken);
    await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(newUser));
    setUser(newUser);
    setToken(newToken);
  }, []);

  const clearAuthState = useCallback(async () => {
    await AsyncStorage.multiRemove([AUTH_TOKEN_KEY, USER_DATA_KEY]);
    setUser(null);
    setToken(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // `isLoading` gates the login/register buttons, so it must start false once
    // the boot read settles or the button spins forever.
    const settle = () => {
      setIsLoading(false);
      setIsRestoring(false);
    };

    const revalidate = async (storedToken: string) => {
      const result = await authService.validateToken(storedToken);
      if (cancelled) {
        return;
      }
      if (result.tokenRejected) {
        await clearAuthState();
        return;
      }
      if (result.error) {
        console.warn('Session revalidation failed:', result.error);
      }
      if (result.user) {
        const localUser = toLocalUser(result.user);
        setUser(localUser);
        await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(localUser));
      }
    };

    const restore = async () => {
      const redirect = await consumeGoogleRedirect();
      if (cancelled) {
        return;
      }
      if (redirect.status === 'error') {
        setError(redirect.error);
        settle();
        return;
      }
      if (redirect.status === 'token') {
        const result = await authService.loginWithGoogle(redirect.idToken);
        if (cancelled) {
          return;
        }
        if (result.success && result.user && result.token) {
          await saveAuthState(result.token, toLocalUser(result.user));
        } else {
          setError(result.error ?? 'Google sign-in failed');
        }
        settle();
        return;
      }

      const [storedToken, storedUser] = await Promise.all([
        AsyncStorage.getItem(AUTH_TOKEN_KEY),
        AsyncStorage.getItem(USER_DATA_KEY),
      ]);
      if (cancelled) {
        return;
      }
      if (storedToken && storedUser) {
        try {
          setUser(JSON.parse(storedUser) as User);
          setToken(storedToken);
        } catch {
          await clearAuthState();
          settle();
          return;
        }
        settle();
        if (!USE_MOCK_AUTH) {
          void revalidate(storedToken);
        }
        return;
      }
      settle();
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [clearAuthState, saveAuthState]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      try {
        setIsLoading(true);
        setError(null);

        if (USE_MOCK_AUTH) {
          // Mock authentication
          await new Promise((resolve) => setTimeout(resolve, 500));
          const mockUser: User = {
            id: '123456789',
            email: email,
            displayName: email.split('@')[0] || email,
            photoUrl: undefined,
          };
          await saveAuthState('mock-auth-token', mockUser);
          return true;
        }

        // Real authentication
        const result = await authService.login(email, password);
        if (result.success && result.user && result.token) {
          await saveAuthState(result.token, toLocalUser(result.user));
          return true;
        } else {
          setError(result.error || 'Login failed');
          return false;
        }
      } catch (error: unknown) {
        setError(
          error instanceof Error ? error.message : 'Authentication failed'
        );
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [saveAuthState]
  );

  const register = useCallback(
    async (
      email: string,
      password: string,
      username?: string
    ): Promise<boolean> => {
      try {
        setIsLoading(true);
        setError(null);

        if (USE_MOCK_AUTH) {
          // Mock registration (same as login for mock)
          return signIn(email, password);
        }

        // Real registration
        const result = await authService.register({
          email,
          password,
          username,
        });
        if (result.success && result.user && result.token) {
          await saveAuthState(result.token, toLocalUser(result.user));
          return true;
        } else {
          setError(result.error || 'Registration failed');
          return false;
        }
      } catch (error: unknown) {
        setError(
          error instanceof Error ? error.message : 'Registration failed'
        );
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [signIn, saveAuthState]
  );

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    if (USE_MOCK_AUTH) {
      await signIn('google.user@tiernerd.com', 'mock-google-password');
      return;
    }
    if (!googleSignInAvailable) {
      setError('Google sign-in is not configured');
      return;
    }
    try {
      await startGoogleRedirect();
    } catch (error: unknown) {
      setError(
        error instanceof Error ? error.message : 'Google sign-in failed'
      );
    }
  }, [signIn]);

  const signOut = useCallback(async () => {
    try {
      setIsLoading(true);
      await clearAuthState();
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      setIsLoading(false);
    }
  }, [clearAuthState]);

  const contextValue = useMemo(
    () => ({
      user,
      token,
      isLoading,
      isRestoring,
      error,
      signIn,
      register,
      signInWithGoogle,
      googleAvailable: googleSignInAvailable,
      signOut,
    }),
    [
      user,
      token,
      isLoading,
      isRestoring,
      error,
      signIn,
      register,
      signInWithGoogle,
      signOut,
    ]
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};
