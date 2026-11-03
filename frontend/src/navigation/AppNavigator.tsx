import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type InitialState,
  NavigationContainer,
} from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import type React from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '../providers/AuthContext';
import { useThemeColors } from '../providers/ThemeProvider';
import { HomeScreen } from '../screens/HomeScreen';
import { ListDetailScreen } from '../screens/ListDetailScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import {
  buildNavSnapshot,
  parseNavSnapshot,
  restoreNavKey,
} from '../services/sessionRestore';
import type { RootStackParamList } from './types';

const Stack = createStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const { user, isRestoring } = useAuth();
  const colors = useThemeColors();

  const [restored, setRestored] = useState<{
    userId: string | null;
    state?: InitialState;
  } | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (isRestoring) return;
    if (!userId) {
      setRestored({ userId: null });
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem(restoreNavKey(userId))
      .catch(() => null)
      .then((raw) => {
        if (!cancelled) {
          setRestored({
            userId,
            state: parseNavSnapshot(raw, Date.now()) as InitialState,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, isRestoring]);

  if (isRestoring || restored?.userId !== userId) {
    return (
      <View className="flex-1 items-center justify-center bg-surface dark:bg-surface-dark">
        <ActivityIndicator size="large" color={colors.accent} />
        <Text
          accessibilityLiveRegion="polite"
          className="text-body-medium text-ink-muted dark:text-ink-muted-dark mt-4"
        >
          Loading your session…
        </Text>
      </View>
    );
  }

  return (
    <NavigationContainer
      key={userId ?? 'anon'}
      initialState={restored.state}
      onStateChange={(state) => {
        if (userId && state) {
          AsyncStorage.setItem(
            restoreNavKey(userId),
            buildNavSnapshot(state, Date.now())
          ).catch(() => {});
        }
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        {user ? (
          <>
            <Stack.Screen name="Main" component={HomeScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="ListDetail" component={ListDetailScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
