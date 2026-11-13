import { type ReactNode, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Emoji } from '../design-system/components';
import type { ListIcon } from '../design-system/tokens/colors';
import { useAuth } from '../providers/AuthContext';
import { useSync } from '../providers/SyncProvider';
import { useTheme, useThemeColors } from '../providers/ThemeProvider';
import { listIconEmoji } from '../services/listIcon';
import { LandscapeBackdrop } from './LandscapeBackdrop';
import { WorkspacePhotoBackdrop } from './WorkspacePhotoBackdrop';

export function ImmersiveScreenShell({ children }: { children: ReactNode }) {
  const { workspaceAppearance } = useTheme();
  const { user, token } = useAuth();
  const { isOffline } = useSync();
  const [failedPhotoId, setFailedPhotoId] = useState<string | null>(null);
  useEffect(() => {
    if (!isOffline) setFailedPhotoId(null);
  }, [isOffline]);
  const photoId = user?.backgroundPhotoId;
  return (
    <View className="flex-1 min-h-0 bg-canvas dark:bg-canvas-dark">
      {token && photoId && photoId !== failedPhotoId ? (
        <WorkspacePhotoBackdrop
          key={photoId}
          photoId={photoId}
          token={token}
          onError={setFailedPhotoId}
        />
      ) : workspaceAppearance.background === 'landscape' ? (
        <LandscapeBackdrop className="absolute inset-0" />
      ) : null}
      {children}
    </View>
  );
}

export function ListAccentBar() {
  const backgroundColor = useThemeColors()['accent-line'];
  return (
    <View
      accessible={false}
      style={{
        width: 4,
        alignSelf: 'stretch',
        borderRadius: 2,
        backgroundColor,
      }}
    />
  );
}

export function ListIdentityBadge({
  icon,
  size = 'md',
}: {
  icon?: ListIcon | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const boxClass =
    size === 'sm'
      ? 'w-7 h-7 rounded-lg'
      : size === 'lg'
        ? 'w-12 h-12 rounded-2xl'
        : 'w-9 h-9 rounded-xl';
  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 28 : 20;

  return (
    <View className="flex-row items-center gap-2 shrink-0">
      <ListAccentBar />
      <View
        className={[
          boxClass,
          'items-center justify-center overflow-hidden border border-line dark:border-line-dark',
          'bg-accent-tint dark:bg-accent-tint-dark',
        ].join(' ')}
      >
        <Emoji symbol={listIconEmoji(icon)} size={iconSize} />
      </View>
    </View>
  );
}
