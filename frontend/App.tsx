import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/providers/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AppColors } from './src/design-system/tokens';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';

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

export default function App() {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    root.dataset.inputModality = 'pointer';
    root.style.setProperty('--tiernerd-focus-color', AppColors.accent.dark);
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
      root.style.removeProperty('--tiernerd-focus-color');
    };
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppNavigator />
        <StatusBar style="dark" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
