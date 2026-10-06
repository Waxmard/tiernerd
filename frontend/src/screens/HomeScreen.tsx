import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddItemContent } from '../components/AddItemModal';
import {
  type CreatedList,
  CreateListContent,
} from '../components/CreateListModal';
import {
  type TierDistribution,
  TierDistributionBar,
} from '../components/TierDistributionBar';
import { Card, FAB } from '../design-system/components';
import {
  AppBorders,
  AppColors,
  AppSpacing,
  AppTypography,
} from '../design-system/tokens';
import type { RootStackScreenProps } from '../navigation/types';
import { useAuth } from '../providers/AuthContext';
import type { Item } from '../services/itemsService';
import { type ListSimple, listsService } from '../services/listsService';
import { confirmDestructive, notifyError } from '../utils/confirm';

type ModalStep = 'create' | 'addItem' | null;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_GAP = AppSpacing.md;
const HORIZONTAL_PADDING = AppSpacing.lg;
const CARD_WIDTH = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - COLUMN_GAP) / 2;

interface TierList {
  id: string;
  title: string;
  itemCount: number;
  updatedAt: Date;
  tierDistribution: TierDistribution;
}

type HomeScreenProps = RootStackScreenProps<'Main'>;

// Convert API ListSimple to local TierList format
const toTierList = (apiList: ListSimple): TierList => ({
  id: apiList.list_id,
  title: apiList.title,
  itemCount: apiList.item_count,
  updatedAt: new Date(apiList.updated_at),
  tierDistribution: apiList.tier_distribution,
});

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { user, token } = useAuth();
  const [lists, setLists] = useState<TierList[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalStep, setModalStep] = useState<ModalStep>(null);
  const [pendingList, setPendingList] = useState<CreatedList | null>(null);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  const fetchLists = useCallback(async () => {
    if (!token) return;

    try {
      setIsLoading(true);
      setError(null);
      const apiLists = await listsService.getLists(token);
      setLists(apiLists.map(toTierList));
    } catch (err: unknown) {
      console.error('Error fetching lists:', err);
      setError(err instanceof Error ? err.message : 'Failed to load lists');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Refetch on focus (including first mount) so deletes made on the detail
  // screen drop off the grid.
  useFocusEffect(
    useCallback(() => {
      fetchLists();
    }, [fetchLists])
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
    // fadeAnim/scaleAnim are stable refs from useRef; no need to depend.
  }, [fadeAnim, scaleAnim]);

  const formatDate = (date: Date): string => {
    const now = new Date();
    const difference = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (difference === 0) return 'today';
    if (difference === 1) return 'yesterday';
    if (difference < 7) return `${difference} days ago`;
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  };

  const handleProfilePress = () => {
    navigation.navigate('Profile');
  };

  const handleCreatePress = () => {
    setModalStep('create');
  };

  const handleListPress = (list: TierList) => {
    navigation.navigate('ListDetail', {
      listId: list.id,
      listTitle: list.title,
    });
  };

  const handleListLongPress = async (list: TierList) => {
    const confirmed = await confirmDestructive(
      'Delete List',
      'Are you sure you want to delete this list? All items will be permanently deleted.',
      'Delete'
    );
    if (!confirmed) return;
    if (!token) return;
    try {
      await listsService.deleteList(list.id, token);
      setLists((prev) => prev.filter((l) => l.id !== list.id));
    } catch (err: unknown) {
      console.error('Error deleting list:', err);
      notifyError(
        'Error',
        err instanceof Error ? err.message : 'Failed to delete list'
      );
    }
  };

  const handleListCreated = (list: CreatedList) => {
    fetchLists();
    setPendingList(list);
    setModalStep('addItem');
  };

  const handleItemCreated = (_item: Item) => {
    if (pendingList) {
      navigation.navigate('ListDetail', {
        listId: pendingList.listId,
        listTitle: pendingList.title,
      });
      setModalStep(null);
      setPendingList(null);
    }
  };

  const renderListCard = ({
    item,
    index,
  }: {
    item: TierList;
    index: number;
  }) => {
    const isLeftColumn = index % 2 === 0;

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => handleListPress(item)}
        onLongPress={() => handleListLongPress(item)}
        style={[
          styles.cardWrapper,
          isLeftColumn ? styles.cardLeft : styles.cardRight,
        ]}
      >
        <Card style={styles.listCard}>
          <Text style={styles.listTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.itemCount}>{item.itemCount} items</Text>
          <TierDistributionBar
            distribution={item.tierDistribution}
            style={styles.tierBar}
          />
          <Text style={styles.updatedAt}>
            Modified {formatDate(item.updatedAt)}
          </Text>
        </Card>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <View style={styles.brandSection}>
          <Text style={styles.brandText}>TierNerd</Text>
        </View>

        <TouchableOpacity
          onPress={handleProfilePress}
          style={styles.profileButton}
          activeOpacity={0.7}
        >
          {user?.photoUrl ? (
            <Image
              source={{ uri: user.photoUrl }}
              style={styles.profileImage}
            />
          ) : (
            <View style={styles.profilePlaceholder}>
              <Ionicons
                name="person"
                size={20}
                color={AppColors.accent.primary}
              />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Image
        source={require('../../assets/logo-transparent.png')}
        style={styles.emptyStateImage}
      />
      <Text style={styles.emptyStateTitle}>Welcome to TierNerd!</Text>
      <Text style={styles.emptyStateText}>
        Create your first tier list and start ranking your favorite things
      </Text>
    </View>
  );

  const renderLoading = () => (
    <View style={styles.loadingState}>
      <ActivityIndicator size="large" color={AppColors.accent.primary} />
    </View>
  );

  const renderError = () => (
    <View style={styles.errorState}>
      <Ionicons
        name="alert-circle-outline"
        size={48}
        color={AppColors.textSecondary}
      />
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={fetchLists}>
        <Text style={styles.retryButtonText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );

  const renderContent = () => {
    // Show loading while waiting for token OR while fetching
    if (!token || isLoading) {
      return renderLoading();
    }

    if (error) {
      return renderError();
    }

    if (lists.length === 0) {
      return renderEmptyState();
    }

    return (
      <FlatList
        data={lists}
        renderItem={renderListCard}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.View
          style={[
            styles.animatedContainer,
            { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
          ]}
        >
          {renderHeader()}
          {renderContent()}
        </Animated.View>

        <FAB onPress={handleCreatePress} testID="fab-create" />

        <Modal
          visible={modalStep !== null}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setModalStep(null);
            setPendingList(null);
          }}
        >
          {modalStep === 'create' && (
            <CreateListContent
              onClose={() => setModalStep(null)}
              onSuccess={handleListCreated}
            />
          )}
          {modalStep === 'addItem' && pendingList && (
            <AddItemContent
              listTitle={pendingList.title}
              onClose={() => {
                setModalStep(null);
                setPendingList(null);
              }}
              onSuccess={handleItemCreated}
            />
          )}
        </Modal>
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
  animatedContainer: {
    flex: 1,
  },
  header: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: AppSpacing.md,
    paddingBottom: AppSpacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    ...AppTypography.headlineMedium,
    color: AppColors.secondary.emphasis,
    fontWeight: '700',
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.accent.light,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  profilePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: AppColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: AppSpacing.xxxl + 56, // Extra space for FAB
  },
  row: {
    justifyContent: 'space-between',
  },
  cardWrapper: {
    width: CARD_WIDTH,
    marginBottom: COLUMN_GAP,
  },
  cardLeft: {
    marginRight: COLUMN_GAP / 2,
  },
  cardRight: {
    marginLeft: COLUMN_GAP / 2,
  },
  listCard: {
    backgroundColor: AppColors.dominant.primary,
    borderRadius: AppBorders.radiusMd,
    padding: AppSpacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  listTitle: {
    ...AppTypography.bodyLarge,
    color: AppColors.secondary.emphasis,
    fontWeight: '600',
    marginBottom: AppSpacing.xs,
  },
  itemCount: {
    ...AppTypography.bodySmall,
    color: AppColors.textSecondary,
    marginBottom: AppSpacing.sm,
  },
  tierBar: {
    marginBottom: AppSpacing.sm,
  },
  updatedAt: {
    ...AppTypography.labelSmall,
    color: AppColors.neutral[400],
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  emptyStateImage: {
    width: 120,
    height: 120,
    opacity: 0.3,
    marginBottom: AppSpacing.xl,
  },
  emptyStateTitle: {
    ...AppTypography.headlineMedium,
    color: AppColors.secondary.emphasis,
    fontWeight: '600',
    marginBottom: AppSpacing.sm,
  },
  emptyStateText: {
    ...AppTypography.bodyMedium,
    color: AppColors.textSecondary,
    textAlign: 'center',
    marginBottom: AppSpacing.xl,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  errorTitle: {
    ...AppTypography.headlineSmall,
    color: AppColors.secondary.emphasis,
    fontWeight: '600',
    marginTop: AppSpacing.md,
    marginBottom: AppSpacing.xs,
  },
  errorText: {
    ...AppTypography.bodyMedium,
    color: AppColors.textSecondary,
    textAlign: 'center',
    marginBottom: AppSpacing.lg,
  },
  retryButton: {
    backgroundColor: AppColors.accent.primary,
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: AppSpacing.sm,
    borderRadius: AppBorders.radiusSm,
  },
  retryButtonText: {
    ...AppTypography.bodyMedium,
    color: AppColors.dominant.primary,
    fontWeight: '600',
  },
});
