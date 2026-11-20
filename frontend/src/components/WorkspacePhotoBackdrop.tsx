import { Image as ExpoImage } from 'expo-image';
import { cssInterop } from 'nativewind';
import { View } from 'react-native';
import { API_BASE_URL } from '../config/api';
import { useTheme } from '../providers/ThemeProvider';

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
  const { colors } = useTheme();
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
      <View
        className="absolute inset-x-0 top-0 h-[360px]"
        style={{
          backgroundImage: `linear-gradient(180deg, ${colors.canvas}E6 0%, ${colors.canvas}00 100%)`,
        }}
      />
    </View>
  );
}
