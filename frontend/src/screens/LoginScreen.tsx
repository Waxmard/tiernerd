import type React from 'react';
import { Image, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../design-system/components';
import { useAuth } from '../providers/AuthContext';

export const LoginScreen: React.FC = () => {
  const { signInWithGoogle, googleAvailable, isLoading, error } = useAuth();

  return (
    <View className="flex-1 min-h-0 bg-canvas dark:bg-canvas-dark">
      <SafeAreaView
        className={`flex-1${Platform.OS === 'web' ? ' web-safe-area-top' : ''}`}
      >
        <ScrollView
          contentContainerClassName="grow w-full items-center justify-center px-4 py-4"
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
        >
          <View className="w-full max-w-[420px] rounded-2xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark p-5">
            <View className="gap-4">
              <View className="items-center">
                <Image
                  source={require('../../assets/brand-mark.png')}
                  resizeMode="contain"
                  style={{ width: 48, height: 48, borderRadius: 12 }}
                  accessible={false}
                />
              </View>
              <View className="w-full gap-4" collapsable={false}>
                <Text
                  className="text-title-large text-ink dark:text-ink-dark"
                  accessibilityRole="header"
                >
                  TierNerd
                </Text>
                {error && (
                  <View className="border border-danger-text dark:border-danger-text-dark bg-surface-muted dark:bg-surface-muted-dark rounded-lg p-4">
                    <Text
                      className="text-body-small text-danger-text dark:text-danger-text-dark text-center"
                      accessibilityRole="alert"
                    >
                      {error}
                    </Text>
                  </View>
                )}
                {googleAvailable ? (
                  <Button
                    title="Sign in with Google"
                    accessibilityLabel="Sign in with Google"
                    onPress={signInWithGoogle}
                    variant="secondary"
                    size="large"
                    fullWidth
                    loading={isLoading}
                    icon={
                      <Image
                        source={require('../../assets/google-logo.png')}
                        style={{ width: 20, height: 20 }}
                        accessible={false}
                      />
                    }
                  />
                ) : (
                  <Text className="text-body-medium text-ink-muted dark:text-ink-muted-dark">
                    {Platform.OS === 'android'
                      ? 'Sign-in is available in the TierNerd web app.'
                      : 'Google sign-in is not configured.'}
                  </Text>
                )}
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};
