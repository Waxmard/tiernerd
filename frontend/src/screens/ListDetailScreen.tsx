import type React from 'react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  type ListRenderItemInfo,
  Platform,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  ListDetailHeader,
  type RankOutcome,
} from '../components/ListDetailHeader';
import {
  type FocusTarget,
  ListDetailItemRow,
  ListItemEmptyState,
} from '../components/ListDetailItemRow';
import { styles } from '../components/ListDetailScreen.styles';
import { ListDetailWorkspaceHost } from '../components/ListDetailWorkspaceHost';
import { useItemWorkspace } from '../components/useItemWorkspace';
import { AppColors, AppLayout, AppSpacing } from '../design-system/tokens';
import type { RootStackScreenProps } from '../navigation/types';
import { useAuth } from '../providers/AuthContext';
import { ApiError, getApiErrorMessage } from '../services/apiError';
import {
  type ComparisonSession,
  type Item,
  itemsService,
} from '../services/itemsService';
import { listsService } from '../services/listsService';
import { confirmDestructive, notifyError } from '../utils/confirm';

type ListDetailScreenProps = RootStackScreenProps<'ListDetail'>;

interface PendingScroll {
  itemId: string;
  index: number;
  attempted: boolean;
  retried: boolean;
}

interface SessionLookup {
  itemId: string | null;
  session: ComparisonSession | null;
  isLoading: boolean;
  error: string | null;
}

const getRankOutcome = (items: Item[], itemId: string): RankOutcome | null => {
  const rankedItems = items.filter((item) => item.rating !== null);
  const rank = rankedItems.findIndex((item) => item.item_id === itemId) + 1;
  const item = rankedItems[rank - 1];
  if (!item || item.rating === null) return null;
  return {
    itemId,
    name: item.name,
    rank,
    rankedCount: rankedItems.length,
    score: item.rating,
  };
};

