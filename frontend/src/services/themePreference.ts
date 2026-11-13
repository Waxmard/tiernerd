export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCE_KEY = 'tiernerd.themePreference';

export function parseThemePreference(raw: string | null): ThemePreference {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

export type WorkspaceBackground = 'landscape' | 'none';

export interface WorkspaceAppearance {
  background: WorkspaceBackground;
}

export const WORKSPACE_APPEARANCE_KEY = 'tiernerd.workspaceAppearance';

export const DEFAULT_WORKSPACE_APPEARANCE: WorkspaceAppearance = {
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
    const background: WorkspaceBackground =
      parsed.background === 'landscape' || parsed.background === 'none'
        ? parsed.background
        : DEFAULT_WORKSPACE_APPEARANCE.background;
    return { background };
  } catch {
    return DEFAULT_WORKSPACE_APPEARANCE;
  }
}
