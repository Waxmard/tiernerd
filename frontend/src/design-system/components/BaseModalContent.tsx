import type React from 'react';
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
import { NotificationToast } from '../../providers/NotificationProvider';
import { useListHue } from '../../providers/ThemeProvider';
import type { ListColor } from '../tokens/colors';
import { Button } from './Button';
import { Emoji } from './Emoji';

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
  isLoading?: boolean;
  submitText?: string;
  closeText?: string;
  presentation?: 'modal' | 'panel';
  onClose: () => void;
  onSubmit?: () => void;
  contentClassName?: string;
  footer?: React.ReactNode;
  color?: ListColor | null;
  emoji?: string;
}

export const BaseModalContent: React.FC<BaseModalContentProps> = ({
  title,
  children,
  isLoading = false,
  submitText = 'Submit',
  closeText = 'Cancel',
  presentation = 'modal',
  onClose,
  onSubmit,
  contentClassName,
  footer,
  color = null,
  emoji,
}) => {
  const isPanel = presentation === 'panel';
  const safeAreaInsets = useSafeAreaInsets();
  const hue = useListHue(color);
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
      accessibilityLabel={isPanel ? title : undefined}
    >
      <View
        accessible={false}
        pointerEvents="none"
        style={hue.washStyle}
        className={[
          'absolute top-0 left-0 right-0 h-40',
          isPanel ? 'rounded-t-2xl' : 'desktop:rounded-t-2xl',
        ].join(' ')}
      />
      <View className="flex-row items-center gap-2 shrink-0 mb-4">
        {emoji ? <Emoji symbol={emoji} size={24} /> : null}
        <Text
          accessibilityRole="header"
          className="flex-1 text-title-large text-ink dark:text-ink-dark text-left"
        >
          {title}
        </Text>
      </View>
      <ScrollView
        className="flex-1 min-h-0 -m-1"
        contentContainerClassName="grow p-1"
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      <NotificationToast variant="inline" />
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
        className="flex-1 bg-black/50 desktop:px-4"
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
