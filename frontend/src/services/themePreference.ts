export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCE_KEY = 'tiernerd.themePreference';

export function parseThemePreference(raw: string | null): ThemePreference {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'dark';
}

const PREFERENCE_COLORS = ['#2e7d50', '#69a77c', '#a1c9ac', '#d8eadd'];

export function preferenceColor(
  rank: number | null,
  rankedCount: number
): string | null {
  if (
    rank === null ||
    !Number.isInteger(rank) ||
    !Number.isInteger(rankedCount) ||
    rankedCount <= 0 ||
    rank < 1 ||
    rank > rankedCount
  ) {
    return null;
  }
  const index =
    rankedCount === 1 ? 0 : Math.floor(((rank - 1) * 3) / (rankedCount - 1));
  return PREFERENCE_COLORS[index] ?? null;
}
