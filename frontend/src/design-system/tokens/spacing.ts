export const AppSpacing = {
  // Base spacing values
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  xxxl: 48,

  // Common padding/margin helpers
  screenPadding: 16,
  cardPadding: 16,
  buttonPadding: {
    horizontal: 16,
    vertical: 12,
  },

  // Input spacing
  inputPadding: {
    horizontal: 12,
    vertical: 8,
  },
};

export const AppLayout = {
  maxWidth: 1280,
  desktopBreakpoint: 1024,
  gutter: 16,
  columnGap: 16,
  paneWidth: 400,
  paneGap: 24,
} as const;
