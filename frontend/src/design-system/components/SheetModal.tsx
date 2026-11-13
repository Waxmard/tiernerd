import { useRef } from 'react';
import { Modal, type ModalProps, View } from 'react-native';

export function SheetModal({ visible, children, ...props }: ModalProps) {
  const shown = useRef(children);
  if (visible) shown.current = children;
  return (
    <Modal transparent animationType="fade" visible={visible} {...props}>
      <View className="flex-1 bg-black/50">{shown.current}</View>
    </Modal>
  );
}
