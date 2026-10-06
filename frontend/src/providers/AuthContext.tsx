import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIdTokenAuthRequest } from 'expo-auth-session/providers/google';
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
import { Platform } from 'react-native';
import { GOOGLE_CLIENT_ID, USE_MOCK_AUTH } from '../config/api';
import { type User as ApiUser, authService } from '../services/authService';

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
  error: string | null;
  signIn: (email: string, password: string) => Promise<boolean>;
  register: (
    email: string,
    password: string,
    username?: string
  ) => Promise<boolean>;
  signInWithGoogle: () => Promise<boolean>;
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
  const [error, setError] = useState<string | null>(null);

  // Google sign-in exists only in the browser build: useIdTokenAuthRequest
  // requests response_type=id_token on web and falls back to a code exchange
  // (with no client secret configured) on native. It resolves its client ID as
  // `config[Platform.select(...)] ?? config.clientId` and throws on native when
  // both are undefined, so the fallback below keeps the hook from crashing the
  // app on iOS/Android even though googleAvailable is false there.
  const [googleRequest, , promptGoogle] = useIdTokenAuthRequest({
    webClientId: GOOGLE_CLIENT_ID,
    clientId: GOOGLE_CLIENT_ID,
  });
  const googleAvailable = Platform.OS === 'web';

  // Helper to persist auth state to storage and update state
  const saveAuthState = useCallback(async (newToken: string, newUser: User) => {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, newToken);
    await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(newUser));
    setUser(newUser);
    setToken(newToken);
  }, []);

  const checkAuthState = useCallback(async () => {
    try {
      const storedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      const userData = await AsyncStorage.getItem(USER_DATA_KEY);

      if (storedToken && userData) {
        if (USE_MOCK_AUTH) {
          // Mock mode: trust stored data
          setUser(JSON.parse(userData));
          setToken(storedToken);
        } else {
          // Real mode: validate token with backend
          const result = await authService.validateToken(storedToken);
          if (result.success && result.user) {
            const localUser = toLocalUser(result.user);
            setUser(localUser);
            setToken(storedToken);
            await AsyncStorage.setItem(
              USER_DATA_KEY,
              JSON.stringify(localUser)
            );
          } else {
            // Token invalid, clear storage
            await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
            await AsyncStorage.removeItem(USER_DATA_KEY);
          }
        }
      }
    } catch (error) {
      console.error('Error checking auth state:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthState();
  }, [checkAuthState]);

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

  const signInWithGoogle = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      if (USE_MOCK_AUTH) {
        // Mock mode has no backend to exchange a token with.
        return signIn('google.user@tiernerd.com', 'mock-google-password');
      }

      if (!GOOGLE_CLIENT_ID || !googleRequest) {
        setError('Google sign-in is not configured');
        return false;
      }

      const result = await promptGoogle();
      const idToken =
        result?.type === 'success' ? result.params.id_token : undefined;
      if (!idToken) {
        if (result?.type !== 'dismiss' && result?.type !== 'cancel') {
          setError('Google sign-in was cancelled or blocked');
        }
        return false;
      }

      const authResult = await authService.loginWithGoogle(idToken);
      if (authResult.success && authResult.user && authResult.token) {
        await saveAuthState(authResult.token, toLocalUser(authResult.user));
        return true;
      }
      setError(authResult.error || 'Google sign-in failed');
      return false;
    } catch (error: unknown) {
      setError(
        error instanceof Error ? error.message : 'Google sign-in failed'
      );
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [googleRequest, promptGoogle, saveAuthState, signIn]);

  const signOut = useCallback(async () => {
    try {
      setIsLoading(true);
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      await AsyncStorage.removeItem(USER_DATA_KEY);
      setUser(null);
      setToken(null);
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const contextValue = useMemo(
    () => ({
      user,
      token,
      isLoading,
      error,
      signIn,
      register,
      signInWithGoogle,
      googleAvailable,
      signOut,
    }),
    [
      user,
      token,
      isLoading,
      error,
      signIn,
      register,
      signInWithGoogle,
      googleAvailable,
      signOut,
    ]
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};
