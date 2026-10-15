export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCE_KEY = 'tiernerd.themePreference';

export function parseThemePreference(raw: string | null): ThemePreference {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'dark';
}

export type PreferenceBand = 1 | 2 | 3 | 4;

export function preferenceBand(
  rank: number | null,
  rankedCount: number
): PreferenceBand | null {
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
  return (index + 1) as PreferenceBand;
}
