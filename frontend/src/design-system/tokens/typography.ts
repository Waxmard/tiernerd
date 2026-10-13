import type { TextStyle } from 'react-native';

export const AppTypography = {
  // Headline styles
  headlineLarge: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '600',
  } as TextStyle,

  headlineMedium: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '600',
  } as TextStyle,

  headlineSmall: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '600',
  } as TextStyle,

  // Title styles
  titleLarge: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '600',
  } as TextStyle,

  titleMedium: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
  } as TextStyle,

  titleSmall: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  } as TextStyle,

  // Body styles
  bodyLarge: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  } as TextStyle,

  bodyMedium: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  } as TextStyle,

  bodySmall: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  } as TextStyle,

  // Label styles
  labelLarge: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: 0.1,
  } as TextStyle,

  labelMedium: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.5,
  } as TextStyle,

  labelSmall: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.5,
  } as TextStyle,

  // Brand/App title styles
  brandTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: 0.8,
  } as TextStyle,
};
