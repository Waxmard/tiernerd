import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import type React from 'react';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  type TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input } from '../design-system/components';
import {
  AppBorders,
  AppColors,
  AppSpacing,
  AppTypography,
} from '../design-system/tokens';
import type { RootStackScreenProps } from '../navigation/types';
import { useAuth } from '../providers/AuthContext';

type RegisterScreenProps = RootStackScreenProps<'Register'>;

export const RegisterScreen: React.FC<RegisterScreenProps> = ({
  navigation,
}) => {
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
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={false}
          >
            <View style={styles.content}>
              {/* Logo */}
              <View style={styles.logoContainer}>
                <Image
                  source={require('../../assets/logo-transparent.png')}
                  style={styles.logo}
                  resizeMode="contain"
                  accessible={false}
                />
              </View>

              {/* Register form */}
              <View style={styles.formContainer} collapsable={false}>
                <Text style={styles.formTitle} accessibilityRole="header">
                  Create Account
                </Text>
                <View style={styles.titleDivider} />

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
                  fullWidth
                  loading={isLoading}
                  style={styles.registerButton}
                />

                {googleAvailable && (
                  <>
                    {/* Divider */}
                    <View style={styles.divider}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>OR</Text>
                      <View style={styles.dividerLine} />
                    </View>

                    {/* Google Sign Up */}
                    <TouchableOpacity
                      style={styles.googleButton}
                      onPress={signInWithGoogle}
                      disabled={isLoading}
                      accessibilityRole="button"
                      accessibilityLabel="Sign up with Google"
                      activeOpacity={0.8}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      {isLoading ? (
                        <ActivityIndicator
                          color={AppColors.secondary.primary}
                        />
                      ) : (
                        <>
                          <Image
                            source={require('../../assets/google-logo.png')}
                            style={styles.googleIcon}
                            accessible={false}
                          />
                          <Text style={styles.googleButtonText}>
                            Sign up with Google
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                )}

                {/* Login link */}
                <View style={styles.loginContainer}>
                  <Text style={styles.loginText}>
                    Already have an account?{' '}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Log in"
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={navigateToLogin}
                  >
                    <Text style={styles.loginLink}>Log In</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.versionContainer}>
                  <Text style={styles.version}>
                    {Constants.expoConfig?.version
                      ? `${Constants.expoConfig.version} · `
                      : ''}
                    TierNerd
                  </Text>
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
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: AppSpacing.lg,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: AppSpacing.xs,
    paddingTop: AppSpacing.sm,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: AppSpacing.sm,
  },
  logo: {
    width: 80,
    height: 80,
  },
  formTitle: {
    ...AppTypography.brandTitle,
    color: AppColors.secondary.emphasis,
    textAlign: 'center',
    marginBottom: AppSpacing.md,
  },
  titleDivider: {
    height: 1,
    backgroundColor: AppColors.neutral[200],
    marginBottom: AppSpacing.lg,
  },
  formContainer: {
    backgroundColor: AppColors.dominant.primary,
    borderRadius: AppBorders.radiusLg,
    padding: AppSpacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  registerButton: {
    marginTop: AppSpacing.md,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: AppSpacing.lg,
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
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.neutral[300],
    borderRadius: AppBorders.radiusMd,
    paddingVertical: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
  },
  googleIcon: {
    width: 24,
    height: 24,
    marginRight: AppSpacing.sm,
  },
  googleButtonText: {
    ...AppTypography.labelLarge,
    color: AppColors.textPrimary,
    fontWeight: '500',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: AppSpacing.lg,
    paddingTop: AppSpacing.md,
    borderTopWidth: 1,
    borderTopColor: AppColors.neutral[200],
  },
  loginText: {
    ...AppTypography.bodyMedium,
    color: AppColors.textSecondary,
  },
  loginLink: {
    ...AppTypography.bodyMedium,
    color: AppColors.accent.dark,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  versionContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: AppSpacing.md,
  },
  version: {
    ...AppTypography.labelSmall,
    color: AppColors.textSecondary,
    fontSize: 12,
  },
  errorContainer: {
    marginTop: AppSpacing.md,
    padding: AppSpacing.md,
    backgroundColor: AppColors.error,
    borderRadius: AppBorders.radiusMd,
  },
  errorText: {
    ...AppTypography.bodySmall,
    color: AppColors.textOnPrimary,
    textAlign: 'center',
  },
});
