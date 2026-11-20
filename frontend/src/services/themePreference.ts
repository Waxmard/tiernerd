export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCE_KEY = 'tiernerd.themePreference';

export function parseThemePreference(raw: string | null): ThemePreference {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

export const WORKSPACE_SCENES = [
  'landscape',
  'dusk',
  'meadow',
  'shore',
] as const;
export type WorkspaceScene = (typeof WORKSPACE_SCENES)[number];
export type WorkspaceBackground = WorkspaceScene | 'none';

export interface WorkspaceAppearance {
  background: WorkspaceBackground;
  backgroundOpacity: number;
}

export const WORKSPACE_APPEARANCE_KEY = 'tiernerd.workspaceAppearance';

export const DEFAULT_WORKSPACE_APPEARANCE: WorkspaceAppearance = {
  background: 'landscape',
  backgroundOpacity: 0.4,
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
    const stored = parsed.background;
    const background: WorkspaceBackground =
      stored === 'none' || WORKSPACE_SCENES.some((scene) => scene === stored)
        ? (stored as WorkspaceBackground)
        : DEFAULT_WORKSPACE_APPEARANCE.background;
    const opacity = parsed.backgroundOpacity;
    const backgroundOpacity =
      typeof opacity === 'number' && opacity >= 0 && opacity <= 1
        ? opacity
        : DEFAULT_WORKSPACE_APPEARANCE.backgroundOpacity;
    return { background, backgroundOpacity };
  } catch {
    return DEFAULT_WORKSPACE_APPEARANCE;
  }
}
