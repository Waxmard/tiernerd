import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
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

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Validation
  const passwordsMatch = password === confirmPassword;
  const passwordError = confirmPassword.length > 0 && !passwordsMatch;
  const canSubmit = email && password && confirmPassword && passwordsMatch;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleGoogleSignUp = async () => {
    console.log('Google sign up initiated');
    const success = await signInWithGoogle();
    if (success) {
      console.log('Sign up successful - navigation will happen automatically');
    }
  };

  const handleRegister = async () => {
    if (!canSubmit) return;

    console.log('Registration initiated');
    const success = await register(email, password);
    if (success) {
      console.log(
        'Registration successful - navigation will happen automatically'
      );
    }
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
            <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
              {/* Logo */}
              <View style={styles.logoContainer}>
                <Image
                  source={require('../../assets/logo-transparent.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>

              {/* Register form */}
              <View style={styles.formContainer} collapsable={false}>
                <Text style={styles.formTitle}>Create Account</Text>
                <View style={styles.titleDivider} />

                <Input
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="name@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  leftIcon={
                    <Ionicons
                      name="mail-outline"
                      size={20}
                      color={AppColors.neutral[600]}
                    />
                  }
                />

                <Input
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  secureTextEntry={!passwordVisible}
                  leftIcon={
                    <Ionicons
                      name="lock-closed-outline"
                      size={20}
                      color={AppColors.neutral[600]}
                    />
                  }
                  rightIcon={
                    <Ionicons
                      name={passwordVisible ? 'eye-outline' : 'eye-off-outline'}
                      size={20}
                      color={AppColors.neutral[600]}
                    />
                  }
                  onRightIconPress={() => setPasswordVisible(!passwordVisible)}
                />

                <Input
                  label="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="••••••••"
                  secureTextEntry={!confirmPasswordVisible}
                  leftIcon={
                    <Ionicons
                      name="lock-closed-outline"
                      size={20}
                      color={AppColors.neutral[600]}
                    />
                  }
                  rightIcon={
                    <Ionicons
                      name={
                        confirmPasswordVisible
                          ? 'eye-outline'
                          : 'eye-off-outline'
                      }
                      size={20}
                      color={AppColors.neutral[600]}
                    />
                  }
                  onRightIconPress={() =>
                    setConfirmPasswordVisible(!confirmPasswordVisible)
                  }
                />

                {passwordError && (
                  <Text style={styles.passwordError}>
                    Passwords do not match
                  </Text>
                )}

                <Button
                  title="Create Account"
                  onPress={handleRegister}
                  fullWidth
                  loading={isLoading}
                  disabled={!canSubmit}
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
                      onPress={handleGoogleSignUp}
                      disabled={isLoading}
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
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={navigateToLogin}
                  >
                    <Text style={styles.loginLink}>Log In</Text>
                  </TouchableOpacity>
                </View>

                {/* Version */}
                <View style={styles.versionContainer}>
                  <Image
                    source={require('../../assets/logo-transparent.png')}
                    style={styles.versionLogo}
                    resizeMode="contain"
                  />
                  <Text style={styles.version}>v1.0.0 • Tier Nerd</Text>
                </View>
              </View>

              {error && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
            </Animated.View>
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
    backgroundColor: AppColors.primary,
  },
  passwordError: {
    ...AppTypography.bodySmall,
    color: AppColors.error,
    marginTop: AppSpacing.xs,
    marginBottom: AppSpacing.sm,
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
    color: AppColors.primary,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  versionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: AppSpacing.md,
  },
  versionLogo: {
    width: 16,
    height: 16,
    marginRight: AppSpacing.xs,
    opacity: 0.3,
  },
  version: {
    ...AppTypography.labelSmall,
    color: AppColors.textSecondary,
    opacity: 0.5,
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
