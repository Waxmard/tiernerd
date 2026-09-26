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

type LoginScreenProps = RootStackScreenProps<'Login'>;

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const { signIn, signInWithGoogle, googleAvailable, isLoading, error } =
    useAuth();

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleGoogleSignIn = async () => {
    console.log('Google sign in initiated'); // Debug log
    const success = await signInWithGoogle();
    if (success) {
      console.log('Sign in successful - navigation will happen automatically'); // Debug log
      // Navigation happens automatically when user state changes
    }
  };

  const handleEmailSignIn = async () => {
    if (!email || !password) return;

    console.log('Email sign in initiated');
    const success = await signIn(email, password);
    if (success) {
      console.log(
        'Email sign in successful - navigation will happen automatically'
      );
    }
  };

  const navigateToRegister = () => {
    navigation?.navigate('Register');
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

              {/* Login form */}
              <View style={styles.formContainer} collapsable={false}>
                {/* Form Title */}
                <Text style={styles.formTitle}>TierNerd</Text>
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

                <TouchableOpacity
                  style={styles.forgotPassword}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.forgotPasswordText}>
                    Forgot Password?
                  </Text>
                </TouchableOpacity>

                <Button
                  title="Log In"
                  onPress={handleEmailSignIn}
                  fullWidth
                  loading={isLoading}
                  disabled={!email || !password}
                  style={styles.loginButton}
                />

                {googleAvailable && (
                  <>
                    {/* Divider */}
                    <View style={styles.divider}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>OR</Text>
                      <View style={styles.dividerLine} />
                    </View>

                    {/* Google Sign In */}
                    <TouchableOpacity
                      style={styles.googleButton}
                      onPress={handleGoogleSignIn}
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
                            Sign in with Google
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                )}

                {/* Sign up link */}
                <View style={styles.signUpContainer}>
                  <Text style={styles.signUpText}>Don't have an account? </Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={navigateToRegister}
                  >
                    <Text style={styles.signUpLink}>Sign Up</Text>
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
  loginButton: {
    marginTop: AppSpacing.md,
    backgroundColor: AppColors.primary,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: AppSpacing.md,
  },
  forgotPasswordText: {
    ...AppTypography.bodySmall,
    color: AppColors.primary,
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
  signUpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: AppSpacing.lg,
    paddingTop: AppSpacing.md,
    borderTopWidth: 1,
    borderTopColor: AppColors.neutral[200],
  },
  signUpText: {
    ...AppTypography.bodyMedium,
    color: AppColors.textSecondary,
  },
  signUpLink: {
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
