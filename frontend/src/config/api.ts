import Constants from 'expo-constants';

// Get the API base URL dynamically for iOS compatibility
const getApiBaseUrl = () => {
  // Explicit override wins, so a local dev server can target a deployed API.
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (override) {
    return override;
  }
  if (__DEV__) {
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

// Public OAuth Web client ID; must match GOOGLE_CLIENT_ID on the backend.
export const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
export const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
