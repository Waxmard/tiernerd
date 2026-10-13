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
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppBorders,
  AppColors,
  AppLayout,
  AppSpacing,
  AppTypography,
} from '../tokens';
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
  footer?: React.ReactNode;
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
  footer,
}) => {
  const generatedTitleId = useId();
  const headingId = titleId ?? generatedTitleId;
  const isPanel = presentation === 'panel';
  const isWide = useWindowDimensions().width >= AppLayout.desktopBreakpoint;
  const safeAreaInsets = useSafeAreaInsets();
  const content = (
    <View
      style={[
        styles.content,
        isPanel && styles.panel,
        !isPanel && isWide && styles.wideModalContent,
        contentStyle,
      ]}
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
        style={[styles.body, isPanel && styles.panelBody]}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View
        style={[
          styles.footer,
          { paddingBottom: isPanel ? 0 : safeAreaInsets.bottom },
        ]}
      >
        {footer !== undefined ? (
          footer
        ) : (
          <View style={styles.buttonRow}>
            <Button
              title={closeText}
              variant="text"
              onPress={onClose}
              disabled={isLoading}
              style={styles.cancelButton}
            />
            {onSubmit ? (
              <Button
                title={submitText}
                size="large"
                onPress={onSubmit}
                loading={isLoading}
                style={styles.submitButton}
              />
            ) : null}
          </View>
        )}
      </View>
    </View>
  );

  if (isPanel) return content;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View
        style={[
          styles.overlay,
          { paddingTop: safeAreaInsets.top },
          isWide && styles.wideOverlay,
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.keyboardView, isWide && styles.wideKeyboardView]}
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
  },
  wideOverlay: {
    paddingHorizontal: AppSpacing.md,
  },
  keyboardView: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  wideKeyboardView: {
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    maxHeight: '90%',
    flexShrink: 1,
    backgroundColor: AppColors.dominant.primary,
    borderTopLeftRadius: AppBorders.radiusXl,
    borderTopRightRadius: AppBorders.radiusXl,
    padding: AppSpacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  wideModalContent: {
    maxWidth: 480,
    borderRadius: AppBorders.radiusXl,
  },
  panel: {
    flex: 1,
    maxHeight: undefined,
    borderRadius: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  title: {
    ...AppTypography.titleMedium,
    color: AppColors.secondary.emphasis,
    flexShrink: 0,
    marginBottom: AppSpacing.md,
    textAlign: 'left',
  },
  body: {
    flexShrink: 1,
    minHeight: 0,
    margin: -AppSpacing.xs,
  },
  panelBody: {
    flex: 1,
  },
  bodyContent: {
    flexGrow: 1,
    padding: AppSpacing.xs,
  },
  error: {
    ...AppTypography.bodySmall,
    color: AppColors.error,
    flexShrink: 0,
    marginTop: AppSpacing.md,
  },
  footer: {
    flexShrink: 0,
    marginTop: AppSpacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: AppSpacing.sm,
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
