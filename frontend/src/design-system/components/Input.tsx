import type React from 'react';
import { forwardRef, useId } from 'react';
import { Text, TextInput, type TextInputProps, View } from 'react-native';
import { useThemeColors } from '../../providers/ThemeProvider';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  inputClassName?: string;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, leftIcon, inputClassName, ...textInputProps },
  ref
) {
  const colors = useThemeColors();
  const labelId = useId();

  return (
    <View className="mb-4">
      {label && (
        <Text
          nativeID={labelId}
          className="text-label-medium text-ink dark:text-ink-dark mb-1"
        >
          {label}
        </Text>
      )}
      <View
        className={[
          'flex-row items-center border rounded-[10px] px-3 min-h-[48px]',
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
            'flex-1 min-h-[46px] py-2 m-0 text-[16px] leading-6',
            'text-ink dark:text-ink-dark',
            inputClassName ?? '',
          ].join(' ')}
          placeholderTextColor={colors['ink-disabled']}
          {...textInputProps}
          accessibilityLabel={textInputProps.accessibilityLabel ?? label}
          accessibilityLabelledBy={
            label ? labelId : textInputProps.accessibilityLabelledBy
          }
          accessibilityHint={error ?? textInputProps.accessibilityHint}
        />
      </View>
      {error && (
        <Text
          accessibilityLiveRegion="polite"
          className="text-body-small text-danger-text dark:text-danger-text-dark mt-1"
        >
          {error}
        </Text>
      )}
    </View>
  );
});
