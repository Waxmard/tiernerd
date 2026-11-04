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
  DEFAULT_WORKSPACE_APPEARANCE,
  parseThemePreference,
  parseWorkspaceAppearance,
  THEME_PREFERENCE_KEY,
  type ThemePreference,
  WORKSPACE_APPEARANCE_KEY,
  type WorkspaceAppearance,
} from '../services/themePreference';

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  scheme: ColorSchemeName;
  colors: ThemeColors;
  workspaceAppearance: WorkspaceAppearance;
  setWorkspaceAppearance: (next: WorkspaceAppearance) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { colorScheme: resolvedScheme } = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [workspaceAppearance, setWorkspaceAppearanceState] =
    useState<WorkspaceAppearance>(DEFAULT_WORKSPACE_APPEARANCE);
  const scheme: ColorSchemeName = resolvedScheme ?? 'light';

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      AsyncStorage.getItem(THEME_PREFERENCE_KEY),
      AsyncStorage.getItem(WORKSPACE_APPEARANCE_KEY),
    ])
      .then(([rawTheme, rawAppearance]) => {
        if (cancelled) return;
        setPreferenceState(parseThemePreference(rawTheme));
        setWorkspaceAppearanceState(parseWorkspaceAppearance(rawAppearance));
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

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void AsyncStorage.setItem(THEME_PREFERENCE_KEY, next);
  }, []);

  const setWorkspaceAppearance = useCallback((next: WorkspaceAppearance) => {
    setWorkspaceAppearanceState(next);
    void AsyncStorage.setItem(WORKSPACE_APPEARANCE_KEY, JSON.stringify(next));
  }, []);
  const value = useMemo(
    () => ({
      preference,
      setPreference,
      scheme,
      colors,
      workspaceAppearance,
      setWorkspaceAppearance,
    }),
    [
      preference,
      setPreference,
      scheme,
      colors,
      workspaceAppearance,
      setWorkspaceAppearance,
    ]
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
