import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import type React from 'react';
import { useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackScreenProps } from '../navigation/types';
import { useAuth } from '../providers/AuthContext';
import { useTheme, useThemeColors } from '../providers/ThemeProvider';
import type { ThemePreference } from '../services/themePreference';

type ProfileScreenProps = RootStackScreenProps<'Profile'>;

const THEME_OPTIONS = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
] as const satisfies ReadonlyArray<{ label: string; value: ThemePreference }>;

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const { user, signOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const colors = useThemeColors();
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);

  const handleSignOut = async () => {
    await signOut();
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <View className="flex-1 min-h-0 bg-canvas dark:bg-canvas-dark">
      <SafeAreaView
        className={`flex-1${Platform.OS === 'web' ? ' web-safe-area-top' : ''}`}
      >
        <ScrollView
          contentContainerClassName="w-full grow"
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full max-w-[560px] self-center px-4 pb-4">
            <View className="flex-row items-center justify-between py-4 mb-4">
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
                  <Ionicons
                    name="person"
                    size={22}
                    color={colors['ink-muted']}
                    accessible={false}
                  />
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
              <Text className="text-label-medium text-ink-muted dark:text-ink-muted-dark uppercase mb-2">
                Account
              </Text>
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
              <Text className="text-label-medium text-ink-muted dark:text-ink-muted-dark uppercase mb-2">
                Appearance
              </Text>
              <View className="flex-row gap-2">
                {THEME_OPTIONS.map((option) => {
                  const selected = preference === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityLabel={option.label}
                      accessibilityState={{ selected }}
                      aria-pressed={selected}
                      testID={`theme-${option.value}`}
                      onPress={() => setPreference(option.value)}
                      className={[
                        'flex-1 min-h-[44px] flex-row items-center justify-center gap-1 border rounded-[10px] px-3 py-2',
                        selected
                          ? 'bg-accent-tint dark:bg-accent-tint-dark border-accent dark:border-accent-dark'
                          : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark',
                      ].join(' ')}
                    >
                      {selected ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color={colors['accent-text']}
                          accessible={false}
                        />
                      ) : null}
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
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              className="flex-row items-center justify-between min-h-[48px] bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-[10px] py-3 px-4"
              onPress={handleSignOut}
              activeOpacity={0.8}
            >
              <Ionicons
                name="log-out-outline"
                size={20}
                color={colors.ink}
                accessible={false}
              />
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
    </View>
  );
};
