import { Ionicons } from '@expo/vector-icons';
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Image,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Emoji } from '../design-system/components';
import type { ListIcon } from '../design-system/tokens/colors';
import { useAuth } from '../providers/AuthContext';
import { useSync } from '../providers/SyncProvider';
import { useTheme } from '../providers/ThemeProvider';
import { listIconEmoji } from '../services/listIcon';
import { SceneBackdrop } from './SceneBackdrop';
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
      ) : workspaceAppearance.background === 'none' ? null : (
        <SceneBackdrop
          scene={workspaceAppearance.background}
          className="absolute inset-0"
        />
      )}
      {children}
    </View>
  );
}

export function useScrolledPast() {
  const [scrolled, setScrolled] = useState(false);
  const threshold = useRef(72);
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      setScrolled(event.nativeEvent.contentOffset.y > threshold.current),
    []
  );
  const onTitleLayout = useCallback((event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    threshold.current = y + height;
  }, []);
  return { scrolled, onScroll, onTitleLayout };
}

export function ScreenNavBar({
  scrolled,
  maxWidthClass = 'max-w-[1280px]',
  children,
}: {
  scrolled: boolean;
  maxWidthClass?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View className="shrink-0" style={{ paddingTop: insets.top }}>
      {scrolled ? (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(150)}
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: `${colors.canvas}E6`,
            borderBottomWidth: 1,
            borderBottomColor: colors.line,
          }}
        />
      ) : null}
      <View
        className={`w-full ${maxWidthClass} self-center h-11 flex-row items-center px-1`}
      >
        {children}
      </View>
    </View>
  );
}

export function NavBarTitle({
  visible,
  align = 'center',
  children,
}: {
  visible: boolean;
  align?: 'center' | 'left';
  children: string;
}) {
  if (!visible) return <View className="flex-1" />;
  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      style={{ flex: 1, minWidth: 0 }}
    >
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        className={`text-title-small text-ink dark:text-ink-dark ${align === 'center' ? 'text-center' : 'text-left pl-3'}`}
      >
        {children}
      </Text>
    </Animated.View>
  );
}

export function NavBackButton({
  label,
  compact,
  onPress,
}: {
  label: string;
  compact: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
      activeOpacity={0.7}
      className="h-11 flex-row items-center pl-2 pr-3 shrink-0"
    >
      <Ionicons
        name="chevron-back"
        size={24}
        color={colors['ink-muted']}
        accessible={false}
      />
      {compact ? null : (
        <Text className="text-label-large font-semibold text-ink-muted dark:text-ink-muted-dark">
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export function NavIconButton({
  name,
  label,
  onPress,
  disabled = false,
  tone = 'muted',
}: {
  name: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'muted' | 'accent';
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.7}
      className="w-11 h-11 items-center justify-center shrink-0"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Ionicons
        name={name}
        size={24}
        color={tone === 'accent' ? colors.accent : colors['ink-muted']}
        accessible={false}
      />
    </TouchableOpacity>
  );
}

export function NavProfileButton({ onPress }: { onPress: () => void }) {
  const { user } = useAuth();
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  return (
    <TouchableOpacity
      onPress={onPress}
      className="w-10 h-10 ml-2 mr-2 shrink-0 rounded-full overflow-hidden bg-surface dark:bg-surface-dark border border-accent-line dark:border-accent-line-dark"
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
    >
      {user?.photoUrl && user.photoUrl !== failedPhotoUrl ? (
        <Image
          source={{ uri: user.photoUrl }}
          onError={() => setFailedPhotoUrl(user.photoUrl ?? null)}
          resizeMode="cover"
          className="w-full h-full"
          accessible={false}
        />
      ) : (
        <View className="w-full h-full bg-surface dark:bg-surface-dark items-center justify-center">
          <Emoji symbol="👤" size={20} />
        </View>
      )}
    </TouchableOpacity>
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
  const emoji = listIconEmoji(icon);
  if (!emoji) return null;

  return (
    <View
      className={[
        boxClass,
        'shrink-0 items-center justify-center overflow-hidden border border-card-line dark:border-card-line-dark',
        'bg-card-tint dark:bg-card-tint-dark',
      ].join(' ')}
    >
      <Emoji symbol={emoji} size={iconSize} />
    </View>
  );
}
