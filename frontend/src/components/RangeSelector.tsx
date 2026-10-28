import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useThemeColors } from '../providers/ThemeProvider';
import type { TierSet } from '../services/itemsService';

export const RANGE_OPTIONS = [
  { label: 'Good', value: 'good', icon: 'happy-outline' },
  { label: 'Mid', value: 'mid', icon: 'remove-circle-outline' },
  { label: 'Bad', value: 'bad', icon: 'sad-outline' },
] as const satisfies ReadonlyArray<{
  label: string;
  value: TierSet;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}>;

export const RangeBadge = ({
  tierSet,
}: {
  tierSet: TierSet | null;
}): React.ReactElement | null => {
  const colors = useThemeColors();
  const option = RANGE_OPTIONS.find((entry) => entry.value === tierSet);
  if (!option) return null;
  return (
    <View className="self-start flex-row items-center gap-1 border border-line dark:border-line-dark rounded-full px-2 py-0.5 bg-accent-tint dark:bg-accent-tint-dark">
      <Ionicons
        name={option.icon}
        size={16}
        color={colors['ink-muted']}
        accessible={false}
      />
      <Text className="text-label-medium text-ink-muted dark:text-ink-muted-dark">
        {option.label}
      </Text>
    </View>
  );
};

interface RangeSelectorProps {
  value: TierSet | null;
  onChange: (value: TierSet) => void;
  error?: string;
  disabled?: boolean;
}

export const RangeSelector: React.FC<RangeSelectorProps> = ({
  value,
  onChange,
  error,
  disabled = false,
}) => {
  const colors = useThemeColors();
  return (
    <View className="gap-2">
      <View className="flex-row gap-2">
        {RANGE_OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => {
                if (!disabled) onChange(option.value);
              }}
              className={[
                'flex-1 min-w-0 min-h-12 flex-row items-center justify-center gap-2 px-3 rounded-[10px] border',
                selected
                  ? 'border-2 border-accent dark:border-accent-dark bg-accent-tint dark:bg-accent-tint-dark'
                  : 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark',
                disabled
                  ? 'bg-surface-muted dark:bg-surface-muted-dark border-control dark:border-control-dark'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={({ pressed }) =>
                pressed && !disabled
                  ? { transform: [{ scale: 0.96 }] }
                  : undefined
              }
            >
              <Ionicons
                name={option.icon}
                size={20}
                color={
                  disabled
                    ? colors['ink-disabled']
                    : selected
                      ? colors['accent-text']
                      : colors['ink-muted']
                }
                accessible={false}
              />
              <Text
                className={[
                  'text-body-medium font-semibold text-center',
                  disabled
                    ? 'text-ink-disabled dark:text-ink-disabled-dark'
                    : selected
                      ? 'text-accent-text dark:text-accent-text-dark'
                      : 'text-ink-muted dark:text-ink-muted-dark',
                ].join(' ')}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
        Choose a starting category.
      </Text>
      {error && (
        <Text
          className="text-body-small text-danger-text dark:text-danger-text-dark"
          accessibilityRole="alert"
        >
          {error}
        </Text>
      )}
    </View>
  );
};
