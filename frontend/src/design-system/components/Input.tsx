import { forwardRef, useId } from 'react';
import {
  Text,
  TextInput,
  type TextInputInstance,
  type TextInputProps,
  View,
} from 'react-native';
import { useThemeColors } from '../../providers/ThemeProvider';
import { SectionLabel } from './Emoji';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  inputClassName?: string;
  emoji?: string;
  containerClassName?: string;
  showCount?: boolean;
}

export const Input = forwardRef<TextInputInstance, InputProps>(function Input(
  {
    label,
    error,
    inputClassName,
    emoji,
    containerClassName,
    showCount,
    ...textInputProps
  },
  ref
) {
  const colors = useThemeColors();
  const labelId = useId();
  const { value, maxLength } = textInputProps;
  const count =
    showCount &&
    maxLength !== undefined &&
    typeof value === 'string' &&
    value.length >= maxLength * 0.8
      ? `${value.length}/${maxLength}`
      : null;

  return (
    <View className={containerClassName ?? 'mb-4'}>
      {label && (
        <SectionLabel
          label={label}
          emoji={emoji}
          nativeID={labelId}
          className="mb-1"
        />
      )}
      <View
        className={[
          'flex-row border rounded-[10px] px-3 min-h-[48px] items-center',
          'bg-surface dark:bg-surface-dark',
          error
            ? 'border-danger-text dark:border-danger-text-dark'
            : 'border-control dark:border-control-dark',
        ].join(' ')}
        collapsable={false}
      >
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
      {count && (
        <Text className="text-body-small text-right text-ink-muted dark:text-ink-muted-dark mt-1">
          {count}
        </Text>
      )}
    </View>
  );
});
