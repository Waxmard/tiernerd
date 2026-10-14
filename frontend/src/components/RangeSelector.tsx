import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AppBorders,
  AppColors,
  AppSpacing,
  AppTypography,
} from '../design-system/tokens';
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
  const option = RANGE_OPTIONS.find((entry) => entry.value === tierSet);
  if (!option) return null;
  const category = AppColors.category[option.value];
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: category.surface, borderColor: category.border },
      ]}
    >
      <Ionicons
        name={option.icon}
        size={16}
        color={category.foreground}
        accessible={false}
      />
      <Text style={[styles.badgeText, { color: category.foreground }]}>
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
}) => (
  <View style={styles.container}>
    <View style={styles.options}>
      {RANGE_OPTIONS.map((option) => {
        const selected = value === option.value;
        const category = AppColors.category[option.value];
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, disabled }}
            aria-pressed={selected}
            disabled={disabled}
            onPress={() => {
              if (!disabled) onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: category.surface,
                borderColor: category.border,
              },
              selected && styles.selectedOption,
              pressed && !disabled && styles.pressedOption,
              disabled && styles.disabledOption,
            ]}
          >
            <View style={styles.indicatorSlot}>
              {selected ? (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={
                    disabled ? AppColors.disabledText : category.foreground
                  }
                  accessible={false}
                />
              ) : null}
            </View>
            <Ionicons
              name={option.icon}
              size={28}
              color={disabled ? AppColors.disabledText : category.foreground}
              accessible={false}
            />
            <Text
              style={[
                styles.optionText,
                { color: category.foreground },
                disabled && styles.disabledText,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
    <Text style={styles.caption}>Choose a starting category.</Text>
    {error && (
      <Text style={styles.error} accessibilityRole="alert">
        {error}
      </Text>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    gap: AppSpacing.sm,
  },
  options: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
  },
  option: {
    flex: 1,
    minWidth: 0,
    minHeight: 104,
    borderWidth: AppBorders.widthThin,
    borderRadius: AppBorders.radiusXl,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.xxs,
    padding: 12,
  },
  selectedOption: {
    borderWidth: AppBorders.widthMedium,
    padding: 11,
  },
  pressedOption: {
    transform: [{ scale: 0.96 }],
  },
  disabledOption: {
    backgroundColor: AppColors.disabledSurface,
    borderColor: AppColors.controlBorder,
  },
  indicatorSlot: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    ...AppTypography.titleMedium,
    textAlign: 'center',
  },
  disabledText: {
    color: AppColors.disabledText,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.xs,
    borderWidth: AppBorders.widthThin,
    borderRadius: AppBorders.radiusFull,
    paddingHorizontal: AppSpacing.sm,
    paddingVertical: AppSpacing.xxs,
  },
  badgeText: {
    ...AppTypography.labelMedium,
  },
  caption: {
    ...AppTypography.bodySmall,
    color: AppColors.textSecondary,
  },
  error: {
    ...AppTypography.bodySmall,
    color: AppColors.error,
  },
});
