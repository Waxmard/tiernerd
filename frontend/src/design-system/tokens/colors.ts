import palette from './palette.json' with { type: 'json' };

export { palette };

export type ListColor = keyof typeof palette.list;

export const LIST_COLORS = Object.keys(palette.list) as ListColor[];

export const LIST_ICONS = [
  'layers',
  'coffee',
  'film',
  'mountain',
  'star',
  'heart',
  'books',
] as const;
export type ListIcon = (typeof LIST_ICONS)[number];

export const LIST_COVERS = ['landscape'] as const;
export type ListCover = (typeof LIST_COVERS)[number];

export type ColorSchemeName = 'light' | 'dark';

export type ThemeColors = typeof palette.light;

export const themeColors = (scheme: ColorSchemeName): ThemeColors =>
  palette[scheme];
