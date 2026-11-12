import type React from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
  onClose: () => void;
  onSubmit?: () => void;
  footer?: React.ReactNode;
  color?: ListColor | null;
  emoji?: string;
  scrollable?: boolean;
  onTitlePress?: () => void;
  titleHint?: string;
  onEmojiPress?: () => void;
  emojiLabel?: string;
}

export const BaseModalContent: React.FC<BaseModalContentProps> = ({
  title,
  children,
  isLoading = false,
  submitText = 'Submit',
  closeText = 'Cancel',
  onClose,
  onSubmit,
  footer,
  color = null,
  emoji,
  scrollable = true,
  onTitlePress,
  titleHint,
  onEmojiPress,
  emojiLabel,
}) => {
  const safeAreaInsets = useSafeAreaInsets();
  const hue = useListHue(color);
  const content = (
    <View
      className="w-full flex-1 min-h-0 p-4 bg-surface dark:bg-surface-dark"
      style={CARD_SHADOW}
    >
      <View
        accessible={false}
        pointerEvents="none"
        style={hue.washStyle}
        className="absolute top-0 left-0 right-0 h-40"
      />
      <View className="flex-row items-center gap-2 shrink-0 mb-4">
        {emoji && onEmojiPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={emojiLabel}
            accessibilityHint="Opens the emoji picker"
            hitSlop={10}
            onPress={onEmojiPress}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <Emoji symbol={emoji} size={24} />
          </Pressable>
        ) : emoji ? (
          <Emoji symbol={emoji} size={24} />
        ) : null}
        <Pressable
          accessibilityRole="header"
          accessibilityHint={onTitlePress ? titleHint : undefined}
          onPress={onTitlePress}
          className="flex-1 min-h-11 justify-center"
          style={({ pressed }) =>
            pressed && onTitlePress ? { opacity: 0.7 } : undefined
          }
        >
          <Text className="text-title-large text-ink dark:text-ink-dark text-left">
            {title}
          </Text>
        </Pressable>
      </View>
      {scrollable ? (
        <ScrollView
          className="flex-1 min-h-0 -m-1"
          contentContainerClassName="grow p-1"
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1 min-h-0">{children}</View>
      )}
      <NotificationToast variant="inline" />
      <View
        className="shrink-0 mt-4"
        style={{ paddingBottom: safeAreaInsets.bottom }}
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

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View className="flex-1" style={{ paddingTop: safeAreaInsets.top }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={-safeAreaInsets.bottom}
          className="flex-1 w-full items-center justify-end"
        >
          <TouchableWithoutFeedback>{content}</TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
};
