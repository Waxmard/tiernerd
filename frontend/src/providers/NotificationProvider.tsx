import type React from 'react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Emoji } from '../design-system/components/Emoji';

const NOTIFICATION_MS = 6000;

interface NotificationValue {
  notification: { message: string; emoji: string } | null;
  notify: (message: string, emoji?: string) => void;
}

const NotificationContext = createContext<NotificationValue | undefined>(
  undefined
);

const useNotification = (): NotificationValue => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotify must be used within a NotificationProvider');
  }
  return context;
};

export const useNotify = (): NotificationValue['notify'] =>
  useNotification().notify;

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [notification, setNotification] =
    useState<NotificationValue['notification']>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const notify = useCallback((message: string, emoji = '⚠️') => {
    const text = message.trim();
    if (!text) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = undefined;
      setNotification(null);
    }, NOTIFICATION_MS);
    setNotification({ message: text, emoji });
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const value = useMemo(
    () => ({ notification, notify }),
    [notification, notify]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const NotificationToast: React.FC<{
  variant?: 'overlay' | 'inline';
}> = ({ variant = 'overlay' }) => {
  const { notification } = useNotification();
  const insets = useSafeAreaInsets();
  if (!notification) return null;
  const inline = variant === 'inline';

  return (
    <View
      className={
        inline
          ? 'mb-3 items-center'
          : 'absolute left-4 right-4 z-50 items-center'
      }
      style={
        inline
          ? { pointerEvents: 'none' }
          : { top: insets.top + 8, pointerEvents: 'none' }
      }
    >
      <View className="max-w-sm flex-row items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 dark:border-line-dark dark:bg-surface-dark">
        <Emoji symbol={notification.emoji} size={16} />
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="shrink text-body-small text-ink dark:text-ink-dark"
        >
          {notification.message}
        </Text>
      </View>
    </View>
  );
};
