import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import Constants from 'expo-constants';
import type React from 'react';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ImmersiveScreenShell,
  NavBackButton,
  NavBarTitle,
  ScreenNavBar,
  useScrolledPast,
} from '../components/ImmersiveBoard';
import { Emoji, SectionLabel } from '../design-system/components';
import type { RootStackScreenProps } from '../navigation/types';
import { useAuth } from '../providers/AuthContext';
import { useNotify } from '../providers/NotificationProvider';
import { useTheme, useThemeColors } from '../providers/ThemeProvider';
import { ApiError, getApiErrorMessage } from '../services/apiError';
import { authService } from '../services/authService';
import { pickLocalPhoto } from '../services/photoPicker';
import type {
  ThemePreference,
  WorkspaceBackground,
} from '../services/themePreference';
import { confirmDestructive } from '../utils/confirm';

type ProfileScreenProps = RootStackScreenProps<'Profile'>;

const BACKGROUND_OPTIONS = [
  { label: 'Ridgeline', value: 'landscape', emoji: '🏞️' },
  { label: 'Dusk', value: 'dusk', emoji: '🌇' },
  { label: 'Meadow', value: 'meadow', emoji: '🌿' },
  { label: 'Shore', value: 'shore', emoji: '🏖️' },
  { label: 'Solid', value: 'none', emoji: '⬜' },
  { label: 'My photo', value: 'photo', emoji: '🖼️' },
] as const;

const backgroundErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof ApiError
    ? getApiErrorMessage(error, fallback)
    : error instanceof Error
      ? error.message
      : fallback;

