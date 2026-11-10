import { Image as ExpoImage } from 'expo-image';
import { cssInterop } from 'nativewind';
import { useEffect, useState } from 'react';
import { Image, Platform, View } from 'react-native';
import { API_BASE_URL } from '../config/api';

cssInterop(ExpoImage, { className: 'style' });

const webBlobUrls = new Map<string, Promise<string>>();

function loadWebBlobUrl(url: string, token: string): Promise<string> {
  const cached = webBlobUrls.get(url);
  if (cached) return cached;
  const pending = fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((response) => {
      if (!response.ok)
        throw new Error(`Photo fetch failed: ${response.status}`);
      return response.blob();
    })
    .then((blob) => URL.createObjectURL(blob));
  pending.catch(() => webBlobUrls.delete(url));
  webBlobUrls.set(url, pending);
  return pending;
}

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
  const [webUrl, setWebUrl] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let active = true;
    loadWebBlobUrl(uri, token).then(
      (url) => {
        if (active) setWebUrl(url);
      },
      () => {
        if (active) onError(photoId);
      }
    );
    return () => {
      active = false;
    };
  }, [uri, token, photoId, onError]);

  return (
    <View accessible={false} pointerEvents="none" className="absolute inset-0">
      {Platform.OS === 'web' ? (
        webUrl ? (
          <Image
            source={{ uri: webUrl }}
            resizeMode="cover"
            onError={() => onError(photoId)}
            className="w-full h-full"
          />
        ) : null
      ) : (
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
      )}
      <View className="absolute inset-0 bg-canvas dark:bg-canvas-dark opacity-60" />
    </View>
  );
}
