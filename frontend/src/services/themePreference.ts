import { LIST_COLORS, type ListColor } from '../design-system/tokens/colors.ts';

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCE_KEY = 'tiernerd.themePreference';

export function parseThemePreference(raw: string | null): ThemePreference {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

export type WorkspaceBackground = 'landscape' | 'none';

export interface WorkspaceAppearance {
  accent: ListColor;
  background: WorkspaceBackground;
}

export const WORKSPACE_APPEARANCE_KEY = 'tiernerd.workspaceAppearance';

export const DEFAULT_WORKSPACE_APPEARANCE: WorkspaceAppearance = {
  accent: 'blue',
  background: 'landscape',
};

export function parseWorkspaceAppearance(
  raw: string | null
): WorkspaceAppearance {
  if (!raw) return DEFAULT_WORKSPACE_APPEARANCE;
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceAppearance> | null;
    if (!parsed || typeof parsed !== 'object') {
      return DEFAULT_WORKSPACE_APPEARANCE;
    }
    const accent =
      typeof parsed.accent === 'string' &&
      LIST_COLORS.includes(parsed.accent as ListColor)
        ? (parsed.accent as ListColor)
        : DEFAULT_WORKSPACE_APPEARANCE.accent;
    const background: WorkspaceBackground =
      parsed.background === 'landscape' || parsed.background === 'none'
        ? parsed.background
        : DEFAULT_WORKSPACE_APPEARANCE.background;
    return { accent, background };
  } catch {
    return DEFAULT_WORKSPACE_APPEARANCE;
  }
}
