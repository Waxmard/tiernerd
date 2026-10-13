import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  type TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input } from '../design-system/components';
import { AppColors, AppSpacing, AppTypography } from '../design-system/tokens';
import type { RootStackScreenProps } from '../navigation/types';
import { useAuth } from '../providers/AuthContext';

type RegisterScreenProps = RootStackScreenProps<'Register'>;

export const RegisterScreen: React.FC<RegisterScreenProps> = ({
  navigation,
}) => {
  const { width } = useWindowDimensions();
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
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              width >= 1024 && styles.desktopScrollContent,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={false}
          >
            <View style={styles.content}>
              <View style={styles.logoContainer}>
                <Image
                  source={require('../../assets/logo-transparent.png')}
                  style={styles.logo}
                  resizeMode="contain"
                  accessible={false}
                />
              </View>
              <View style={styles.formContainer} collapsable={false}>
                <Text style={styles.formTitle} accessibilityRole="header">
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
                      color={AppColors.neutral[600]}
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
                      color={AppColors.neutral[600]}
                    />
                  }
                  rightIcon={
                    <Ionicons
                      accessible={false}
                      name={passwordVisible ? 'eye-outline' : 'eye-off-outline'}
                      size={20}
                      color={AppColors.neutral[600]}
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
                      color={AppColors.neutral[600]}
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
                      color={AppColors.neutral[600]}
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
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText} accessibilityRole="alert">
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
                  style={styles.registerButton}
                />
                {googleAvailable && (
                  <>
                    <View style={styles.divider}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>OR</Text>
                      <View style={styles.dividerLine} />
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
                          style={styles.googleIcon}
                          accessible={false}
                        />
                      }
                    />
                  </>
                )}
                <View style={styles.loginContainer}>
                  <Text style={styles.loginText}>
                    Already have an account?{' '}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Log in"
                    activeOpacity={0.7}
                    style={styles.linkTarget}
                    onPress={navigateToLogin}
                  >
                    <Text style={styles.loginLink}>Log In</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.dominant.secondary,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingHorizontal: AppSpacing.md,
    paddingTop: AppSpacing.lg,
  },
  desktopScrollContent: {
    paddingTop: AppSpacing.xxxl,
  },
  content: {
    flexGrow: 1,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: AppSpacing.md,
  },
  logo: {
    width: 48,
    height: 48,
  },
  formTitle: {
    ...AppTypography.titleLarge,
    color: AppColors.secondary.emphasis,
    textAlign: 'left',
    marginBottom: AppSpacing.md,
  },
  formContainer: {
    width: '100%',
  },
  registerButton: {
    marginTop: AppSpacing.md,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: AppSpacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: AppColors.neutral[300],
  },
  dividerText: {
    ...AppTypography.labelSmall,
    color: AppColors.textSecondary,
    marginHorizontal: AppSpacing.md,
  },
  googleIcon: {
    width: 20,
    height: 20,
  },
  loginContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: AppSpacing.md,
  },
  linkTarget: {
    minHeight: 44,
    justifyContent: 'center',
  },
  loginText: {
    ...AppTypography.bodyMedium,
    color: AppColors.textSecondary,
  },
  loginLink: {
    ...AppTypography.bodyMedium,
    color: AppColors.accent.dark,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  errorContainer: {
    marginTop: AppSpacing.md,
    padding: AppSpacing.md,
    backgroundColor: AppColors.error,
    borderRadius: AppSpacing.sm,
  },
  errorText: {
    ...AppTypography.bodySmall,
    color: AppColors.textOnPrimary,
    textAlign: 'center',
  },
});
