import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  type FlatListProps,
  Image,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddItemContent } from '../components/AddItemContent';
import {
  type CreatedList,
  CreateListContent,
} from '../components/CreateListModal';
import { RankingContent } from '../components/RankingContent';
import { useItemWorkspace } from '../components/useItemWorkspace';
import { Card, FAB } from '../design-system/components';
import {
  AppBorders,
  AppColors,
  AppLayout,
  AppSpacing,
  AppTypography,
} from '../design-system/tokens';
import type { RootStackScreenProps } from '../navigation/types';
import { useAuth } from '../providers/AuthContext';
import type { Item } from '../services/itemsService';
import { type ListSimple, listsService } from '../services/listsService';

type ModalStep = 'create' | 'addItem' | null;

interface TierList {
  id: string;
  title: string;
  description: string | null;
  itemCount: number;
  updatedAt: Date;
}

type HomeScreenProps = RootStackScreenProps<'Main'>;
type CreateListContentHandle = { requestClose: () => Promise<boolean> };

const CARD_ROW_ESTIMATE = 160;

const toAnchorId = (item: TierList | TierList[] | undefined): string | null => {
  if (!item) return null;
  return Array.isArray(item) ? (item[0]?.id ?? null) : item.id;
};

const toTierList = (apiList: ListSimple): TierList => ({
  id: apiList.list_id,
  title: apiList.title,
  description: apiList.description,
  itemCount: apiList.item_count,
  updatedAt: new Date(apiList.updated_at),
});

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { user, token } = useAuth();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const columns =
    windowWidth < 360
      ? 1
      : windowWidth < AppLayout.desktopBreakpoint
        ? 2
        : windowWidth < AppLayout.fourColumnBreakpoint
          ? 3
          : 4;
  const [lists, setLists] = useState<TierList[]>([]);
  const [contentWidth, setContentWidth] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalStep, setModalStep] = useState<ModalStep>(null);
  const [pendingList, setPendingList] = useState<CreatedList | null>(null);
  const createListRef = useRef<CreateListContentHandle | null>(null);
  const listRef = useRef<FlatList<TierList> | null>(null);
  const anchorRef = useRef<string | null>(null);
  const rowHeightTotalRef = useRef(0);
  const rowHeightCountRef = useRef(0);
  const restoreFrameRef = useRef<number | null>(null);
  const restoreRef = useRef<() => void>(() => {});
  const gridWidthRef = useRef(0);
  const gridLayoutSeenRef = useRef(false);
  const listsRef = useRef<TierList[]>([]);
  const previousColumnsRef = useRef(columns);
  const pendingRestoreRef = useRef<string | null>(null);
  const bypassBeforeRemoveRef = useRef(false);
  const closingForNavigationRef = useRef(false);
  const listsRequestRef = useRef(0);
  const cardWidth = Math.max(
    0,
    (contentWidth - AppLayout.columnGap * (columns - 1)) / columns
  );

  listsRef.current = lists;

  if (previousColumnsRef.current !== columns) {
    previousColumnsRef.current = columns;
    pendingRestoreRef.current = anchorRef.current;
    rowHeightTotalRef.current = 0;
    rowHeightCountRef.current = 0;
    gridLayoutSeenRef.current = false;
  }

  const refreshLists = useCallback(
    async (showLoading = false) => {
      if (!token) return;
      const requestId = ++listsRequestRef.current;
      if (showLoading) setIsLoading(true);
      try {
        const apiLists = await listsService.getLists(token);
        if (requestId !== listsRequestRef.current) return;
        setLists(apiLists.map(toTierList));
        setError(null);
      } catch (err: unknown) {
        if (requestId === listsRequestRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to load lists');
        }
        throw err;
      } finally {
        if (requestId === listsRequestRef.current) setIsLoading(false);
      }
    },
    [token]
  );

  const fetchLists = useCallback(async () => {
    try {
      await refreshLists(true);
    } catch {
      return;
    }
  }, [refreshLists]);

  useFocusEffect(
    useCallback(() => {
      void fetchLists();
    }, [fetchLists])
  );

  const handleWorkspaceItemsChanged = useCallback(
    async (item?: Item) => {
      await refreshLists();
      if (item && pendingList) {
        navigation.navigate('ListDetail', {
          listId: pendingList.listId,
          listTitle: pendingList.title,
          completedItemId: item.item_id,
        });
      }
    },
    [navigation, pendingList, refreshLists]
  );

  const handleWorkspaceClosed = useCallback(() => {
    setModalStep(null);
    setPendingList(null);
  }, []);

  const workspace = useItemWorkspace({
    listTitle: pendingList?.title ?? '',
    token,
    onItemsChanged: handleWorkspaceItemsChanged,
    onClosed: handleWorkspaceClosed,
  });

  const handleListCreated = useCallback(
    (list: CreatedList) => {
      void fetchLists();
      setPendingList(list);
      workspace.openAdd();
      setModalStep('addItem');
    },
    [fetchLists, workspace.openAdd]
  );

  const getModalTitle = () => {
    if (modalStep === 'create') return 'Create New List';
    if (workspace.mode === 'ranking') {
      return workspace.session?.status === 'ready_to_commit'
        ? 'Ready to save'
        : 'Which is better?';
    }
    return 'Add item';
  };

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (bypassBeforeRemoveRef.current) {
          bypassBeforeRemoveRef.current = false;
          return;
        }
        if (closingForNavigationRef.current) {
          event.preventDefault();
          return;
        }
        if (!modalStep) return;

        event.preventDefault();
        closingForNavigationRef.current = true;
        const action = event.data.action;
        const close =
          modalStep === 'create'
            ? createListRef.current?.requestClose()
            : workspace.requestClose();

        void Promise.resolve(close)
          .catch(() => false)
          .then((canLeave) => {
            if (canLeave) {
              bypassBeforeRemoveRef.current = true;
              navigation.dispatch(action);
            }
          })
          .finally(() => {
            closingForNavigationRef.current = false;
          });
      }),
    [modalStep, navigation, workspace.requestClose]
  );

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

  const handleListPress = (list: TierList) => {
    navigation.navigate('ListDetail', {
      listId: list.id,
      listTitle: list.title,
    });
  };

  const recordCardLayout = useCallback(
    (width: number, height: number) => {
      if (height <= 0) return;
      if (pendingRestoreRef.current) {
        if (!gridLayoutSeenRef.current) return;
        const expectedCardWidth =
          (gridWidthRef.current - AppLayout.columnGap * (columns - 1)) /
          columns;
        if (Math.abs(width - expectedCardWidth) > 2) return;
      }
      rowHeightTotalRef.current += height;
      rowHeightCountRef.current += 1;
      if (!pendingRestoreRef.current) return;
      if (restoreFrameRef.current !== null) {
        cancelAnimationFrame(restoreFrameRef.current);
      }
      restoreFrameRef.current = requestAnimationFrame(() => {
        restoreFrameRef.current = null;
        restoreRef.current();
      });
    },
    [columns]
  );

  const renderListCard = ({ item }: ListRenderItemInfo<TierList>) => (
    <TouchableOpacity
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={
        item.description?.trim()
          ? `${item.title}, ${item.itemCount} items. ${item.description}`
          : `${item.title}, ${item.itemCount} items`
      }
      accessibilityHint="Open tier list"
      onPress={() => handleListPress(item)}
      style={[styles.cardWrapper, { width: cardWidth }]}
      onLayout={(event) =>
        recordCardLayout(
          event.nativeEvent.layout.width,
          event.nativeEvent.layout.height
        )
      }
    >
      <Card style={styles.listCard}>
        <Text style={styles.listTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.description?.trim() ? (
          <Text style={styles.listDescription} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
        <Text style={styles.itemCount}>{item.itemCount} items</Text>
        <Text style={styles.updatedAt}>
          Modified {formatDate(item.updatedAt)}
        </Text>
      </Card>
    </TouchableOpacity>
  );

  const onViewableItemsChanged = useRef<
    NonNullable<FlatListProps<TierList>['onViewableItemsChanged']>
  >(({ viewableItems }) => {
    const firstVisible = viewableItems.find((viewable) => viewable.isViewable);
    const anchorId = toAnchorId(
      firstVisible?.item as TierList | TierList[] | undefined
    );
    if (anchorId) anchorRef.current = anchorId;
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 1 }).current;

  const getRowPitch = useCallback(
    () =>
      rowHeightCountRef.current > 0
        ? rowHeightTotalRef.current / rowHeightCountRef.current +
          AppLayout.columnGap
        : CARD_ROW_ESTIMATE,
    []
  );

  const getItemLayout = useCallback<
    NonNullable<FlatListProps<TierList>['getItemLayout']>
  >(
    (_data, index) => {
      const rowHeight = getRowPitch();
      return { length: rowHeight, offset: rowHeight * index, index };
    },
    [getRowPitch]
  );

  const handleGridLayout = useCallback((event: LayoutChangeEvent) => {
    gridWidthRef.current = event.nativeEvent.layout.width;
    gridLayoutSeenRef.current = true;
  }, []);

  const restoreListPosition = useCallback(() => {
    const anchorId = pendingRestoreRef.current;
    if (!anchorId || !listRef.current) return;
    if (rowHeightCountRef.current === 0) return;
    if (!gridLayoutSeenRef.current) return;
    pendingRestoreRef.current = null;
    const anchorIndex = listsRef.current.findIndex(
      (list) => list.id === anchorId
    );
    if (anchorIndex < 0) return;
    listRef.current.scrollToOffset({
      offset: Math.floor(anchorIndex / columns) * getRowPitch(),
      animated: false,
    });
  }, [columns, getRowPitch]);

  restoreRef.current = restoreListPosition;

  const handleContentLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (
      contentWidth > 0 &&
      width !== contentWidth &&
      !pendingRestoreRef.current
    ) {
      rowHeightTotalRef.current = 0;
      rowHeightCountRef.current = 0;
    }
    setContentWidth(width);
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.brandText}>TierNerd</Text>
      <TouchableOpacity
        onPress={() => navigation.navigate('Profile')}
        style={styles.profileButton}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Open profile"
      >
        {user?.photoUrl ? (
          <Image
            source={{ uri: user.photoUrl }}
            style={styles.profileImage}
            accessible={false}
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
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Image
        source={require('../../assets/logo-transparent.png')}
        style={styles.emptyStateImage}
        accessible={false}
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
      <TouchableOpacity
        style={styles.retryButton}
        onPress={() => void fetchLists()}
      >
        <Text style={styles.retryButtonText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );

  const renderContent = () => {
    if (!token || isLoading) return renderLoading();
    if (error) return renderError();
    if (lists.length === 0) return renderEmptyState();

    return (
      <FlatList
        style={styles.list}
        ref={listRef}
        key={`list-grid-${columns}`}
        data={lists}
        renderItem={renderListCard}
        keyExtractor={(item) => item.id}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? styles.row : undefined}
        contentContainerStyle={styles.listContent}
        getItemLayout={getItemLayout}
        showsVerticalScrollIndicator={false}
        onLayout={handleGridLayout}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />
    );
  };

  return (
    <View style={[styles.container, { height: windowHeight }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.shell}>
          <View style={styles.shellContent} onLayout={handleContentLayout}>
            {renderHeader()}
            {renderContent()}
            <Text style={styles.footerText}>
              TierNerd
              {Constants.expoConfig?.version
                ? ` · ${Constants.expoConfig.version}`
                : ''}
            </Text>
            <FAB
              onPress={() => setModalStep('create')}
              accessibilityLabel="Create new list"
              testID="fab-create"
              style={styles.fab}
            />
          </View>
        </View>

        <Modal
          visible={modalStep !== null}
          transparent
          animationType="none"
          accessibilityLabel={getModalTitle()}
          onRequestClose={() => {
            if (modalStep === 'create') {
              void createListRef.current?.requestClose().catch(() => false);
            } else if (modalStep === 'addItem') {
              void workspace.requestClose().catch(() => false);
            }
          }}
        >
          {modalStep === 'create' && (
            <CreateListContent
              ref={createListRef}
              onClose={() => {
                setModalStep(null);
                setPendingList(null);
              }}
              onSuccess={handleListCreated}
            />
          )}
          {modalStep === 'addItem' &&
            pendingList &&
            (workspace.mode === 'ranking' && workspace.session ? (
              <RankingContent
                listTitle={pendingList.title}
                session={workspace.session}
                presentation="modal"
                isBusy={workspace.isBusy}
                error={workspace.error}
                onAnswer={(result) => void workspace.answer(result)}
                onUndo={() => void workspace.undo()}
                onCommit={() => void workspace.commit()}
                onCancel={() =>
                  void workspace.requestClose().catch(() => false)
                }
                onRestart={() => void workspace.restart()}
                onReload={workspace.reloadSession}
                onRetryRefresh={workspace.retryRefresh}
              />
            ) : workspace.mode === 'add' || workspace.mode === 'edit' ? (
              <AddItemContent
                mode={workspace.mode}
                form={workspace.form}
                onFormChange={workspace.setForm}
                onRetryRefresh={workspace.retryRefresh}
                fieldErrors={workspace.fieldErrors}
                isBusy={workspace.isBusy}
                error={workspace.error}
                onSubmit={() => void workspace.submitMetadata()}
                onClose={() => void workspace.requestClose().catch(() => false)}
                presentation="modal"
                introText={`“${pendingList.title}” created. Add its first item.`}
              />
            ) : null)}
        </Modal>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    minHeight: 0,
    backgroundColor: AppColors.dominant.secondary,
  },
  safeArea: {
    minHeight: 0,
    flex: 1,
  },
  shell: {
    width: '100%',
    maxWidth: AppLayout.maxWidth,
    alignSelf: 'center',
    flex: 1,
    minHeight: 0,
  },
  shellContent: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: AppLayout.gutter,
  },
  header: {
    paddingTop: AppSpacing.md,
    paddingBottom: AppSpacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingBottom: AppSpacing.xxxl + 56,
  },
  row: {
    justifyContent: 'space-between',
  },
  cardWrapper: {
    marginBottom: AppLayout.columnGap,
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
  listDescription: {
    ...AppTypography.bodySmall,
    color: AppColors.textSecondary,
    marginBottom: AppSpacing.sm,
  },
  itemCount: {
    ...AppTypography.bodySmall,
    color: AppColors.textSecondary,
    marginBottom: AppSpacing.sm,
  },
  updatedAt: {
    ...AppTypography.labelSmall,
    color: AppColors.secondary.muted,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
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
    paddingHorizontal: AppSpacing.lg,
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
  footerText: {
    ...AppTypography.labelSmall,
    fontSize: 12,
    color: AppColors.secondary.muted,
    paddingVertical: AppSpacing.sm,
    textAlign: 'center',
  },
  fab: {
    right: 0,
    bottom: AppSpacing.xl,
  },
});
