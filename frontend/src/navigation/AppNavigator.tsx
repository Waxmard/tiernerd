import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import type React from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { useAuth } from '../providers/AuthContext';
import { useThemeColors } from '../providers/ThemeProvider';
import { HomeScreen } from '../screens/HomeScreen';
import { ListDetailScreen } from '../screens/ListDetailScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import type { RootStackParamList } from './types';

const Stack = createStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const { user, isRestoring } = useAuth();
  const colors = useThemeColors();

  if (isRestoring) {
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
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyle: Platform.OS === 'web' ? { flex: 1 } : undefined,
        }}
      >
        {user ? (
          <>
            <Stack.Screen name="Main" component={HomeScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="ListDetail" component={ListDetailScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
