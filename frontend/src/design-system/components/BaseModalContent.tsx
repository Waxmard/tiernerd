import type React from 'react';
import { useId } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
  closeText?: string;
  presentation?: 'modal' | 'panel';
  titleId?: string;
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
  closeText = 'Cancel',
  presentation = 'modal',
  titleId,
  onClose,
  onSubmit,
  contentStyle,
}) => {
  const generatedTitleId = useId();
  const headingId = titleId ?? generatedTitleId;
  const isPanel = presentation === 'panel';
  const content = (
    <View
      style={[styles.content, isPanel && styles.panel, contentStyle]}
      role={isPanel ? 'region' : undefined}
      accessibilityLabel={isPanel && Platform.OS !== 'web' ? title : undefined}
      aria-labelledby={isPanel ? headingId : undefined}
    >
      <Text
        nativeID={headingId}
        accessibilityRole="header"
        style={styles.title}
      >
        {title}
      </Text>
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <View style={styles.buttonRow}>
        <Button
          title={closeText}
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
            style={styles.submitButton}
          />
        )}
      </View>
    </View>
  );

  if (isPanel) return content;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <TouchableWithoutFeedback>{content}</TouchableWithoutFeedback>
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
    paddingVertical: AppSpacing.md,
  },
  keyboardView: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: AppSpacing.md,
  },
  content: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    minHeight: 0,
    backgroundColor: AppColors.dominant.primary,
    borderRadius: AppBorders.radiusLg,
    padding: AppSpacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  panel: {
    flex: 1,
    maxHeight: undefined,
    borderRadius: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  title: {
    ...AppTypography.headlineSmall,
    color: AppColors.secondary.emphasis,
    fontWeight: '600',
    marginBottom: AppSpacing.lg,
    textAlign: 'center',
  },
  body: {
    flexShrink: 1,
  },
  bodyContent: {
    flexGrow: 1,
  },
  error: {
    ...AppTypography.bodySmall,
    color: AppColors.error,
    marginTop: AppSpacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: AppSpacing.sm,
    marginTop: AppSpacing.md,
  },
  cancelButton: {
    minWidth: 80,
    maxWidth: '100%',
    flexShrink: 1,
  },
  submitButton: {
    minWidth: 100,
    maxWidth: '100%',
    flexShrink: 1,
  },
});
