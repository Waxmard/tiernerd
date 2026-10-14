export const AppColors = {
  // Dominant colors (60% of the design)
  dominant: {
    primary: '#FFFFFF', // Pure white - main backgrounds
    secondary: '#FAFAFA', // Off-white - cards, elevated sections
  },

  // Secondary colors (30% of the design)
  secondary: {
    primary: '#2D2D2D', // Dark gray - body text
    emphasis: '#1A1A1A', // Near black - headers, important text
    muted: '#6B7280', // Muted gray - secondary text
    light: '#9CA3AF', // Light gray - disabled states
  },

  // Accent colors (10% of the design)
  accent: {
    primary: '#8B5CF6', // Refined purple - buttons, links
    light: '#A78BFA', // Light purple - hover states
    dark: '#7C3AED', // Dark purple - pressed states
  },

  controlBorder: '#6B7280',
  disabledSurface: '#F3F4F6',
  disabledText: '#4B5563',
  selectedSurface: '#F5F3FF',
  category: {
    good: { foreground: '#166534', surface: '#ECFDF5', border: '#166534' },
    mid: { foreground: '#854D0E', surface: '#FFFBEB', border: '#854D0E' },
    bad: { foreground: '#9F1239', surface: '#FFF1F2', border: '#9F1239' },
  },
  // Legacy mappings for compatibility
  primary: '#8B5CF6',
  primaryLight: '#A78BFA',
  primaryDark: '#7C3AED',

  // Text colors
  textPrimary: '#2D2D2D',
  textSecondary: '#6B7280',
  textOnPrimary: '#FFFFFF',

  // Surface colors
  surface: '#FFFFFF',
  surfaceLight: '#FAFAFA',
  surfaceDark: '#F3F4F6',

  // Semantic colors
  error: '#DC2626',
  success: '#10B981',
  warning: '#F59E0B',
  info: '#3B82F6',

  // Neutral colors
  neutral: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },
};

// Gradient definitions - using subtle gray gradients
export const AppGradients = {
  primary: ['#FFFFFF', '#FAFAFA'],
  accent: ['#8B5CF6', '#7C3AED'],
  subtle: ['#FAFAFA', '#F3F4F6'],
};
