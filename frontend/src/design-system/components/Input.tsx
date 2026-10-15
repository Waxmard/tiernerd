import type React from 'react';
import { forwardRef, useId } from 'react';
import {
  Platform,
  Text,
  TextInput,
  type TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { useThemeColors } from '../../providers/ThemeProvider';

interface InputProps extends TextInputProps {
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  rightIconAccessibilityLabel?: string;
  containerClassName?: string;
  inputClassName?: string;
  onRightIconPress?: () => void;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    error,
    leftIcon,
    rightIcon,
    rightIconAccessibilityLabel,
    containerClassName,
    inputClassName,
    onRightIconPress,
    ...textInputProps
  },
  ref
) {
  const colors = useThemeColors();
  const labelId = useId();
  const errorId = useId();
  const containerId = `tiernerd-input-container-${useId()}`;

  return (
    <View className={['mb-4', containerClassName ?? ''].join(' ')}>
      {label && (
        <Text
          nativeID={labelId}
          className="text-label-medium text-ink dark:text-ink-dark mb-1"
        >
          {label}
        </Text>
      )}
      <View
        nativeID={containerId}
        className={[
          'flex-row items-center border rounded-lg px-3 py-2 min-h-[48px]',
          'bg-surface dark:bg-surface-dark',
          error
            ? 'border-danger-text dark:border-danger-text-dark'
            : 'border-control dark:border-control-dark',
        ].join(' ')}
        collapsable={false}
      >
        {leftIcon && (
          <View accessible={false} className="mr-2 h-6 justify-center">
            {leftIcon}
          </View>
        )}
        <TextInput
          ref={ref}
          className={[
            'flex-1 py-1 m-0 text-[16px]',
            'text-ink dark:text-ink-dark',
            inputClassName ?? '',
          ].join(' ')}
          placeholderTextColor={colors['ink-disabled']}
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
        />
        {rightIcon && onRightIconPress ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={rightIconAccessibilityLabel}
            className="w-11 h-11 items-center justify-center -mr-2"
            onPress={onRightIconPress}
          >
            <View accessible={false}>{rightIcon}</View>
          </TouchableOpacity>
        ) : (
          rightIcon && (
            <View
              accessible={false}
              className="w-11 h-11 items-center justify-center -mr-2"
            >
              {rightIcon}
            </View>
          )
        )}
      </View>
      {error && (
        <Text
          nativeID={errorId}
          accessibilityLiveRegion="polite"
          className="text-body-small text-danger-text dark:text-danger-text-dark mt-1"
        >
          {error}
        </Text>
      )}
    </View>
  );
});
