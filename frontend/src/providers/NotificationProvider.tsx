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

const NOTIFICATION_MS = 3000;

interface NotificationValue {
  message: string | null;
  notify: (message: string) => void;
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

export const useNotify = (): ((message: string) => void) =>
  useNotification().notify;

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const notify = useCallback((message: string) => {
    const text = message.trim();
    if (!text) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = undefined;
      setMessage(null);
    }, NOTIFICATION_MS);
    setMessage(text);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const value = useMemo(() => ({ message, notify }), [message, notify]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const NotificationToast: React.FC<{
  variant?: 'overlay' | 'inline';
}> = ({ variant = 'overlay' }) => {
  const { message } = useNotification();
  const insets = useSafeAreaInsets();
  if (!message) return null;
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
      <View className="max-w-sm rounded-xl border border-line bg-surface px-3 py-2 dark:border-line-dark dark:bg-surface-dark">
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="text-body-small text-ink dark:text-ink-dark"
        >
          {message}
        </Text>
      </View>
    </View>
  );
};
