import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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

  const fetchItems = useCallback(
    async (silent = false) => {
      if (!token) return;
      try {
        if (!silent) setIsLoading(true);
        setItems(await listsService.getListItems(listId, token));
      } catch (err) {
        console.error('Error fetching items:', err);
        notifyError(
          'Error',
          'Unable to refresh items. Reopen the list to try again.'
        );
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [listId, token]
  );

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

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

  const handleItemsChanged = (item?: Item) => {
    setShowAddModal(false);
    setEditingItem(null);
    if (!item) {
      void fetchItems(true);
      return;
    }
    setItems((prev) =>
      prev.some((existing) => existing.item_id === item.item_id)
        ? prev.map((existing) =>
            existing.item_id === item.item_id ? item : existing
          )
        : [...prev, item]
    );
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
        accessibilityRole="button"
        accessibilityLabel="Back"
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
        accessibilityRole="button"
        accessibilityLabel="Delete list"
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

    return (
      <FlatList
        data={items}
        keyExtractor={(item) => item.item_id}
        contentContainerStyle={styles.listContainer}
        renderItem={({ item }) => {
          const isRanked = item.rating !== null;
          return (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={
                isRanked
                  ? `${item.name}, score ${item.rating?.toFixed(1)}`
                  : `${item.name}, not ranked yet`
              }
              testID={isRanked ? 'ranked-item' : 'unranked-item'}
              onPress={() => handleItemPress(item)}
              activeOpacity={0.7}
            >
              <View style={styles.itemRow}>
                <Text style={styles.itemScore}>
                  {isRanked ? item.rating?.toFixed(1) : '—'}
                </Text>
                <View style={styles.itemDetails}>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {!isRanked && (
                    <Text style={styles.itemUnranked}>Not ranked yet</Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
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
          onSuccess={handleItemsChanged}
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
  listContainer: {
    padding: AppSpacing.md,
    paddingBottom: AppSpacing.xxxl + 56,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.dominant.primary,
    borderRadius: AppBorders.radiusSm,
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.sm,
    marginBottom: AppSpacing.xs,
  },
  itemScore: {
    ...AppTypography.headlineSmall,
    color: AppColors.accent.primary,
    fontWeight: '700',
    width: 56,
    fontVariant: ['tabular-nums'],
  },
  itemName: {
    ...AppTypography.bodyLarge,
    color: AppColors.secondary.emphasis,
    fontWeight: '500',
  },
  itemDetails: {
    flex: 1,
  },
  itemUnranked: {
    ...AppTypography.labelSmall,
    color: AppColors.secondary.muted,
    marginTop: 2,
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
