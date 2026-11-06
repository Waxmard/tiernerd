import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme, useColorScheme } from 'nativewind';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  const preferenceChanged = useRef(false);
  const workspaceAppearanceChanged = useRef(false);
  const scheme: ColorSchemeName = resolvedScheme ?? 'light';

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(THEME_PREFERENCE_KEY)
      .then((rawTheme) => {
        if (!cancelled && !preferenceChanged.current) {
          setPreferenceState(parseThemePreference(rawTheme));
        }
      })
      .catch(() => undefined);
    void AsyncStorage.getItem(WORKSPACE_APPEARANCE_KEY)
      .then((rawAppearance) => {
        if (!cancelled && !workspaceAppearanceChanged.current) {
          setWorkspaceAppearanceState(parseWorkspaceAppearance(rawAppearance));
        }
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
    preferenceChanged.current = true;
    setPreferenceState(next);
    void AsyncStorage.setItem(THEME_PREFERENCE_KEY, next);
  }, []);

  const setWorkspaceAppearance = useCallback((next: WorkspaceAppearance) => {
    workspaceAppearanceChanged.current = true;
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
