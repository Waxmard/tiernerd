import type React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../../providers/ThemeProvider';

type ButtonVariant = 'primary' | 'secondary' | 'text';
type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  className?: string;
  textClassName?: string;
  accessibilityLabel?: string;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-accent dark:bg-accent-dark',
  secondary: 'border border-control dark:border-control-dark',
  text: '',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  small: 'px-4 py-2 min-h-[44px]',
  medium: 'px-4 py-2 min-h-[44px]',
  large: 'px-4 py-3 min-h-[48px]',
};

const TEXT_SIZE_CLASS: Record<ButtonSize, string> = {
  small: 'text-[14px] leading-5',
  medium: 'text-[16px] leading-6',
  large: 'text-[16px] leading-6',
};

const VARIANT_TEXT_CLASS: Record<ButtonVariant, string> = {
  primary: 'text-on-accent dark:text-on-accent-dark',
  secondary: 'text-ink dark:text-ink-dark',
  text: 'text-accent-text dark:text-accent-text-dark',
};

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  disabled = false,
  loading = false,
  icon,
  className,
  textClassName,
  accessibilityLabel,
}) => {
  const colors = useThemeColors();
  const isDisabled = disabled || loading;
  const classes = [
    'flex-row items-center justify-center rounded-[10px]',
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    fullWidth ? 'w-full' : '',
    isDisabled
      ? variant === 'text'
        ? ''
        : 'bg-surface-muted dark:bg-surface-muted-dark border border-control dark:border-control-dark'
      : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const textClasses = [
    'shrink font-semibold',
    TEXT_SIZE_CLASS[size],
    VARIANT_TEXT_CLASS[variant],
    isDisabled ? 'text-ink-disabled dark:text-ink-disabled-dark' : '',
    textClassName ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      className={classes}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      delayPressIn={0}
      delayPressOut={0}
    >
      <View className="flex-row items-center shrink">
        {icon && (
          <View accessible={false} className="mr-2">
            {icon}
          </View>
        )}
        <Text className={textClasses} numberOfLines={2}>
          {title}
        </Text>
        {loading && (
          <ActivityIndicator
            color={
              isDisabled
                ? colors['ink-disabled']
                : variant === 'primary'
                  ? colors['on-accent']
                  : colors['accent-text']
            }
            size="small"
            className="ml-2"
          />
        )}
      </View>
    </TouchableOpacity>
  );
};
