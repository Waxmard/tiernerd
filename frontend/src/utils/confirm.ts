import { Alert, Platform } from 'react-native';

// react-native-web ships Alert as a no-op stub, so web needs the browser dialogs.
export function confirmDestructive(
  title: string,
  message: string,
  confirmLabel = 'Delete'
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  const { promise, resolve } = Promise.withResolvers<boolean>();
  Alert.alert(
    title,
    message,
    [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: 'destructive',
        onPress: () => resolve(true),
      },
    ],
    { cancelable: true, onDismiss: () => resolve(false) }
  );
  return promise;
}

export function notifyError(title: string, message: string): void {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
