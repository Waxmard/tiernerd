import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import type React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../design-system/components';
import {
  AppBorders,
  AppColors,
  AppSpacing,
  AppTypography,
} from '../design-system/tokens';
import type { RootStackScreenProps } from '../navigation/types';
import { useAuth } from '../providers/AuthContext';

const AppShadows = {
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
};

type ProfileScreenProps = RootStackScreenProps<'Profile'>;

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View>
            {/* Header with back button */}
            <View style={styles.header}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={handleBack}
                style={styles.backButton}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="chevron-back"
                  size={28}
                  color={AppColors.secondary.primary}
                  accessible={false}
                />
              </TouchableOpacity>
              <Text style={styles.headerTitle} accessibilityRole="header">
                Profile
              </Text>
              <View style={styles.backButton} />
            </View>

            {/* User Info Card */}
            <Card style={styles.userCard}>
              <View style={styles.userInfo}>
                {user?.photoUrl ? (
                  <Image
                    source={{ uri: user.photoUrl }}
                    style={styles.profileImage}
                    accessibilityLabel={
                      user?.displayName
                        ? `${user.displayName} profile photo`
                        : 'Profile photo'
                    }
                  />
                ) : (
                  <View style={styles.profilePlaceholder}>
                    <Ionicons
                      name="person"
                      size={40}
                      color={AppColors.neutral[600]}
                      accessible={false}
                    />
                  </View>
                )}
                <Text style={styles.userName}>
                  {user?.displayName || user?.email?.split('@')[0] || 'User'}
                </Text>
                <Text style={styles.userEmail}>
                  {user?.email || 'No email'}
                </Text>
              </View>
            </Card>

            {/* Sign Out Button */}
            <View style={styles.signOutSection}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                style={styles.signOutButton}
                onPress={handleSignOut}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="log-out-outline"
                  size={20}
                  color="#DC2626"
                  accessible={false}
                />
                <Text style={styles.signOutButtonText}>Sign Out</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.versionContainer}>
              <Text style={styles.versionText}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.dominant.secondary,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: AppSpacing.lg,
    paddingBottom: AppSpacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: AppSpacing.md,
    marginBottom: AppSpacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...AppTypography.headlineSmall,
    color: AppColors.secondary.emphasis,
    fontWeight: '600',
  },
  userCard: {
    backgroundColor: AppColors.dominant.primary,
    borderRadius: AppBorders.radiusLg,
    padding: AppSpacing.xl,
    marginBottom: AppSpacing.xl,
    ...AppShadows.md,
  },
  userInfo: {
    alignItems: 'center',
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: AppSpacing.md,
  },
  profilePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: AppColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: AppColors.neutral[300],
    marginBottom: AppSpacing.md,
  },
  userName: {
    ...AppTypography.headlineSmall,
    color: AppColors.secondary.emphasis,
    fontWeight: '600',
    marginBottom: AppSpacing.xs,
  },
  userEmail: {
    ...AppTypography.bodyMedium,
    color: AppColors.textSecondary,
  },
  signOutSection: {
    marginBottom: AppSpacing.xl,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: AppBorders.radiusMd,
    paddingVertical: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
  },
  signOutButtonText: {
    ...AppTypography.labelLarge,
    color: '#DC2626',
    fontWeight: '600',
    marginLeft: AppSpacing.sm,
  },
  versionContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: AppSpacing.md,
  },
  versionText: {
    ...AppTypography.labelSmall,
    color: AppColors.textSecondary,
    fontSize: 12,
  },
});
