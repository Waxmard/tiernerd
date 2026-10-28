import './global.css';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/providers/AuthContext';
import { ThemeProvider, useTheme } from './src/providers/ThemeProvider';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useAppUpdate } from './src/utils/useAppUpdate';
import {
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from 'react-native-reanimated';

console.info('TierNerdBoot App module evaluated');

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
  useAppUpdate();

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    root.dataset.inputModality = 'pointer';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') root.dataset.inputModality = 'keyboard';
    };
    const onPointerDown = () => {
      root.dataset.inputModality = 'pointer';
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      delete root.dataset.inputModality;
    };
  }, []);

  return (
    <>
      <View
        className="flex-1 min-h-0"
        onLayout={({ nativeEvent: { layout } }) => {
          console.info(`TierNerdBoot AppShell layout ${layout.width}x${layout.height}`);
        }}
      >
        <AppNavigator />
      </View>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </>
  );
};

export default function App() {
  console.info('TierNerdBoot App render entered');
  useEffect(() => {
    console.info('TierNerdBoot App committed');
  }, []);

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
