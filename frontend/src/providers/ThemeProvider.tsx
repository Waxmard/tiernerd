import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme, useColorScheme } from 'nativewind';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  type ColorSchemeName,
  type ThemeColors,
  themeColors,
} from '../design-system/tokens/colors';
import {
  parseThemePreference,
  THEME_PREFERENCE_KEY,
  type ThemePreference,
} from '../services/themePreference';

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  scheme: ColorSchemeName;
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { colorScheme: resolvedScheme } = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');
  const scheme: ColorSchemeName = resolvedScheme ?? 'dark';

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(THEME_PREFERENCE_KEY)
      .then((raw) => {
        if (!cancelled) setPreferenceState(parseThemePreference(raw));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    colorScheme.set(preference);
  }, [preference]);

  const colors = useMemo(() => themeColors(scheme), [scheme]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset.theme = scheme;
    root.style.setProperty('--tiernerd-focus-color', colors['accent-text']);
    root.style.colorScheme = scheme;
    root.classList.toggle('dark', scheme === 'dark');
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', colors.canvas);
  }, [scheme, colors]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void AsyncStorage.setItem(THEME_PREFERENCE_KEY, next);
  }, []);

  const value = useMemo(
    () => ({ preference, setPreference, scheme, colors }),
    [preference, setPreference, scheme, colors]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}

export const useThemeColors = (): ThemeColors => useTheme().colors;
