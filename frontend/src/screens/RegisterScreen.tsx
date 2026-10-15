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

type RegisterScreenProps = RootStackScreenProps<'Register'>;

export const RegisterScreen: React.FC<RegisterScreenProps> = ({
  navigation,
}) => {
  const colors = useThemeColors();
  const { register, signInWithGoogle, googleAvailable, isLoading, error } =
    useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [confirmPasswordRequiredError, setConfirmPasswordRequiredError] =
    useState<string>();
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);
  const confirmPasswordMismatch =
    confirmPassword.length > 0 && password !== confirmPassword
      ? 'Passwords do not match'
      : undefined;
  const confirmPasswordError =
    confirmPasswordRequiredError ?? confirmPasswordMismatch;

  const handleRegister = async () => {
    if (isLoading) return;
    const nextEmailError = email.trim() ? undefined : 'Email is required';
    const nextPasswordError = password ? undefined : 'Password is required';
    const nextConfirmPasswordError = !confirmPassword
      ? 'Confirm Password is required'
      : undefined;
    const passwordsMismatch = password !== confirmPassword;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setConfirmPasswordRequiredError(nextConfirmPasswordError);
    if (
      nextEmailError ||
      nextPasswordError ||
      nextConfirmPasswordError ||
      passwordsMismatch
    ) {
      if (nextEmailError) emailInputRef.current?.focus();
      else if (nextPasswordError) passwordInputRef.current?.focus();
      else confirmPasswordInputRef.current?.focus();
      return;
    }
    await register(email.trim(), password);
  };

  const navigateToLogin = () => {
    navigation?.navigate('Login');
  };

  return (
    <View className="flex-1 min-h-0 bg-canvas dark:bg-canvas-dark">
      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView
            contentContainerClassName="grow w-full max-w-[420px] self-center px-4 pt-6 desktop:pt-12"
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={false}
          >
            <View className="grow">
              <View className="items-center mb-4">
                <Image
                  source={require('../../assets/logo-transparent.png')}
                  className="w-12 h-12"
                  resizeMode="contain"
                  accessible={false}
                />
              </View>
              <View className="w-full" collapsable={false}>
                <Text
                  className="text-title-large text-ink dark:text-ink-dark text-left mb-4"
                  accessibilityRole="header"
                >
                  Create Account
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
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="next"
                  onSubmitEditing={() =>
                    confirmPasswordInputRef.current?.focus()
                  }
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
                      name={passwordVisible ? 'eye-outline' : 'eye-off-outline'}
                      size={20}
                      color={colors['ink-muted']}
                    />
                  }
                  rightIconAccessibilityLabel={
                    passwordVisible ? 'Hide password' : 'Show password'
                  }
                  onRightIconPress={() => setPasswordVisible(!passwordVisible)}
                />
                <Input
                  label="Confirm Password"
                  ref={confirmPasswordInputRef}
                  value={confirmPassword}
                  onChangeText={(value) => {
                    setConfirmPassword(value);
                    if (value) setConfirmPasswordRequiredError(undefined);
                  }}
                  error={confirmPasswordError}
                  placeholder="••••••••"
                  secureTextEntry={!confirmPasswordVisible}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
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
                        confirmPasswordVisible
                          ? 'eye-outline'
                          : 'eye-off-outline'
                      }
                      size={20}
                      color={colors['ink-muted']}
                    />
                  }
                  rightIconAccessibilityLabel={
                    confirmPasswordVisible
                      ? 'Hide confirm password'
                      : 'Show confirm password'
                  }
                  onRightIconPress={() =>
                    setConfirmPasswordVisible(!confirmPasswordVisible)
                  }
                />
                {error && (
                  <View className="mt-4 p-4 bg-danger-text dark:bg-danger-text-dark rounded-lg">
                    <Text
                      className="text-body-small text-on-accent dark:text-canvas text-center"
                      accessibilityRole="alert"
                    >
                      {error}
                    </Text>
                  </View>
                )}
                <Button
                  title="Create Account"
                  onPress={handleRegister}
                  size="large"
                  fullWidth
                  loading={isLoading}
                  className="mt-4"
                />
                {googleAvailable && (
                  <>
                    <View className="flex-row items-center my-4">
                      <View className="flex-1 h-px bg-line dark:bg-line-dark" />
                      <Text className="text-label-small text-ink-muted dark:text-ink-muted-dark mx-4">
                        OR
                      </Text>
                      <View className="flex-1 h-px bg-line dark:bg-line-dark" />
                    </View>
                    <Button
                      title="Sign up with Google"
                      accessibilityLabel="Sign up with Google"
                      onPress={signInWithGoogle}
                      variant="secondary"
                      size="large"
                      fullWidth
                      loading={isLoading}
                      icon={
                        <Image
                          source={require('../../assets/google-logo.png')}
                          className="w-5 h-5"
                          accessible={false}
                        />
                      }
                    />
                  </>
                )}
                <View className="flex-row items-center justify-center mt-4">
                  <Text className="text-body-medium text-ink-muted dark:text-ink-muted-dark">
                    Already have an account?{' '}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Log in"
                    activeOpacity={0.7}
                    className="min-h-[44px] justify-center"
                    onPress={navigateToLogin}
                  >
                    <Text className="text-body-medium text-accent-text dark:text-accent-text-dark font-semibold underline">
                      Log In
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};
