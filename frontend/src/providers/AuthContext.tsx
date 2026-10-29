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
import { type User as ApiUser, authService } from '../services/authService';
import {
  googleSignInAvailable,
  signInNativeGoogle,
  signOutNativeGoogle,
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
        void revalidate(storedToken);
        return;
      }
      settle();
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [clearAuthState]);

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    if (Platform.OS !== 'ios') {
      setError('Google sign-in is only available on iOS.');
      return;
    }
    if (!googleSignInAvailable) {
      setError('Google sign-in is not configured.');
      return;
    }
    if (signInPending.current) {
      return;
    }
    signInPending.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const idToken = await signInNativeGoogle();
      if (idToken) {
        const result = await authService.loginWithGoogle(idToken);
        if (result.success && result.user && result.token) {
          await saveAuthState(result.token, toLocalUser(result.user));
        } else {
          setError(result.error ?? 'Google sign-in failed');
        }
      }
    } catch (error: unknown) {
      setError(
        error instanceof Error ? error.message : 'Google sign-in failed'
      );
    } finally {
      signInPending.current = false;
      setIsLoading(false);
    }
  }, [saveAuthState]);

  const signOut = useCallback(async () => {
    try {
      setIsLoading(true);
      await clearAuthState();
      if (Platform.OS === 'ios') {
        await signOutNativeGoogle();
      }
    } catch (error) {
      console.error('Error signing out:', error);
      if (Platform.OS === 'ios') {
        setError(
          error instanceof Error ? error.message : 'Google sign-out failed.'
        );
      }
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
      googleAvailable: Platform.OS === 'ios' && googleSignInAvailable,
      signOut,
    }),
    [user, token, isLoading, isRestoring, error, signInWithGoogle, signOut]
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};
