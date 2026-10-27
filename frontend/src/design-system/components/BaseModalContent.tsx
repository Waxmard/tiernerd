import type React from 'react';
import { useId } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './Button';

const CARD_SHADOW = {
  shadowColor: 'black',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.15,
  shadowRadius: 12,
  elevation: 8,
};

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
  contentClassName?: string;
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
  contentClassName,
  footer,
}) => {
  const generatedTitleId = useId();
  const headingId = titleId ?? generatedTitleId;
  const isPanel = presentation === 'panel';
  const safeAreaInsets = useSafeAreaInsets();
  const content = (
    <View
      className={[
        'w-full flex-1 min-h-0 p-4 bg-surface dark:bg-surface-dark',
        isPanel
          ? 'rounded-2xl'
          : 'shrink rounded-none desktop:flex-none desktop:max-h-[96%] desktop:max-w-[480px] desktop:rounded-2xl',
        contentClassName ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={isPanel ? undefined : CARD_SHADOW}
      role={isPanel ? 'region' : undefined}
      accessibilityLabel={isPanel && Platform.OS !== 'web' ? title : undefined}
      aria-labelledby={isPanel ? headingId : undefined}
    >
      <Text
        nativeID={headingId}
        accessibilityRole="header"
        className="text-title-large text-ink dark:text-ink-dark shrink-0 mb-4 text-left"
      >
        {title}
      </Text>
      <ScrollView
        className="flex-1 min-h-0 -m-1"
        contentContainerClassName="grow p-1"
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {error ? (
        <Text
          className="text-body-small text-danger-text dark:text-danger-text-dark shrink-0 mt-4"
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : null}
      <View
        className="shrink-0 mt-4"
        style={{ paddingBottom: isPanel ? 0 : safeAreaInsets.bottom }}
      >
        {footer !== undefined ? (
          footer
        ) : (
          <View className="flex-row flex-wrap items-center justify-end gap-2">
            <Button
              title={closeText}
              variant="text"
              onPress={onClose}
              disabled={isLoading}
              className="min-w-20 max-w-full shrink"
            />
            {onSubmit ? (
              <Button
                title={submitText}
                size="large"
                onPress={onSubmit}
                loading={isLoading}
                className="min-w-[100px] max-w-full shrink"
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
        className={`flex-1 bg-black/50 desktop:px-4${Platform.OS === 'web' ? ' web-safe-area-top' : ''}`}
        style={{ paddingTop: safeAreaInsets.top }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 w-full items-center justify-end desktop:justify-center"
        >
          <TouchableWithoutFeedback>{content}</TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
};
