import type React from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
  type ViewStyle,
} from 'react-native';
import { AppBorders, AppColors, AppSpacing, AppTypography } from '../tokens';
import { Button } from './Button';

interface BaseModalContentProps {
  title: string;
  children: React.ReactNode;
  error?: string | null;
  isLoading?: boolean;
  submitText?: string;
  submitDisabled?: boolean;
  onClose: () => void;
  onSubmit?: () => void;
  contentStyle?: ViewStyle;
}

export const BaseModalContent: React.FC<BaseModalContentProps> = ({
  title,
  children,
  error,
  isLoading = false,
  submitText = 'Submit',
  submitDisabled = false,
  onClose,
  onSubmit,
  contentStyle,
}) => {
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <TouchableWithoutFeedback>
            <View style={[styles.modal, contentStyle]}>
              <Text style={styles.title}>{title}</Text>

              {children}

              {error && (
                <Text style={styles.error} accessibilityRole="alert">
                  {error}
                </Text>
              )}

              <View style={styles.buttonRow}>
                <Button
                  title="Cancel"
                  variant="text"
                  onPress={onClose}
                  disabled={isLoading}
                  style={styles.cancelButton}
                />
                {onSubmit && (
                  <Button
                    title={submitText}
                    onPress={onSubmit}
                    loading={isLoading}
                    disabled={submitDisabled}
                    style={styles.submitButton}
                  />
                )}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: AppSpacing.lg,
  },
  modal: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: AppColors.dominant.primary,
    borderRadius: AppBorders.radiusLg,
    padding: AppSpacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    ...AppTypography.headlineSmall,
    color: AppColors.secondary.emphasis,
    fontWeight: '600',
    marginBottom: AppSpacing.lg,
    textAlign: 'center',
  },
  error: {
    ...AppTypography.bodySmall,
    color: AppColors.error,
    marginBottom: AppSpacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: AppSpacing.sm,
    marginTop: AppSpacing.sm,
  },
  cancelButton: {
    minWidth: 80,
  },
  submitButton: {
    minWidth: 100,
  },
});
