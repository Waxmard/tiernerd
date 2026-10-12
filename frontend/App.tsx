import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/providers/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';

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
