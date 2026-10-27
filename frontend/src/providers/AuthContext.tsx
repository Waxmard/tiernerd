import AsyncStorage from '@react-native-async-storage/async-storage';
import type React from 'react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
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
  photoUrl: apiUser.photo_url ?? undefined,
});

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const signInPending = useRef(false);

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

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted && signInPending.current) {
        signInPending.current = false;
        setIsLoading(false);
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    if (Platform.OS !== 'web') {
      setError('Sign-in is available in the TierNerd web app.');
      return;
    }
    if (signInPending.current) {
      return;
    }
    signInPending.current = true;
    setIsLoading(true);
    setError(null);
    let redirecting = false;
    try {
      if (USE_MOCK_AUTH) {
        await saveAuthState('mock-auth-token', {
          id: '123456789',
          email: 'google.user@tiernerd.com',
          displayName: 'google.user',
        });
      } else if (googleSignInAvailable) {
        await startGoogleRedirect();
        redirecting = true;
      } else {
        setError('Google sign-in is not configured.');
      }
    } catch (error: unknown) {
      setError(
        error instanceof Error ? error.message : 'Google sign-in failed'
      );
    } finally {
      if (!redirecting) {
        signInPending.current = false;
        setIsLoading(false);
      }
    }
  }, [saveAuthState]);

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
      signInWithGoogle,
      googleAvailable:
        Platform.OS === 'web' && (USE_MOCK_AUTH || googleSignInAvailable),
      signOut,
    }),
    [user, token, isLoading, isRestoring, error, signInWithGoogle, signOut]
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};
