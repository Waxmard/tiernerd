import type React from 'react';
import { forwardRef, useId, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { AppBorders, AppColors, AppSpacing, AppTypography } from '../tokens';

interface InputProps extends TextInputProps {
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  rightIconAccessibilityLabel?: string;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  onRightIconPress?: () => void;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    error,
    leftIcon,
    rightIcon,
    rightIconAccessibilityLabel,
    containerStyle,
    inputStyle,
    onRightIconPress,
    onFocus,
    onBlur,
    ...textInputProps
  },
  ref
) {
  const [isFocused, setIsFocused] = useState(false);
  const labelId = useId();
  const errorId = useId();

  const handleFocus: NonNullable<TextInputProps['onFocus']> = (event) => {
    setIsFocused(true);
    onFocus?.(event);
  };

  const handleBlur: NonNullable<TextInputProps['onBlur']> = (event) => {
    setIsFocused(false);
    onBlur?.(event);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text nativeID={labelId} style={styles.label}>
          {label}
        </Text>
      )}
      <View
        style={[
          styles.inputContainer,
          Platform.OS !== 'web' && isFocused && styles.inputContainerFocused,
          error && styles.inputContainerError,
        ]}
        collapsable={false}
      >
        {leftIcon && (
          <View accessible={false} style={styles.leftIcon}>
            {leftIcon}
          </View>
        )}
        <TextInput
          ref={ref}
          style={[styles.input, inputStyle]}
          placeholderTextColor={AppColors.secondary.light}
          {...textInputProps}
          accessibilityLabel={textInputProps.accessibilityLabel ?? label}
          accessibilityLabelledBy={
            label ? labelId : textInputProps.accessibilityLabelledBy
          }
          accessibilityHint={
            Platform.OS === 'web'
              ? textInputProps.accessibilityHint
              : (error ?? textInputProps.accessibilityHint)
          }
          aria-invalid={
            Platform.OS === 'web'
              ? error
                ? true
                : textInputProps['aria-invalid']
              : undefined
          }
          aria-describedby={
            Platform.OS === 'web'
              ? [
                  textInputProps['aria-describedby'],
                  error ? errorId : undefined,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              : undefined
          }
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        {rightIcon && onRightIconPress ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={rightIconAccessibilityLabel}
            style={styles.rightIcon}
            onPress={onRightIconPress}
            hitSlop={4}
          >
            <View accessible={false}>{rightIcon}</View>
          </TouchableOpacity>
        ) : (
          rightIcon && (
            <View accessible={false} style={styles.rightIcon}>
              {rightIcon}
            </View>
          )
        )}
      </View>
      {error && (
        <Text
          nativeID={errorId}
          accessibilityLiveRegion="polite"
          style={styles.error}
        >
          {error}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: AppSpacing.md,
  },
  label: {
    ...AppTypography.labelMedium,
    color: AppColors.secondary.primary,
    marginBottom: AppSpacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppColors.controlBorder,
    borderRadius: AppBorders.radiusMd,
    backgroundColor: AppColors.dominant.primary,
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.md,
  },
  inputContainerFocused: {
    borderColor: AppColors.accent.primary,
  },
  inputContainerError: {
    borderColor: AppColors.error,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '400',
    color: AppColors.secondary.primary,
    paddingVertical: 4,
    margin: 0,
  },
  leftIcon: {
    marginRight: AppSpacing.sm,
    height: 24,
    justifyContent: 'center',
  },
  rightIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -AppSpacing.sm,
  },
  error: {
    ...AppTypography.bodySmall,
    color: AppColors.error,
    marginTop: AppSpacing.xs,
  },
});