const THEME_OPTIONS = [
  { label: 'System', value: 'system', emoji: '📱' },
  { label: 'Light', value: 'light', emoji: '☀️' },
  { label: 'Dark', value: 'dark', emoji: '🌙' },
] as const satisfies ReadonlyArray<{
  label: string;
  value: ThemePreference;
  emoji: string;
}>;

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  navigation,
  route,
}) => {
  const { user, token, signOut, updateUser } = useAuth();
  const notify = useNotify();
  const {
    preference,
    setPreference,
    workspaceAppearance,
    setWorkspaceAppearance,
  } = useTheme();
  const colors = useThemeColors();
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const [busyBackground, setBusyBackground] = useState<string | null>(null);
  const backgroundBusy = busyBackground !== null;
  const hasPhoto = Boolean(user?.backgroundPhotoId);

  const handleSignOut = async () => {
    await signOut();
  };

  const routes = navigation.getState().routes;
  const cameFromList =
    routes[routes.findIndex((r) => r.key === route.key) - 1]?.name ===
    'ListDetail';

  const handleBack = () => {
    navigation.goBack();
  };

  const runBackgroundChange = async (
    option: string,
    change: (token: string) => Promise<void>,
    fallback: string
  ) => {
    if (backgroundBusy || !token) return;
    setBusyBackground(option);
    try {
      await change(token);
    } catch (error) {
      notify(backgroundErrorMessage(error, fallback), '⚠️');
    } finally {
      setBusyBackground(null);
    }
  };

  const chooseBackgroundPhoto = () =>
    runBackgroundChange(
      'photo',
      async (authToken) => {
        const blob = await pickLocalPhoto();
        if (!blob) return;
        try {
          await updateUser(
            await authService.setBackgroundPhoto(blob, authToken)
          );
        } finally {
          (blob as Blob & { close?: () => void }).close?.();
        }
      },
      'Could not save the background photo. Try again.'
    );

  const nav = useScrolledPast();
  const chooseBuiltInBackground = async (background: WorkspaceBackground) => {
    if (
      hasPhoto &&
      !(await confirmDestructive(
        'Stop using your photo?',
        'It will no longer be your TierNerd background. The original stays in your photo library.',
        'Stop using'
      ))
    )
      return;
    await runBackgroundChange(
      background,
      async (authToken) => {
        if (hasPhoto) {
          await updateUser(await authService.clearBackgroundPhoto(authToken));
        }
        setWorkspaceAppearance({ ...workspaceAppearance, background });
      },
      'Could not remove the background photo. Try again.'
    );
  };

  return (
    <ImmersiveScreenShell>
      <ScreenNavBar scrolled={nav.scrolled} maxWidthClass="max-w-[560px]">
        <NavBackButton
          label={cameFromList ? 'List' : 'Lists'}
          compact={nav.scrolled}
          onPress={handleBack}
        />
        <NavBarTitle visible={nav.scrolled}>Profile</NavBarTitle>
        {nav.scrolled ? <View className="w-11" /> : null}
      </ScreenNavBar>
      <SafeAreaView className="flex-1" edges={['bottom', 'left', 'right']}>
        <ScrollView
          contentContainerClassName="w-full grow"
          onScroll={nav.onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full max-w-[560px] self-center px-4 pb-4 pt-1">
            <Text
              onLayout={nav.onTitleLayout}
              accessibilityRole="header"
              className="mb-4 font-display-bold text-[32px] leading-[38px] tracking-[-0.4px] text-ink dark:text-ink-dark"
            >
              Profile
            </Text>
            <View className="flex-row items-center gap-4 mb-4 bg-card dark:bg-card-dark border border-card-line dark:border-card-line-dark rounded-2xl p-4">
              {user?.photoUrl && user.photoUrl !== failedPhotoUrl ? (
                <Image
                  source={{ uri: user.photoUrl }}
                  onError={() => setFailedPhotoUrl(user.photoUrl ?? null)}
                  resizeMode="cover"
                  className="w-11 h-11 rounded-full"
                  accessibilityLabel={
                    user?.displayName
                      ? `${user.displayName} profile photo`
                      : 'Profile photo'
                  }
                />
              ) : (
                <View className="w-11 h-11 rounded-full bg-card-muted dark:bg-card-muted-dark items-center justify-center border border-card-line dark:border-card-line-dark">
                  <Emoji symbol="👤" size={22} />
                </View>
              )}
              <View className="flex-1 min-w-0">
                <Text className="text-title-medium text-card-ink dark:text-card-ink-dark shrink">
                  {user?.displayName || user?.email?.split('@')[0] || 'User'}
                </Text>
                <Text className="text-body-medium text-card-ink-muted dark:text-card-ink-muted-dark shrink mt-1">
                  {user?.email || 'No email'}
                </Text>
              </View>
            </View>

            <View className="mb-4 bg-card dark:bg-card-dark border border-card-line dark:border-card-line-dark rounded-2xl p-4">
              <SectionLabel
                emoji="🎨"
                label="Appearance"
                className="mb-2"
                onCard
              />
              <View className="flex-row gap-2">
                {THEME_OPTIONS.map((option) => {
                  const selected = preference === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityLabel={option.label}
                      accessibilityState={{ selected }}
                      onPress={() => setPreference(option.value)}
                      className={[
                        'flex-1 min-h-[44px] flex-row items-center justify-center gap-1 border rounded-[10px] px-3 py-2',
                        selected
                          ? 'bg-card-tint dark:bg-card-tint-dark border-card-accent dark:border-card-accent-dark'
                          : 'bg-card dark:bg-card-dark border-card-line dark:border-card-line-dark',
                      ].join(' ')}
                    >
                      <Emoji symbol={option.emoji} size={16} />
                      <Text
                        className={[
                          'text-label-large',
                          selected
                            ? 'text-card-accent dark:text-card-accent-dark'
                            : 'text-card-ink-muted dark:text-card-ink-muted-dark',
                        ].join(' ')}
                      >
                        {option.label}
                      </Text>
                      {selected ? (
                        <Text
                          accessible={false}
                          className="text-label-large text-card-accent dark:text-card-accent-dark"
                        >
                          ✓
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View className="mb-4 bg-card dark:bg-card-dark border border-card-line dark:border-card-line-dark rounded-2xl p-4">
              <SectionLabel
                emoji="🏞️"
                label="Workspace background"
                className="mb-2"
                onCard
              />
              <View className="flex-row flex-wrap gap-2">
                {BACKGROUND_OPTIONS.map((option) => {
                  const selected =
                    option.value === 'photo'
                      ? hasPhoto
                      : !hasPhoto &&
                        workspaceAppearance.background === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityLabel={option.label}
                      accessibilityState={{
                        selected,
                        disabled: backgroundBusy,
                      }}
                      disabled={backgroundBusy}
                      onPress={() =>
                        void (option.value === 'photo'
                          ? chooseBackgroundPhoto()
                          : chooseBuiltInBackground(option.value))
                      }
                      className={[
                        'grow basis-[140px] min-h-[44px] flex-row items-center justify-center gap-1 border rounded-[10px] px-3 py-2',
                        selected
                          ? 'bg-card-tint dark:bg-card-tint-dark border-card-accent dark:border-card-accent-dark'
                          : 'bg-card dark:bg-card-dark border-card-line dark:border-card-line-dark',
                        backgroundBusy ? 'opacity-60' : '',
                      ].join(' ')}
                    >
                      {busyBackground === option.value ? (
                        <ActivityIndicator
                          size="small"
                          color={colors['card-accent']}
                        />
                      ) : (
                        <Emoji symbol={option.emoji} size={16} />
                      )}
                      <Text
                        className={[
                          'text-label-large',
                          selected
                            ? 'text-card-accent dark:text-card-accent-dark'
                            : 'text-card-ink-muted dark:text-card-ink-muted-dark',
                        ].join(' ')}
                      >
                        {option.label}
                      </Text>
                      {selected ? (
                        <Text
                          accessible={false}
                          className="text-label-large text-card-accent dark:text-card-accent-dark"
                        >
                          ✓
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              {hasPhoto ? (
                <Text className="mt-2 text-body-small text-card-ink-muted dark:text-card-ink-muted-dark">
                  Choosing another background stops using your photo. It stays
                  in your photo library.
                </Text>
              ) : null}
            </View>

            {hasPhoto || workspaceAppearance.background !== 'none' ? (
              <View className="mb-4 bg-card dark:bg-card-dark border border-card-line dark:border-card-line-dark rounded-2xl p-4">
                <SectionLabel
                  emoji="🌫️"
                  label="Background opacity"
                  className="mb-2"
                  onCard
                />
                <View className="flex-row items-center gap-3">
                  <Ionicons
                    name="image-outline"
                    size={16}
                    color={colors['card-ink-muted']}
                    accessible={false}
                  />
                  <Slider
                    accessibilityLabel="Background opacity"
                    style={{ flex: 1, height: 40 }}
                    minimumValue={0}
                    maximumValue={100}
                    step={5}
                    value={Math.round(
                      workspaceAppearance.backgroundOpacity * 100
                    )}
                    onValueChange={(percent) =>
                      setWorkspaceAppearance({
                        ...workspaceAppearance,
                        backgroundOpacity: percent / 100,
                      })
                    }
                    minimumTrackTintColor={colors['card-accent']}
                    maximumTrackTintColor={colors['card-ink-muted']}
                  />
                  <Ionicons
                    name="image"
                    size={24}
                    color={colors['card-ink-muted']}
                    accessible={false}
                  />
                </View>
              </View>
            ) : null}

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              className="flex-row items-center justify-between min-h-[48px] bg-card dark:bg-card-dark border border-card-line dark:border-card-line-dark rounded-2xl py-3 px-4"
              onPress={handleSignOut}
              activeOpacity={0.8}
            >
              <Emoji symbol="👋" size={20} />
              <Text className="text-label-large text-card-ink dark:text-card-ink-dark font-semibold flex-1 ml-4">
                Sign Out
              </Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors['card-ink-muted']}
                accessible={false}
              />
            </TouchableOpacity>

            <View className="items-start mt-4">
              <Text className="text-label-small text-ink-muted dark:text-ink-muted-dark">
                {Constants.expoConfig?.version
                  ? `${Constants.expoConfig.version} · `
                  : ''}
                TierNerd
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImmersiveScreenShell>
  );
};
