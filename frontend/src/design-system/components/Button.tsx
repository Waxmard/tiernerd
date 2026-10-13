import type React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  type TextStyle,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { AppBorders, AppColors, AppSpacing, AppTypography } from '../tokens';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'text';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  disabled = false,
  loading = false,
  icon,
  style,
  textStyle,
}) => {
  const isDisabled = disabled || loading;
  const buttonStyles = [
    styles.base,
    variant === 'text' ? styles.textVariant : styles[variant],
    styles[size],
    fullWidth && styles.fullWidth,
    style,
    isDisabled &&
      (variant === 'text' ? styles.disabledTextVariant : styles.disabled),
  ];
  const textStyles = [
    styles.text,
    styles[`${variant}Text`],
    styles[`${size}Text`],
    textStyle,
    isDisabled && styles.disabledText,
  ];

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      aria-busy={loading}
      style={buttonStyles}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      delayPressIn={0}
      delayPressOut={0}
    >
      <View style={styles.content}>
        {icon && (
          <View accessible={false} style={styles.icon}>
            {icon}
          </View>
        )}
        <Text style={textStyles} numberOfLines={2}>
          {title}
        </Text>
        {loading && (
          <ActivityIndicator
            color={
              isDisabled
                ? AppColors.disabledText
                : variant === 'primary'
                  ? AppColors.textOnPrimary
                  : AppColors.accent.dark
            }
            size="small"
            style={styles.loadingIndicator}
          />
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: AppBorders.radiusMd,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  icon: {
    marginRight: AppSpacing.sm,
  },
  loadingIndicator: {
    marginLeft: AppSpacing.sm,
  },
  primary: {
    backgroundColor: AppColors.accent.dark,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: AppColors.accent.dark,
  },
  textVariant: {
    backgroundColor: 'transparent',
  },
  small: {
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.sm,
    minHeight: 36,
  },
  medium: {
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: AppSpacing.md,
    minHeight: 48,
  },
  large: {
    paddingHorizontal: AppSpacing.xl,
    paddingVertical: AppSpacing.lg,
    minHeight: 56,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    backgroundColor: AppColors.disabledSurface,
    borderWidth: 1,
    borderColor: AppColors.controlBorder,
  },
  disabledTextVariant: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  text: {
    ...AppTypography.labelLarge,
    fontWeight: '600',
    flexShrink: 1,
  },
  primaryText: {
    color: AppColors.textOnPrimary,
  },
  secondaryText: {
    color: AppColors.accent.dark,
  },
  textText: {
    color: AppColors.accent.dark,
  },
  smallText: {
    fontSize: 14,
  },
  mediumText: {
    fontSize: 16,
  },
  largeText: {
    fontSize: 18,
  },
  disabledText: {
    color: AppColors.disabledText,
  },
});
