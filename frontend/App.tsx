import './global.css';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/providers/AuthContext';
import { ThemeProvider, useTheme } from './src/providers/ThemeProvider';
import { AppNavigator } from './src/navigation/AppNavigator';
import {
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from 'react-native-reanimated';

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

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

const AppShell = () => {
  const { scheme } = useTheme();

  return (
    <>
      <View className="flex-1 min-h-0">
        <AppNavigator />
      </View>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
