import palette from './palette.json' with { type: 'json' };

export { palette };

export type ListIcon = string;

export type ColorSchemeName = 'light' | 'dark';

export type ThemeColors = typeof palette.light;

export const themeColors = (scheme: ColorSchemeName): ThemeColors =>
  palette[scheme];
