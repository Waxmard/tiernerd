import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { cssInterop } from 'nativewind';
import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Platform, Text, View } from 'react-native';
import { API_BASE_URL } from '../config/api';
import type { ListColor, ListCover } from '../design-system/tokens/colors';
import { useAuth } from '../providers/AuthContext';
import { useSync } from '../providers/SyncProvider';
import { useThemeColors } from '../providers/ThemeProvider';
import type { ListPhoto } from '../services/listCoversService';
import { LandscapeBackdrop } from './LandscapeBackdrop';

cssInterop(ExpoImage, { className: 'style' });

export interface ListPhotoCoverProps {
  cover?: ListCover | null;
  photo?: ListPhoto | null;
  listId?: string;
  localUri?: string;
  color?: ListColor | null;
  className?: string;
}

export function ListPhotoCover({
  cover = null,
  photo = null,
  listId,
  localUri,
  color = null,
  className = '',
}: ListPhotoCoverProps) {
  const { token } = useAuth();
  const { isOffline } = useSync();
  const colors = useThemeColors();
  const [blobState, setBlobState] = useState<{
    identity: string;
    url: string;
  } | null>(null);
  const [retryEpoch, setRetryEpoch] = useState(0);

  const isWeb = Platform.OS === 'web';
  const isUpload = photo?.source === 'upload';
  const uploadUrl =
    isUpload && listId && photo?.id
      ? `${API_BASE_URL}/api/lists/${listId}/cover-photo/${photo.id}`
      : null;
  const uploadIdentity = uploadUrl && token ? `${uploadUrl}:${token}` : null;
  const blobKey = `${uploadIdentity ?? ''}:${retryEpoch}`;

  const sourceKey =
    localUri ??
    (photo
      ? `${photo.source}:${photo.id}:${listId ?? ''}:${token ?? ''}:${photo.source === 'unsplash' ? photo.url : ''}`
      : `${cover ?? ''}:${color ?? ''}`);
  const [failure, setFailure] = useState({ source: sourceKey, failed: false });
  if (failure.source !== sourceKey) {
    setBlobState(null);
    setFailure({ source: sourceKey, failed: false });
  }
  const markFailed = (source: string) =>
    setFailure((current) =>
      current.source === source ? { ...current, failed: true } : current
    );

  const wasOfflineRef = useRef(isOffline);
  useEffect(() => {
    if (wasOfflineRef.current && !isOffline) {
      setFailure({ source: sourceKey, failed: false });
      setRetryEpoch((value) => value + 1);
    }
    wasOfflineRef.current = isOffline;
  }, [isOffline, sourceKey]);

  useEffect(() => {
    if (
      localUri ||
      !isWeb ||
      !isUpload ||
      !uploadUrl ||
      !token ||
      !uploadIdentity
    ) {
      return;
    }
    let active = true;
    let createdUrl: string | null = null;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(uploadUrl, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Upload fetch failed: ${response.status}`);
        }
        const blob = await response.blob();
        if (!active) {
          return;
        }
        createdUrl = URL.createObjectURL(blob);
        setBlobState({ identity: blobKey, url: createdUrl });
      } catch {
        if (!active || controller.signal.aborted) return;
        setFailure((current) =>
          current.source === sourceKey ? { ...current, failed: true } : current
        );
      }
    })();

    return () => {
      active = false;
      controller.abort();
      if (createdUrl) {
        const revoked = createdUrl;
        URL.revokeObjectURL(revoked);
        setBlobState((current) => (current?.url === revoked ? null : current));
      }
    };
  }, [
    isWeb,
    isUpload,
    uploadUrl,
    uploadIdentity,
    blobKey,
    token,
    localUri,
    sourceKey,
  ]);

  if (failure.source === sourceKey && failure.failed) {
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel="Photo unavailable"
        className={[
          'items-center justify-center gap-1 overflow-hidden bg-accent-tint dark:bg-accent-tint-dark border border-line dark:border-line-dark p-2',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Ionicons
          name="image-outline"
          size={20}
          color={colors['ink-muted']}
          accessible={false}
        />
        <Text
          numberOfLines={1}
          className="text-label-small text-ink-muted dark:text-ink-muted-dark text-center"
        >
          Photo unavailable
        </Text>
      </View>
    );
  }

  if (localUri) {
    return (
      <Image
        source={{ uri: localUri }}
        resizeMode="cover"
        onError={() => markFailed(sourceKey)}
        className={className}
      />
    );
  }

  if (photo) {
    if (photo.source === 'unsplash') {
      return (
        <Image
          source={{ uri: photo.url }}
          resizeMode="cover"
          onError={() => markFailed(sourceKey)}
          className={className}
        />
      );
    }

    if (photo.source === 'upload') {
      if (!uploadUrl || !token) {
        return (
          <View
            accessibilityRole="image"
            accessibilityLabel="Photo unavailable"
            className={[
              'items-center justify-center gap-1 overflow-hidden bg-accent-tint dark:bg-accent-tint-dark border border-line dark:border-line-dark p-2',
              className,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <Ionicons
              name="image-outline"
              size={20}
              color={colors['ink-muted']}
              accessible={false}
            />
            <Text
              numberOfLines={1}
              className="text-label-small text-ink-muted dark:text-ink-muted-dark text-center"
            >
              Photo unavailable
            </Text>
          </View>
        );
      }

      if (isWeb) {
        const activeUrl =
          blobState?.identity === blobKey ? blobState.url : null;
        if (!activeUrl) {
          return null;
        }
        return (
          <Image
            source={{ uri: activeUrl }}
            resizeMode="cover"
            onError={() => markFailed(sourceKey)}
            className={className}
          />
        );
      }

      return (
        <ExpoImage
          source={{
            uri: uploadUrl,
            headers: { Authorization: `Bearer ${token}` },
            cacheKey: uploadUrl,
          }}
          cachePolicy="disk"
          recyclingKey={uploadUrl}
          contentFit="cover"
          accessibilityLabel="List cover"
          onError={() => markFailed(sourceKey)}
          className={className}
        />
      );
    }
  }

  if (cover === 'landscape') {
    return <LandscapeBackdrop variant={color} className={className} />;
  }

  return null;
}

function appendUtm(rawUrl: string): string {
  const parts = rawUrl.split('#', 2);
  const beforeHash = parts[0] ?? rawUrl;
  const hash = parts[1];
  const separator = beforeHash.includes('?') ? '&' : '?';
  const withParams = `${beforeHash}${separator}utm_source=tiernerd&utm_medium=referral`;
  return hash !== undefined ? `${withParams}#${hash}` : withParams;
}

export interface PhotoAttributionProps {
  photo: {
    photographer_name: string;
    photographer_url: string;
    photo_url: string;
  };
  disabled?: boolean;
  className?: string;
}

export function PhotoAttribution({
  photo,
  disabled = false,
  className = '',
}: PhotoAttributionProps) {
  if (disabled) {
    return (
      <Text
        className={[
          'text-label-small text-ink-muted dark:text-ink-muted-dark',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        Photo by {photo.photographer_name} on Unsplash
      </Text>
    );
  }

  const photographerHref = appendUtm(photo.photographer_url);
  const photoHref = appendUtm(photo.photo_url);

  return (
    <Text
      className={[
        'text-label-small text-ink-muted dark:text-ink-muted-dark',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      Photo by{' '}
      <Text
        accessibilityRole="link"
        accessibilityLabel={`Photo by ${photo.photographer_name}`}
        className="underline text-ink dark:text-ink-dark"
        {...(Platform.OS === 'web'
          ? ({
              href: photographerHref,
              hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' },
            } as object)
          : {})}
        onPress={
          Platform.OS === 'web'
            ? undefined
            : () => {
                void Linking.openURL(photographerHref).catch(() => {});
              }
        }
      >
        {photo.photographer_name}
      </Text>
      {' on '}
      <Text
        accessibilityRole="link"
        accessibilityLabel="Unsplash"
        className="underline text-ink dark:text-ink-dark"
        {...(Platform.OS === 'web'
          ? ({
              href: photoHref,
              hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' },
            } as object)
          : {})}
        onPress={
          Platform.OS === 'web'
            ? undefined
            : () => {
                void Linking.openURL(photoHref).catch(() => {});
              }
        }
      >
        Unsplash
      </Text>
    </Text>
  );
}
