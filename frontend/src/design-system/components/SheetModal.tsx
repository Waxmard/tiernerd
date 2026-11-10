import { useRef } from 'react';
import { Modal, type ModalProps } from 'react-native';

export function SheetModal({ visible, children, ...props }: ModalProps) {
  const shown = useRef(children);
  if (visible) shown.current = children;
  return (
    <Modal transparent animationType="slide" visible={visible} {...props}>
      {shown.current}
    </Modal>
  );
}
