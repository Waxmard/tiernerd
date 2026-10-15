import palette from './palette.json' with { type: 'json' };

export { palette };

export type ListColor = keyof typeof palette.list;

export const LIST_COLORS = Object.keys(palette.list) as ListColor[];

export type ColorSchemeName = 'light' | 'dark';

export type ThemeColors = typeof palette.light;

export const themeColors = (scheme: ColorSchemeName): ThemeColors =>
  palette[scheme];