export const ListDetailScreen: React.FC<ListDetailScreenProps> = ({
  route,
  navigation,
}) => {
  const { token } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const {
    listId,
    listTitle: routeTitle,
    promptAddItem,
    completedItemId,
  } = route.params;
  const isDesktop = windowWidth >= AppLayout.desktopBreakpoint;
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [detailsTitle, setDetailsTitle] = useState(routeTitle);
  const [listDescription, setListDescription] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [dismissedDetailsItemId, setDismissedDetailsItemId] = useState<
    string | null
  >(null);
  const [sessionLookup, setSessionLookup] = useState<SessionLookup>({
    itemId: null,
    session: null,
    isLoading: false,
    error: null,
  });
  const [outcome, setOutcome] = useState<RankOutcome | null>(null);
  const [isDeletingList, setIsDeletingList] = useState(false);
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Item> | null>(null);
  const itemRowRefs = useRef(new Map<string, FocusTarget>());
  const pendingScrollRef = useRef<PendingScroll | null>(null);
  const itemsRequestRef = useRef(0);
  const metadataRequestRef = useRef(0);
  const hasLoadedItemsRef = useRef(false);
  const selectedItemIdRef = useRef<string | null>(null);
  const rankingCandidateIdRef = useRef<string | null>(null);
  const consumedCompletedItemIdRef = useRef<string | null>(null);
  const promptHandledRef = useRef(false);
  const bypassBeforeRemoveRef = useRef(false);
  const closingForNavigationRef = useRef(false);
  const skipWorkspaceCloseFocusRef = useRef(false);
  const deletingListInFlightRef = useRef(false);
  const previousDesktopRef = useRef(isDesktop);

  selectedItemIdRef.current = selectedItemId;

  const focusItemRow = useCallback((itemId: string | null) => {
    if (Platform.OS !== 'web' || !itemId) return;
    requestAnimationFrame(() => itemRowRefs.current.get(itemId)?.focus?.());
  }, []);
  const focusAddButton = useCallback(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('[data-testid=fab-add-item]')?.focus()
    );
  }, []);

  const fetchItems = useCallback(async () => {
    if (!token) {
      setIsLoadingItems(false);
      return [];
    }
    const requestId = ++itemsRequestRef.current;
    if (!hasLoadedItemsRef.current) setIsLoadingItems(true);

    try {
      const nextItems = await listsService.getListItems(listId, token);
      if (requestId !== itemsRequestRef.current) return itemsRef.current;
      itemsRef.current = nextItems;
      setItems(nextItems);
      setItemsLoaded(true);
      setItemsError(null);
      hasLoadedItemsRef.current = true;
      return nextItems;
    } catch {
      if (requestId === itemsRequestRef.current) {
        setItemsError('Unable to refresh items. Try again.');
      }
      throw new Error('Unable to refresh items. Try again.');
    } finally {
      if (requestId === itemsRequestRef.current) setIsLoadingItems(false);
    }
  }, [listId, token]);

  useEffect(() => {
    if (previousDesktopRef.current && !isDesktop) {
      setDismissedDetailsItemId(null);
    }
    previousDesktopRef.current = isDesktop;
  }, [isDesktop]);

  useEffect(() => {
    itemsRequestRef.current += 1;
    hasLoadedItemsRef.current = false;
    itemsRef.current = [];
    setItems([]);
    setItemsLoaded(false);
    setIsLoadingItems(true);
    setItemsError(null);
    setSelectedItemId(null);
    setScrollTargetId(null);
    pendingScrollRef.current = null;
    setDismissedDetailsItemId(null);
    setOutcome(null);
    void fetchItems().catch(() => {});
    return () => {
      itemsRequestRef.current += 1;
    };
  }, [fetchItems]);

  useEffect(() => {
    setDetailsTitle(routeTitle);
    setListDescription(null);
    setMetadataError(false);
  }, [routeTitle]);

  const refreshMetadata = useCallback(async () => {
    const requestId = ++metadataRequestRef.current;
    if (!token) {
      setMetadataError(true);
      return;
    }
    setMetadataError(false);
    try {
      const list = await listsService.getList(listId, token);
      if (requestId === metadataRequestRef.current) {
        setDetailsTitle(list.title);
        setListDescription(list.description);
      }
    } catch {
      if (requestId === metadataRequestRef.current) setMetadataError(true);
    }
  }, [listId, token]);

  useEffect(() => {
    void refreshMetadata();
    return () => {
      metadataRequestRef.current += 1;
    };
  }, [refreshMetadata]);

  const handleWorkspaceItemsChanged = useCallback(
    async (item?: Item) => {
      const existedBeforeRefresh = item
        ? itemsRef.current.some((existing) => existing.item_id === item.item_id)
        : false;
      const shouldShowOutcome =
        item !== undefined &&
        (!existedBeforeRefresh ||
          rankingCandidateIdRef.current === item.item_id);
      const refreshedItems = await fetchItems();
      if (
        item &&
        !refreshedItems.some((entry) => entry.item_id === item.item_id)
      ) {
        return;
      }

      if (item) {
        pendingScrollRef.current = {
          itemId: item.item_id,
          index: -1,
          attempted: false,
          retried: false,
        };
        setScrollTargetId(item.item_id);
        setSelectedItemId(item.item_id);
        if (shouldShowOutcome) {
          const completedOutcome = getRankOutcome(refreshedItems, item.item_id);
          if (completedOutcome) {
            setOutcome(completedOutcome);
            setDismissedDetailsItemId(item.item_id);
            focusItemRow(item.item_id);
          }
        }
      }
    },
    [fetchItems, focusItemRow]
  );

  const refreshSessionLookup = useCallback(
    async (itemId: string) => {
      if (!token) {
        if (selectedItemIdRef.current === itemId) {
          setSessionLookup({
            itemId,
            session: null,
            isLoading: false,
            error: 'Sign in again to check ranking status.',
          });
        }
        return;
      }

      setSessionLookup({ itemId, session: null, isLoading: true, error: null });
      try {
        const session = await itemsService.getComparison(itemId, token);
        if (selectedItemIdRef.current === itemId) {
          setSessionLookup({ itemId, session, isLoading: false, error: null });
        }
      } catch (error: unknown) {
        if (selectedItemIdRef.current !== itemId) return;
        setSessionLookup({
          itemId,
          session: null,
          isLoading: false,
          error: `Unable to check ranking status. ${getApiErrorMessage(error, 'Try again.')}`,
        });
        if (error instanceof ApiError && error.status === 404) {
          void fetchItems().catch(() => {});
        }
      }
    },
    [fetchItems, token]
  );

  const handleWorkspaceClosed = useCallback(() => {
    rankingCandidateIdRef.current = null;
    if (selectedItemId) {
      void refreshSessionLookup(selectedItemId);
      if (
        !skipWorkspaceCloseFocusRef.current &&
        (isDesktop || dismissedDetailsItemId === selectedItemId)
      ) {
        focusItemRow(selectedItemId);
      }
    } else if (!skipWorkspaceCloseFocusRef.current) {
      focusAddButton();
    }
  }, [
    dismissedDetailsItemId,
    focusAddButton,
    focusItemRow,
    isDesktop,
    refreshSessionLookup,
    selectedItemId,
  ]);

  const workspace = useItemWorkspace({
    listTitle: detailsTitle,
    token,
    onItemsChanged: handleWorkspaceItemsChanged,
    onClosed: handleWorkspaceClosed,
  });
  const workspaceBusyRef = useRef(workspace.isBusy);
  workspaceBusyRef.current = workspace.isBusy;
  const requestCloseForSwitch = useCallback(async () => {
    if (skipWorkspaceCloseFocusRef.current) return false;
    skipWorkspaceCloseFocusRef.current = true;
    try {
      return await workspace.requestClose();
    } catch {
      return false;
    } finally {
      skipWorkspaceCloseFocusRef.current = false;
    }
  }, [workspace.requestClose]);

  useEffect(() => {
    if (workspace.mode === 'ranking' && workspace.item) {
      rankingCandidateIdRef.current = workspace.item.item_id;
    }
  }, [workspace.item, workspace.mode]);

  const selectedItem =
    items.find((item) => item.item_id === selectedItemId) ?? null;
  const hasSelectedItem = selectedItem !== null;
  const rankByItemId = useMemo(() => {
    const ranks = new Map<string, number>();
    for (const item of items) {
      if (item.rating !== null) ranks.set(item.item_id, ranks.size + 1);
    }
    return ranks;
  }, [items]);
  const rankedCount = rankByItemId.size;
  const selectedRank = selectedItemId
    ? (rankByItemId.get(selectedItemId) ?? null)
    : null;
  const matchedSessionLookup =
    selectedItemId !== null && sessionLookup.itemId === selectedItemId;
  const selectedSession = matchedSessionLookup ? sessionLookup.session : null;
  const isLoadingSession =
    selectedItemId !== null &&
    (!matchedSessionLookup || sessionLookup.isLoading);
  const sessionError = matchedSessionLookup ? sessionLookup.error : null;

  const retrySessionLookup = useCallback(() => {
    if (selectedItemId) void refreshSessionLookup(selectedItemId);
  }, [refreshSessionLookup, selectedItemId]);

  useEffect(() => {
    if (selectedItemId && hasSelectedItem) {
      void refreshSessionLookup(selectedItemId);
    }
  }, [refreshSessionLookup, hasSelectedItem, selectedItemId]);

  useEffect(() => {
    if (!selectedItemId || !itemsLoaded) return;
    if (items.some((item) => item.item_id === selectedItemId)) return;
    if (workspace.isBusy) return;
    if (workspace.mode !== 'closed') {
      workspace.closeMissingItem(selectedItemId);
      return;
    }
    setSelectedItemId(null);
    setDismissedDetailsItemId(null);
    setOutcome((current) =>
      current?.itemId === selectedItemId ? null : current
    );
  }, [
    items,
    itemsLoaded,
    selectedItemId,
    workspace.closeMissingItem,
    workspace.mode,
    workspace.isBusy,
  ]);

  useEffect(() => {
    if (!completedItemId) {
      consumedCompletedItemIdRef.current = null;
      return;
    }
    if (
      consumedCompletedItemIdRef.current === completedItemId ||
      !itemsLoaded
    ) {
      return;
    }

    const completedItem = items.find(
      (item) => item.item_id === completedItemId
    );
    if (completedItem) {
      setSelectedItemId(completedItemId);
      pendingScrollRef.current = {
        itemId: completedItemId,
        index: -1,
        attempted: false,
        retried: false,
      };
      setScrollTargetId(completedItemId);
      const completedOutcome = getRankOutcome(items, completedItemId);
      if (completedOutcome) {
        setOutcome(completedOutcome);
        setDismissedDetailsItemId(completedItemId);
      }
    }
    consumedCompletedItemIdRef.current = completedItemId;
    navigation.setParams({ completedItemId: undefined });
  }, [completedItemId, items, itemsLoaded, navigation]);

  useLayoutEffect(() => {
    const pending = pendingScrollRef.current;
    if (!pending || pending.attempted || scrollTargetId !== pending.itemId)
      return;
    const index = items.findIndex((item) => item.item_id === pending.itemId);
    if (index < 0) {
      if (itemsLoaded) {
        pendingScrollRef.current = null;
        setScrollTargetId(null);
      }
      return;
    }
    if (!listRef.current) return;

    pending.index = index;
    pending.attempted = true;
    listRef.current.scrollToIndex({
      index,
      animated: false,
      viewPosition: 0,
    });
    setScrollTargetId(null);
  }, [items, itemsLoaded, scrollTargetId]);

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      const pending = pendingScrollRef.current;
      if (!pending || pending.retried) return;
      pending.retried = true;
      listRef.current?.scrollToOffset({
        offset: info.averageItemLength * pending.index,
        animated: false,
      });
      requestAnimationFrame(() => {
        if (pendingScrollRef.current === pending) {
          listRef.current?.scrollToIndex({
            index: pending.index,
            animated: false,
            viewPosition: 0,
          });
        }
      });
    },
    []
  );

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleDeleteList = useCallback(async () => {
    if (deletingListInFlightRef.current || workspaceBusyRef.current || !token)
      return;
    deletingListInFlightRef.current = true;
    setIsDeletingList(true);
    try {
      const confirmed = await confirmDestructive(
        'Delete List',
        'Are you sure you want to delete this list? All items will be permanently deleted.',
        'Delete'
      );
      if (!confirmed || workspaceBusyRef.current) return;
      await listsService.deleteList(listId, token);
      bypassBeforeRemoveRef.current = true;
      navigation.goBack();
    } catch (err: unknown) {
      notifyError(
        'Error',
        err instanceof Error ? err.message : 'Failed to delete list'
      );
    } finally {
      if (!bypassBeforeRemoveRef.current) {
        deletingListInFlightRef.current = false;
        setIsDeletingList(false);
      }
    }
  }, [listId, navigation, token]);

  const handleItemPress = useCallback(
    async (item: Item) => {
      if (deletingListInFlightRef.current) return;
      if (workspace.mode !== 'closed') {
        const canClose = await requestCloseForSwitch();
        if (!canClose) return;
      }
      setSelectedItemId(item.item_id);
      setDismissedDetailsItemId(null);
    },
    [requestCloseForSwitch, workspace.mode]
  );

  const handleAddPress = useCallback(async () => {
    if (deletingListInFlightRef.current) return;
    const canClose = await requestCloseForSwitch();
    if (!canClose) return;
    setSelectedItemId(null);
    setDismissedDetailsItemId(null);
    workspace.openAdd();
  }, [requestCloseForSwitch, workspace.openAdd]);

  const handleWorkspaceContentClose = useCallback(() => {
    if (deletingListInFlightRef.current) return;
    if (workspace.mode !== 'closed') {
      void workspace.requestClose().catch(() => false);
      return;
    }
    setSelectedItemId(null);
    setDismissedDetailsItemId(null);
    focusItemRow(selectedItemId);
  }, [focusItemRow, selectedItemId, workspace.mode, workspace.requestClose]);

  const handleOpenRange = useCallback(() => {
    if (!selectedItem) return;
    rankingCandidateIdRef.current = selectedItem.item_id;
    workspace.openRange(selectedItem);
  }, [selectedItem, workspace.openRange]);

  const handleResume = useCallback(() => {
    if (!selectedSession) return;
    rankingCandidateIdRef.current = selectedSession.item_id;
    workspace.resume(selectedSession);
  }, [selectedSession, workspace.resume]);

  const handleEditItem = useCallback(() => {
    if (selectedItem) workspace.openEdit(selectedItem);
  }, [selectedItem, workspace.openEdit]);

  const handleDeleteItem = useCallback(() => {
    if (selectedItem) void workspace.deleteItem(selectedItem);
  }, [selectedItem, workspace.deleteItem]);

  const handleStartRanking = useCallback(() => {
    void workspace.startRanking();
  }, [workspace.startRanking]);

  const handleDismissOutcome = useCallback(() => {
    setOutcome(null);
  }, []);

  const handleMetadataRetry = useCallback(() => {
    void refreshMetadata();
  }, [refreshMetadata]);

  const handleListItemsRetry = useCallback(() => {
    void fetchItems().catch(() => {});
  }, [fetchItems]);

  const handleMobileClose = useCallback(() => {
    if (deletingListInFlightRef.current) return;
    if (workspace.mode !== 'closed') {
      void workspace.requestClose().catch(() => false);
      return;
    }
    handleWorkspaceContentClose();
  }, [handleWorkspaceContentClose, workspace.mode, workspace.requestClose]);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (bypassBeforeRemoveRef.current) {
          bypassBeforeRemoveRef.current = false;
          return;
        }
        if (
          deletingListInFlightRef.current ||
          closingForNavigationRef.current ||
          skipWorkspaceCloseFocusRef.current
        ) {
          event.preventDefault();
          return;
        }
        if (workspace.mode === 'closed') {
          if (
            !isDesktop &&
            selectedItemId !== null &&
            dismissedDetailsItemId !== selectedItemId
          ) {
            event.preventDefault();
            handleWorkspaceContentClose();
          }
          return;
        }

        event.preventDefault();
        closingForNavigationRef.current = true;
        const action = event.data.action;
        void requestCloseForSwitch()
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
    [
      dismissedDetailsItemId,
      handleWorkspaceContentClose,
      isDesktop,
      navigation,
      selectedItemId,
      workspace.mode,
      requestCloseForSwitch,
    ]
  );

  useEffect(() => {
    if (!promptAddItem) {
      promptHandledRef.current = false;
      return;
    }
    if (promptHandledRef.current) return;
    promptHandledRef.current = true;
    void handleAddPress();
    navigation.setParams({ promptAddItem: undefined });
  }, [handleAddPress, navigation, promptAddItem]);

  const renderItem = ({ item }: ListRenderItemInfo<Item>) => (
    <ListDetailItemRow
      item={item}
      selected={selectedItemId === item.item_id}
      rank={rankByItemId.get(item.item_id) ?? null}
      disabled={isDeletingList}
      onPress={(selected) => void handleItemPress(selected)}
      onFocusTarget={(itemId, element) => {
        if (element) itemRowRefs.current.set(itemId, element);
        else itemRowRefs.current.delete(itemId);
      }}
    />
  );
  const renderListItems = () => {
    if (isLoadingItems && !itemsLoaded) {
      return (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={AppColors.accent.primary} />
        </View>
      );
    }
    if (items.length === 0 && !itemsError) return <ListItemEmptyState />;
    if (items.length === 0 && itemsError) {
      return (
        <View style={styles.loadingState}>
          <Text style={styles.refreshError} accessibilityRole="alert">
            {itemsError}
          </Text>
          <TouchableOpacity
            onPress={handleListItemsRetry}
            accessibilityRole="button"
            accessibilityLabel="Retry loading items"
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <FlatList
        ref={listRef}
        style={styles.list}
        data={items}
        keyExtractor={(item) => item.item_id}
        contentContainerStyle={[
          styles.listContainer,
          { paddingBottom: AppSpacing.md + safeAreaInsets.bottom },
        ]}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        onScrollToIndexFailed={handleScrollToIndexFailed}
      />
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.shell}>
          <View
            style={[
              styles.shellContent,
              {
                marginHorizontal: isDesktop ? AppSpacing.lg : AppSpacing.md,
              },
            ]}
          >
            <ListDetailHeader
              title={detailsTitle}
              description={listDescription}
              outcome={outcome}
              metadataError={metadataError}
              itemCount={items.length}
              rankedCount={rankedCount}
              addDisabled={isDeletingList}
              onAdd={() => void handleAddPress()}
              deleteDisabled={workspace.isBusy || isDeletingList}
              onBack={handleBack}
              onDelete={() => void handleDeleteList()}
              onRetryMetadata={handleMetadataRetry}
              onDismissOutcome={handleDismissOutcome}
            />
            {itemsError && items.length > 0 ? (
              <View style={styles.itemsError}>
                <Text style={styles.refreshError} accessibilityRole="alert">
                  {itemsError}
                </Text>
                <TouchableOpacity
                  onPress={handleListItemsRetry}
                  accessibilityRole="button"
                  accessibilityLabel="Retry refreshing items"
                  style={styles.inlineRetryButton}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <ListDetailWorkspaceHost
              isDesktop={isDesktop}
              isScreenBusy={isDeletingList}
              listTitle={detailsTitle}
              selectedItemId={selectedItemId}
              dismissedDetailsItemId={dismissedDetailsItemId}
              selectedItem={selectedItem}
              selectedRank={selectedRank}
              rankedCount={rankedCount}
              selectedSession={selectedSession}
              isLoadingSession={isLoadingSession}
              sessionError={sessionError}
              isLoadingItems={isLoadingItems}
              itemsLoaded={itemsLoaded}
              workspace={workspace}
              onRetrySession={retrySessionLookup}
              onOpenRange={handleOpenRange}
              onResume={handleResume}
              onEdit={handleEditItem}
              onDelete={handleDeleteItem}
              onDetailsClose={handleWorkspaceContentClose}
              onMobileClose={handleMobileClose}
              onStartRanking={handleStartRanking}
            >
              {renderListItems()}
            </ListDetailWorkspaceHost>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};
