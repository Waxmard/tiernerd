import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  type TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input } from '../design-system/components';
import type { RootStackScreenProps } from '../navigation/types';
import { useAuth } from '../providers/AuthContext';
import { useThemeColors } from '../providers/ThemeProvider';

type LoginScreenProps = RootStackScreenProps<'Login'>;

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const colors = useThemeColors();
  const { signIn, signInWithGoogle, googleAvailable, isLoading, error } =
    useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  const handleEmailSignIn = async () => {
    if (isLoading) return;
    const nextEmailError = email.trim() ? undefined : 'Email is required';
    const nextPasswordError = password ? undefined : 'Password is required';
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) {
      if (nextEmailError) emailInputRef.current?.focus();
      else passwordInputRef.current?.focus();
      return;
    }
    await signIn(email.trim(), password);
  };

  const navigateToRegister = () => {
    navigation?.navigate('Register');
  };

  return (
    <View className="flex-1 min-h-0 bg-canvas dark:bg-canvas-dark">
      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView
            contentContainerClassName="grow w-full items-center justify-center px-4 py-4"
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={false}
          >
            <View className="w-full max-w-[420px] rounded-2xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark p-5">
              <View className="gap-4">
                <View className="items-center">
                  <Ionicons
                    name="layers-outline"
                    size={32}
                    color={colors.ink}
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
                  <Input
                    label="Email"
                    ref={emailInputRef}
                    value={email}
                    onChangeText={(value) => {
                      setEmail(value);
                      if (value.trim()) setEmailError(undefined);
                    }}
                    error={emailError}
                    placeholder="name@example.com"
                    keyboardType="email-address"
                    autoComplete="email"
                    textContentType="emailAddress"
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    returnKeyType="next"
                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                    leftIcon={
                      <Ionicons
                        accessible={false}
                        name="mail-outline"
                        size={20}
                        color={colors['ink-muted']}
                      />
                    }
                    containerClassName="!mb-0"
                  />
                  <Input
                    label="Password"
                    ref={passwordInputRef}
                    value={password}
                    onChangeText={(value) => {
                      setPassword(value);
                      if (value) setPasswordError(undefined);
                    }}
                    error={passwordError}
                    placeholder="••••••••"
                    secureTextEntry={!passwordVisible}
                    autoComplete="current-password"
                    textContentType="password"
                    returnKeyType="done"
                    onSubmitEditing={handleEmailSignIn}
                    leftIcon={
                      <Ionicons
                        accessible={false}
                        name="lock-closed-outline"
                        size={20}
                        color={colors['ink-muted']}
                      />
                    }
                    rightIcon={
                      <Ionicons
                        accessible={false}
                        name={
                          passwordVisible ? 'eye-outline' : 'eye-off-outline'
                        }
                        size={20}
                        color={colors['ink-muted']}
                      />
                    }
                    rightIconAccessibilityLabel={
                      passwordVisible ? 'Hide password' : 'Show password'
                    }
                    onRightIconPress={() =>
                      setPasswordVisible(!passwordVisible)
                    }
                    containerClassName="!mb-0"
                  />
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
                  <Button
                    title="Log In"
                    onPress={handleEmailSignIn}
                    size="large"
                    fullWidth
                    loading={isLoading}
                  />
                  {googleAvailable && (
                    <>
                      <View className="flex-row items-center my-0">
                        <View className="flex-1 h-px bg-line dark:bg-line-dark" />
                        <Text className="text-label-small text-ink-muted dark:text-ink-muted-dark mx-4">
                          OR
                        </Text>
                        <View className="flex-1 h-px bg-line dark:bg-line-dark" />
                      </View>
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
                    </>
                  )}
                  <View className="flex-row items-center justify-center -mt-1">
                    <Text className="text-body-medium text-ink-muted dark:text-ink-muted-dark">
                      Don't have an account?{' '}
                    </Text>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Sign Up"
                      activeOpacity={0.7}
                      className="min-h-[44px] justify-center"
                      onPress={navigateToRegister}
                    >
                      <Text className="text-body-medium text-accent-text dark:text-accent-text-dark font-semibold underline">
                        Sign Up
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};
