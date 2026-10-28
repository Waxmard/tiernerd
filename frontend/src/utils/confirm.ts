import { Alert } from 'react-native';

export function confirmDestructive(
  title: string,
  message: string,
  confirmLabel = 'Delete'
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
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
  });
}

export function notifyError(title: string, message: string): void {
  Alert.alert(title, message);
}
