import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddItemModal } from '../components/AddItemModal';
import { FAB } from '../design-system/components';
import {
  AppBorders,
  AppColors,
  AppSpacing,
  AppTypography,
} from '../design-system/tokens';
import type { RootStackScreenProps } from '../navigation/types';
import { useAuth } from '../providers/AuthContext';
import type { Item } from '../services/itemsService';
import { listsService } from '../services/listsService';
import { confirmDestructive, notifyError } from '../utils/confirm';

const TIER_ORDER = ['S', 'A', 'B', 'C', 'D', 'F'] as const;

const groupItemsByTier = (items: Item[]): Record<string, Item[]> => {
  const grouped: Record<string, Item[]> = {};
  for (const tier of TIER_ORDER) {
    grouped[tier] = [];
  }
  for (const item of items) {
    if (item.tier && grouped[item.tier]) {
      grouped[item.tier].push(item);
    }
  }
  return grouped;
};

type ListDetailScreenProps = RootStackScreenProps<'ListDetail'>;

export const ListDetailScreen: React.FC<ListDetailScreenProps> = ({
  route,
  navigation,
}) => {
  const { token } = useAuth();
  const { listId, listTitle, promptAddItem } = route.params;
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Initialize modal state from promptAddItem param
  const [showAddModal, setShowAddModal] = useState(promptAddItem ?? false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  useEffect(() => {
    const fetchItems = async () => {
      if (!token) return;
      try {
        setIsLoading(true);
        const fetchedItems = await listsService.getListItems(listId, token);
        setItems(fetchedItems);
      } catch (err) {
        console.error('Error fetching items:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchItems();
  }, [listId, token]);

  const handleBack = () => {
    navigation.goBack();
  };

  const handleDelete = async () => {
    const confirmed = await confirmDestructive(
      'Delete List',
      'Are you sure you want to delete this list? All items will be permanently deleted.',
      'Delete'
    );
    if (!confirmed) return;
    if (!token) return;
    try {
      await listsService.deleteList(listId, token);
      navigation.goBack();
    } catch (err: unknown) {
      console.error('Error deleting list:', err);
      notifyError(
        'Error',
        err instanceof Error ? err.message : 'Failed to delete list'
      );
    }
  };

  const handleAddPress = () => {
    setShowAddModal(true);
  };

  const handleItemCreated = (item: Item) => {
    setItems((prev) => [...prev, item]);
    setShowAddModal(false);
  };

  const handleItemUpdated = (item: Item) => {
    setItems((prev) =>
      prev.map((i) => (i.item_id === item.item_id ? item : i))
    );
    setEditingItem(null);
  };

  const handleModalClose = () => {
    setShowAddModal(false);
    setEditingItem(null);
  };

  const handleItemPress = (item: Item) => {
    setEditingItem(item);
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={handleBack}
        style={styles.backButton}
        activeOpacity={0.7}
      >
        <Ionicons
          name="chevron-back"
          size={28}
          color={AppColors.secondary.emphasis}
        />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {listTitle}
      </Text>
      <TouchableOpacity
        onPress={handleDelete}
        style={styles.deleteButton}
        activeOpacity={0.7}
        testID="delete-list"
      >
        <Ionicons name="trash-outline" size={24} color={AppColors.error} />
      </TouchableOpacity>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Image
        source={require('../../assets/logo-transparent.png')}
        style={styles.emptyStateImage}
      />
      <Text style={styles.emptyStateTitle}>No items yet</Text>
      <Text style={styles.emptyStateText}>
        Tap the + button to add your first item
      </Text>
    </View>
  );

  const TierRow = ({
    tier,
    tierItems,
  }: {
    tier: string;
    tierItems: Item[];
  }) => (
    <View style={styles.tierRow}>
      <View
        style={[
          styles.tierLabel,
          { backgroundColor: AppColors.getTierColor(tier) },
        ]}
      >
        <Text style={styles.tierLabelText}>{tier}</Text>
      </View>
      <View style={styles.tierItemsContainer}>
        {tierItems.length === 0 ? (
          <Text style={styles.emptyTierPlaceholder}>No items</Text>
        ) : (
          tierItems.map((item) => (
            <TouchableOpacity
              key={item.item_id}
              onPress={() => handleItemPress(item)}
              activeOpacity={0.7}
            >
              <View style={styles.compactItemCard}>
                <Text style={styles.compactItemName} numberOfLines={2}>
                  {item.name}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </View>
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={AppColors.accent.primary} />
        </View>
      );
    }

    if (items.length === 0) {
      return renderEmptyState();
    }

    const groupedItems = groupItemsByTier(items);

    return (
      <View style={styles.tierContainer}>
        {TIER_ORDER.map((tier) => (
          <TierRow key={tier} tier={tier} tierItems={groupedItems[tier]} />
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {renderHeader()}
        {renderContent()}

        <FAB onPress={handleAddPress} testID="fab-add-item" />

        <AddItemModal
          visible={showAddModal || !!editingItem}
          onClose={handleModalClose}
          onSuccess={editingItem ? handleItemUpdated : handleItemCreated}
          listTitle={listTitle}
          editingItem={editingItem ?? undefined}
        />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.neutral[200],
    backgroundColor: AppColors.dominant.primary,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -AppSpacing.sm,
  },
  headerTitle: {
    ...AppTypography.headlineSmall,
    color: AppColors.secondary.emphasis,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: AppSpacing.sm,
  },
  deleteButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -AppSpacing.sm,
  },
  tierContainer: {
    flex: 1,
    padding: AppSpacing.md,
    paddingBottom: AppSpacing.xxxl + 56,
  },
  tierRow: {
    flex: 1,
    flexDirection: 'row',
    marginBottom: AppSpacing.xs,
    backgroundColor: AppColors.neutral[100],
    borderRadius: AppBorders.radiusSm,
    overflow: 'hidden',
  },
  tierLabel: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierLabelText: {
    ...AppTypography.headlineSmall,
    color: AppColors.textOnPrimary,
    fontWeight: '700',
  },
  tierItemsContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    alignContent: 'flex-start',
    padding: AppSpacing.xs,
    gap: AppSpacing.xs,
  },
  compactItemCard: {
    backgroundColor: AppColors.dominant.primary,
    borderRadius: AppBorders.radiusSm,
    paddingHorizontal: AppSpacing.sm,
    paddingVertical: AppSpacing.xs,
    maxWidth: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  compactItemName: {
    ...AppTypography.bodySmall,
    color: AppColors.secondary.emphasis,
    fontWeight: '500',
  },
  emptyTierPlaceholder: {
    ...AppTypography.bodySmall,
    color: AppColors.neutral[400],
    fontStyle: 'italic',
    paddingHorizontal: AppSpacing.sm,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
  },
  emptyStateImage: {
    width: 100,
    height: 100,
    opacity: 0.3,
    marginBottom: AppSpacing.lg,
  },
  emptyStateTitle: {
    ...AppTypography.headlineSmall,
    color: AppColors.secondary.emphasis,
    fontWeight: '600',
    marginBottom: AppSpacing.sm,
  },
  emptyStateText: {
    ...AppTypography.bodyMedium,
    color: AppColors.textSecondary,
    textAlign: 'center',
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
