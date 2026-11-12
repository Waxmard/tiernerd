import { Image as ExpoImage } from 'expo-image';
import { cssInterop } from 'nativewind';
import { View } from 'react-native';
import { API_BASE_URL } from '../config/api';

cssInterop(ExpoImage, { className: 'style' });

export function WorkspacePhotoBackdrop({
  photoId,
  token,
  onError,
}: {
  photoId: string;
  token: string;
  onError: (photoId: string) => void;
}) {
  const uri = `${API_BASE_URL}/api/users/me/background/${photoId}`;

  return (
    <View accessible={false} pointerEvents="none" className="absolute inset-0">
      <ExpoImage
        source={{
          uri,
          headers: { Authorization: `Bearer ${token}` },
          cacheKey: uri,
        }}
        cachePolicy="memory-disk"
        contentFit="cover"
        onError={() => onError(photoId)}
        className="w-full h-full"
      />
      <View className="absolute inset-0 bg-canvas dark:bg-canvas-dark opacity-60" />
    </View>
  );
}
