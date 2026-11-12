import { useRef } from 'react';
import { Modal, type ModalProps, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';

export function SheetModal({ visible, children, ...props }: ModalProps) {
  const shown = useRef(children);
  if (visible) shown.current = children;
  return (
    <Modal transparent animationType="fade" visible={visible} {...props}>
      <View className="flex-1 bg-black/50">
        <Animated.View entering={SlideInDown.duration(250)} style={{ flex: 1 }}>
          {shown.current}
        </Animated.View>
      </View>
    </Modal>
  );
}
