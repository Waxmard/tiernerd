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
  { label: 'Great (7.0–10.0)', value: 'good' },
  { label: 'Okay (4.0–6.9)', value: 'mid' },
  { label: 'Bad (1.0–3.9)', value: 'bad' },
] as const satisfies ReadonlyArray<{ label: string; value: TierSet }>;

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
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, disabled }}
            aria-pressed={selected}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={[
              styles.option,
              selected && styles.selectedOption,
              disabled && styles.disabledOption,
            ]}
          >
            <Text
              style={[
                styles.optionText,
                selected && styles.selectedText,
                disabled && styles.disabledText,
              ]}
            >
              {option.label}
            </Text>
            {selected && (
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={AppColors.accent.dark}
                accessible={false}
              />
            )}
          </Pressable>
        );
      })}
    </View>
    <Text style={styles.caption}>Ranges are approximate after rounding.</Text>
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
    gap: AppSpacing.sm,
  },
  option: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: AppColors.controlBorder,
    borderRadius: AppBorders.radiusMd,
    backgroundColor: AppColors.dominant.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: AppSpacing.md,
  },
  selectedOption: {
    backgroundColor: AppColors.selectedSurface,
    borderColor: AppColors.accent.dark,
  },
  disabledOption: {
    backgroundColor: AppColors.disabledSurface,
    borderColor: AppColors.controlBorder,
  },
  optionText: {
    ...AppTypography.labelMedium,
    color: AppColors.secondary.primary,
  },
  selectedText: {
    color: AppColors.accent.dark,
  },
  disabledText: {
    color: AppColors.disabledText,
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
