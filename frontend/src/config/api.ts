// API Configuration
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Get the API base URL dynamically for iOS compatibility
const getApiBaseUrl = () => {
  // Explicit override wins, so a local dev server can target a deployed API.
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (override) {
    return override;
  }
  if (__DEV__) {
    // Web is served by the dev machine, so the API is on the same host.
    if (Platform.OS === 'web') {
      return `http://${window.location.hostname}:8000`;
    }
    // Use Expo's hostUri which contains the dev machine's IP
    const debuggerHost = Constants.expoConfig?.hostUri?.split(':')[0];
    if (debuggerHost) {
      return `http://${debuggerHost}:8000`;
    }
    // Fallback for cases where hostUri isn't available
    return 'http://localhost:8000';
  }
  return 'https://your-production-url.com';
};

export const API_BASE_URL = getApiBaseUrl();

// Set EXPO_PUBLIC_USE_MOCK_AUTH=true to use mock auth instead of real backend
// Useful for frontend development without running the backend
export const USE_MOCK_AUTH = process.env.EXPO_PUBLIC_USE_MOCK_AUTH === 'true';

// Public OAuth Web client ID; must match GOOGLE_CLIENT_ID on the backend.
export const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
