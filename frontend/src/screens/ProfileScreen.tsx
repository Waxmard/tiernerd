import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import type React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AppColors,
  AppLayout,
  AppSpacing,
  AppTypography,
} from '../design-system/tokens';
import type { RootStackScreenProps } from '../navigation/types';
import { useAuth } from '../providers/AuthContext';

type ProfileScreenProps = RootStackScreenProps<'Profile'>;

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const { user, signOut } = useAuth();
  const { width } = useWindowDimensions();

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
          <View
            style={[
              styles.page,
              {
                paddingHorizontal:
                  width >= AppLayout.desktopBreakpoint
                    ? AppSpacing.lg
                    : AppSpacing.md,
              },
            ]}
          >
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

            <View style={styles.identityRow}>
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
                    size={28}
                    color={AppColors.neutral[600]}
                    accessible={false}
                  />
                </View>
              )}
              <View style={styles.identityText}>
                <Text style={styles.userName}>
                  {user?.displayName || user?.email?.split('@')[0] || 'User'}
                </Text>
                <Text style={styles.identityCaption}>TierNerd account</Text>
              </View>
            </View>

            <View style={styles.accountSection}>
              <Text style={styles.sectionLabel}>Account</Text>
              <View style={styles.accountRow}>
                <Text style={styles.accountLabel}>Email address</Text>
                <Text style={styles.userEmail}>
                  {user?.email || 'No email'}
                </Text>
              </View>
            </View>

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
                color={AppColors.secondary.primary}
                accessible={false}
              />
              <Text style={styles.signOutButtonText}>Sign Out</Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={AppColors.neutral[500]}
                accessible={false}
              />
            </TouchableOpacity>

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
    flexGrow: 1,
  },
  page: {
    width: '100%',
    maxWidth: AppLayout.maxWidth,
    alignSelf: 'center',
    flexGrow: 1,
    paddingBottom: AppSpacing.xl,
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
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    marginBottom: AppSpacing.xl,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  profileImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  profilePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: AppColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: AppColors.neutral[300],
  },
  userName: {
    ...AppTypography.titleMedium,
    color: AppColors.secondary.emphasis,
    flexShrink: 1,
  },
  identityCaption: {
    ...AppTypography.bodySmall,
    color: AppColors.textSecondary,
    marginTop: AppSpacing.xs,
  },
  accountSection: {
    marginBottom: AppSpacing.lg,
  },
  sectionLabel: {
    ...AppTypography.labelMedium,
    color: AppColors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: AppSpacing.sm,
  },
  accountRow: {
    backgroundColor: AppColors.dominant.primary,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: AppColors.neutral[200],
    paddingVertical: AppSpacing.md,
    gap: AppSpacing.xs,
  },
  accountLabel: {
    ...AppTypography.labelMedium,
    color: AppColors.secondary.primary,
  },
  userEmail: {
    ...AppTypography.bodyMedium,
    color: AppColors.textSecondary,
    flexShrink: 1,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    backgroundColor: AppColors.dominant.primary,
    borderWidth: 1,
    borderColor: AppColors.neutral[200],
    borderRadius: 8,
    paddingVertical: AppSpacing.md,
    paddingHorizontal: AppSpacing.lg,
  },
  signOutButtonText: {
    ...AppTypography.labelLarge,
    color: AppColors.secondary.primary,
    fontWeight: '600',
    flex: 1,
    marginLeft: AppSpacing.md,
  },
  versionContainer: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: 'auto',
    paddingTop: AppSpacing.xl,
  },
  versionText: {
    ...AppTypography.labelSmall,
    color: AppColors.textSecondary,
  },
});
