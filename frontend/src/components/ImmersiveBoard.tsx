import { Ionicons } from '@expo/vector-icons';
import MaskedViewNative from '@react-native-masked-view/masked-view';
import {
  type ComponentType,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Image,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  TouchableOpacity,
  View,
  type ViewProps,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Emoji } from '../design-system/components';
import type { ListIcon } from '../design-system/tokens/colors';
import { useAuth } from '../providers/AuthContext';
import { useSync } from '../providers/SyncProvider';
import { useTheme } from '../providers/ThemeProvider';
import { listIconEmoji } from '../services/listIcon';
import { SceneBackdrop } from './SceneBackdrop';
import { WorkspacePhotoBackdrop } from './WorkspacePhotoBackdrop';

const MaskedView = MaskedViewNative as unknown as ComponentType<
  ViewProps & { maskElement: ReactElement }
>;

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
      <View
        pointerEvents="none"
        className="absolute inset-0 bg-canvas dark:bg-canvas-dark"
        style={{ opacity: 1 - workspaceAppearance.backgroundOpacity }}
      />
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

export function NavProfileButton({ onPress }: { onPress: () => void }) {
  const { user } = useAuth();
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  return (
    <TouchableOpacity
      onPress={onPress}
      className="w-11 h-11 ml-2 mr-2 shrink-0 rounded-full overflow-hidden bg-surface dark:bg-surface-dark border border-accent-line dark:border-accent-line-dark"
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

export const FLOATING_ACTIONS_CLEARANCE = 72;
const FLOATING_SHADOW = '0px 4px 12px 0px rgba(10, 24, 48, 0.28)';

export function ListBottomFade({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <MaskedView
      style={{ flex: 1, minHeight: 0 }}
      maskElement={
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: '#000000' }} />
          <View
            style={{
              height: 8 + FLOATING_ACTIONS_CLEARANCE,
              backgroundImage:
                'linear-gradient(180deg, #000000 0%, #00000000 100%)',
            }}
          />
          <View style={{ height: 8 + insets.bottom }} />
        </View>
      }
    >
      {children}
    </MaskedView>
  );
}

interface FloatingOption {
  label: string;
  emoji?: string;
  onPress: () => void;
  disabled?: boolean;
}

export function FloatingActions({
  label,
  options,
  loading = false,
}: {
  label: string;
  options: FloatingOption[];
  loading?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const inactive = loading || options.every((option) => option.disabled);
  useEffect(() => {
    if (inactive) setOpen(false);
  }, [inactive]);
  return (
    <View
      pointerEvents="box-none"
      accessibilityViewIsModal={open}
      className="absolute inset-0 items-center justify-end"
      style={{ paddingBottom: 8 + insets.bottom }}
    >
      {open ? (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(150)}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => setOpen(false)}
            className="flex-1 bg-black/30"
          />
        </Animated.View>
      ) : null}
      <View
        pointerEvents="box-none"
        className="mb-3 flex-col-reverse items-center gap-2"
      >
        {open
          ? options.map((option, index) => (
              <Animated.View
                key={option.label}
                entering={FadeInDown.duration(180).delay(index * 40)}
                exiting={FadeOutDown.duration(120)}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ disabled: option.disabled ?? false }}
                  disabled={option.disabled}
                  onPress={() => {
                    setOpen(false);
                    option.onPress();
                  }}
                  className="min-h-[56px] flex-row items-center gap-2.5 rounded-full bg-surface dark:bg-surface-dark px-6"
                  style={({ pressed }) => ({
                    boxShadow: FLOATING_SHADOW,
                    opacity: option.disabled ? 0.5 : pressed ? 0.7 : 1,
                  })}
                >
                  {option.emoji ? (
                    <Emoji symbol={option.emoji} size={22} />
                  ) : (
                    <Ionicons
                      name="add"
                      size={24}
                      color={colors.ink}
                      accessible={false}
                    />
                  )}
                  <Text className="font-display font-semibold text-[18px] leading-7 text-ink dark:text-ink-dark">
                    {option.label}
                  </Text>
                </Pressable>
              </Animated.View>
            ))
          : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? 'Close' : label}
        accessibilityState={{
          disabled: inactive,
          busy: loading,
          expanded: open,
        }}
        disabled={inactive}
        onPress={() => setOpen((value) => !value)}
        className="w-[64px] h-[64px] items-center justify-center rounded-full bg-ink/80 dark:bg-ink-dark/80"
        style={({ pressed }) => ({
          boxShadow: FLOATING_SHADOW,
          opacity: inactive && !loading ? 0.5 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        })}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.surface} />
        ) : (
          <Animated.View
            style={{
              transform: [{ rotate: open ? '45deg' : '0deg' }],
              transitionProperty: 'transform',
              transitionDuration: 200,
            }}
          >
            <Ionicons
              name="add"
              size={32}
              color={colors.surface}
              accessible={false}
            />
          </Animated.View>
        )}
      </Pressable>
    </View>
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
