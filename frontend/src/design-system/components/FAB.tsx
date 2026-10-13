import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { StyleSheet, TouchableOpacity, type ViewStyle } from 'react-native';
import { AppColors, AppSpacing } from '../tokens';

interface FABProps {
  onPress: () => void;
  accessibilityLabel: string;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
  disabled?: boolean;
  testID?: string;
}

export const FAB: React.FC<FABProps> = ({
  onPress,
  accessibilityLabel,
  icon = 'add',
  style,
  disabled = false,
  testID,
}) => {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={[styles.fab, style, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      testID={testID}
    >
      <Ionicons
        name={icon}
        size={28}
        color={disabled ? AppColors.disabledText : AppColors.textOnPrimary}
        accessible={false}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: AppSpacing.xl,
    right: AppSpacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: AppColors.accent.dark,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  disabled: {
    backgroundColor: AppColors.disabledSurface,
    borderWidth: 1,
    borderColor: AppColors.controlBorder,
    shadowOpacity: 0,
    elevation: 0,
  },
});
