import React from 'react';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { AuthProvider } from './src/providers/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';

// Lets the web Google popup hand its redirect URL back to the opener. No-op off web.
WebBrowser.maybeCompleteAuthSession();

// Configure Reanimated to suppress reduced motion warnings
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

// Suppress useInsertionEffect warnings in development
if (__DEV__) {
  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (args[0]?.includes?.('useInsertionEffect must not schedule updates') ||
        args[0]?.includes?.('Reduced motion setting is enabled')) {
      return;
    }
    originalWarn(...args);
  };
}

export default function App() {
  return (
    <AuthProvider>
      <AppNavigator />
      <StatusBar style="light" />
    </AuthProvider>
  );
}
