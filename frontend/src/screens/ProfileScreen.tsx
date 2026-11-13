import { Ionicons } from '@expo/vector-icons';
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
import { ImmersiveScreenShell } from '../components/ImmersiveBoard';
import { Emoji, SectionLabel } from '../design-system/components';
import type { RootStackScreenProps } from '../navigation/types';
import { useAuth } from '../providers/AuthContext';
import { useNotify } from '../providers/NotificationProvider';
import { useTheme, useThemeColors } from '../providers/ThemeProvider';
import { ApiError, getApiErrorMessage } from '../services/apiError';
import { authService } from '../services/authService';
import { pickLocalPhoto } from '../services/photoPicker';
import type { ThemePreference } from '../services/themePreference';
import { confirmDestructive } from '../utils/confirm';

type ProfileScreenProps = RootStackScreenProps<'Profile'>;

const BACKGROUND_OPTIONS = [
  { label: 'Built-in landscape', value: 'landscape', emoji: '🏞️' },
  { label: 'Solid canvas', value: 'none', emoji: '⬜' },
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

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
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

  const chooseBuiltInBackground = async (background: 'landscape' | 'none') => {
    if (
      hasPhoto &&
      !(await confirmDestructive(
        'Remove background photo?',
        'Your uploaded photo will be deleted.',
        'Remove'
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
      <SafeAreaView className="flex-1">
        <ScrollView
          contentContainerClassName="w-full grow"
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full max-w-[560px] self-center px-4 pb-4">
            <View className="flex-row items-center justify-between py-2 px-2 my-3 rounded-2xl border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={handleBack}
                className="min-w-[44px] min-h-[44px] justify-center items-center"
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="chevron-back"
                  size={28}
                  color={colors.ink}
                  accessible={false}
                />
              </TouchableOpacity>
              <Text
                className="text-headline-small font-semibold text-ink dark:text-ink-dark"
                accessibilityRole="header"
              >
                Profile
              </Text>
              <View className="w-11 h-11" />
            </View>

            <View className="flex-row items-center gap-4 mb-4">
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
                <View className="w-11 h-11 rounded-full bg-surface dark:bg-surface-dark items-center justify-center border border-line dark:border-line-dark">
                  <Emoji symbol="👤" size={22} />
                </View>
              )}
              <View className="flex-1 min-w-0">
                <Text className="text-title-medium text-ink dark:text-ink-dark shrink">
                  {user?.displayName || user?.email?.split('@')[0] || 'User'}
                </Text>
                <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark mt-1">
                  TierNerd account
                </Text>
              </View>
            </View>

            <View className="mb-4">
              <SectionLabel emoji="👤" label="Account" className="mb-2" />
              <View className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-4 gap-1">
                <Text className="text-label-medium text-ink dark:text-ink-dark">
                  Email address
                </Text>
                <Text className="text-body-medium text-ink-muted dark:text-ink-muted-dark shrink">
                  {user?.email || 'No email'}
                </Text>
              </View>
            </View>

            <View className="mb-4">
              <SectionLabel emoji="🎨" label="Appearance" className="mb-2" />
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
                          ? 'bg-accent-tint dark:bg-accent-tint-dark border-accent dark:border-accent-dark'
                          : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark',
                      ].join(' ')}
                    >
                      <Emoji symbol={option.emoji} size={16} />
                      <Text
                        className={[
                          'text-label-large',
                          selected
                            ? 'text-accent-text dark:text-accent-text-dark'
                            : 'text-ink-muted dark:text-ink-muted-dark',
                        ].join(' ')}
                      >
                        {option.label}
                      </Text>
                      {selected ? (
                        <Text
                          accessible={false}
                          className="text-label-large text-accent-text dark:text-accent-text-dark"
                        >
                          ✓
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              <SectionLabel
                emoji="🏞️"
                label="Workspace background"
                className="mt-4 mb-2"
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
                          ? 'bg-accent-tint dark:bg-accent-tint-dark border-accent dark:border-accent-dark'
                          : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark',
                        backgroundBusy ? 'opacity-60' : '',
                      ].join(' ')}
                    >
                      {busyBackground === option.value ? (
                        <ActivityIndicator size="small" color={colors.accent} />
                      ) : (
                        <Emoji symbol={option.emoji} size={16} />
                      )}
                      <Text
                        className={[
                          'text-label-large',
                          selected
                            ? 'text-accent-text dark:text-accent-text-dark'
                            : 'text-ink-muted dark:text-ink-muted-dark',
                        ].join(' ')}
                      >
                        {option.label}
                      </Text>
                      {selected ? (
                        <Text
                          accessible={false}
                          className="text-label-large text-accent-text dark:text-accent-text-dark"
                        >
                          ✓
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              {hasPhoto ? (
                <Text className="mt-2 text-body-small text-ink-muted dark:text-ink-muted-dark">
                  Choosing another background removes your photo.
                </Text>
              ) : null}
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              className="flex-row items-center justify-between min-h-[48px] bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-[10px] py-3 px-4"
              onPress={handleSignOut}
              activeOpacity={0.8}
            >
              <Emoji symbol="👋" size={20} />
              <Text className="text-label-large text-ink dark:text-ink-dark font-semibold flex-1 ml-4">
                Sign Out
              </Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors['ink-muted']}
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
