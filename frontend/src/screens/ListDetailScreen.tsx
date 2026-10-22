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
import { ListDetailHeader } from '../components/ListDetailHeader';
import {
  type FocusTarget,
  ListDetailItemRow,
  ListItemEmptyState,
} from '../components/ListDetailItemRow';
import { ListDetailWorkspaceHost } from '../components/ListDetailWorkspaceHost';
import { useItemWorkspace } from '../components/useItemWorkspace';
import type { ListColor } from '../design-system/tokens/colors';
import type { RootStackScreenProps } from '../navigation/types';
import { useAuth } from '../providers/AuthContext';
import { useThemeColors } from '../providers/ThemeProvider';
import { ApiError, getApiErrorMessage } from '../services/apiError';
import {
  type ComparisonSession,
  type Item,
  itemsService,
} from '../services/itemsService';
import { findNextDraftSession } from '../services/itemWorkspaceActions';
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

export const ListDetailScreen: React.FC<ListDetailScreenProps> = ({
  route,
  navigation,
}) => {
  const { token } = useAuth();
  const colors = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const {
    listId,
    listTitle: routeTitle,
    promptAddItem,
    completedItemId,
  } = route.params;
  const isDesktop = windowWidth >= 1024;
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [detailsTitle, setDetailsTitle] = useState(routeTitle);
  const [listDescription, setListDescription] = useState<string | null>(null);
  const [listColor, setListColor] = useState<ListColor | null>(null);
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
  const resolvedDraftIdsRef = useRef(new Set<string>());

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
    resolvedDraftIdsRef.current.clear();
    void fetchItems().catch(() => {});
    return () => {
      itemsRequestRef.current += 1;
    };
  }, [fetchItems]);

  useEffect(() => {
    setDetailsTitle(routeTitle);
    setListDescription(null);
    setListColor(null);
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
        setListColor(list.color);
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
      const isCompletedRankingCandidate =
        item !== undefined &&
        (!existedBeforeRefresh ||
          rankingCandidateIdRef.current === item.item_id);
      const refreshedItems = await fetchItems();
      if (
        item &&
        !refreshedItems.some((entry) => entry.item_id === item.item_id)
      )
        return;

      if (item) {
        pendingScrollRef.current = {
          itemId: item.item_id,
          index: -1,
          attempted: false,
          retried: false,
        };
        setScrollTargetId(item.item_id);
        setSelectedItemId(item.item_id);
        if (isCompletedRankingCandidate) {
          setDismissedDetailsItemId(item.item_id);
          focusItemRow(item.item_id);
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
    if (rankingCandidateIdRef.current) {
      resolvedDraftIdsRef.current.add(rankingCandidateIdRef.current);
    }
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
      if (workspace.mode === 'ranking') {
        if (workspace.item)
          resolvedDraftIdsRef.current.add(workspace.item.item_id);
        return workspace.pauseRanking();
      }
      return await workspace.requestClose();
    } catch {
      return false;
    } finally {
      skipWorkspaceCloseFocusRef.current = false;
    }
  }, [
    workspace.item,
    workspace.mode,
    workspace.pauseRanking,
    workspace.requestClose,
  ]);

  useEffect(() => {
    if (workspace.mode === 'ranking' && workspace.item) {
      rankingCandidateIdRef.current = workspace.item.item_id;
    }
  }, [workspace.item, workspace.mode]);

  useEffect(() => {
    if (
      !itemsLoaded ||
      !token ||
      promptAddItem ||
      completedItemId ||
      workspace.mode !== 'closed' ||
      workspace.isBusy ||
      isDeletingList
    )
      return;
    if (
      !items.some(
        (item) =>
          item.rating === null && !resolvedDraftIdsRef.current.has(item.item_id)
      )
    )
      return;
    let cancelled = false;
    void findNextDraftSession(items, resolvedDraftIdsRef.current, token).then(
      (session) => {
        if (cancelled || !session) return;
        resolvedDraftIdsRef.current.add(session.item_id);
        rankingCandidateIdRef.current = session.item_id;
        setSelectedItemId(session.item_id);
        setDismissedDetailsItemId(null);
        workspace.resume(session);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [
    completedItemId,
    isDeletingList,
    items,
    itemsLoaded,
    promptAddItem,
    token,
    workspace.isBusy,
    workspace.mode,
    workspace.resume,
  ]);

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
      setDismissedDetailsItemId(completedItemId);
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
  const handleMobileClose = useCallback(() => {
    if (deletingListInFlightRef.current) return;
    if (workspace.mode !== 'closed') {
      void requestCloseForSwitch().catch(() => false);
      return;
    }
    handleWorkspaceContentClose();
  }, [handleWorkspaceContentClose, requestCloseForSwitch, workspace.mode]);
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
      rankedCount={rankedCount}
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
        <View className="flex-1 items-center justify-center px-6">
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      );
    }
    if (items.length === 0 && !itemsError)
      return (
        <ListItemEmptyState
          onAdd={() => void handleAddPress()}
          disabled={
            isDeletingList || workspace.isBusy || workspace.mode === 'add'
          }
        />
      );
    if (items.length === 0 && itemsError) {
      return (
        <View className="flex-1 items-center justify-center px-6">
          <Text
            className="text-body-small text-danger-text dark:text-danger-text-dark shrink"
            accessibilityRole="alert"
          >
            {itemsError}
          </Text>
          <TouchableOpacity
            onPress={() => void fetchItems().catch(() => {})}
            accessibilityRole="button"
            accessibilityLabel="Retry loading items"
            className="border border-control dark:border-control-dark rounded px-4 py-1 min-h-11 justify-center"
          >
            <Text className="text-label-medium font-semibold text-accent-text dark:text-accent-text-dark">
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <FlatList
        ref={listRef}
        className="flex-1 min-h-0"
        data={items}
        keyExtractor={(item) => item.item_id}
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: 16 + safeAreaInsets.bottom,
        }}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        onScrollToIndexFailed={handleScrollToIndexFailed}
      />
    );
  };

  return (
    <View className="flex-1 min-h-0 bg-canvas dark:bg-canvas-dark">
      <SafeAreaView
        className={`flex-1 min-h-0${Platform.OS === 'web' ? ' web-safe-area-top' : ''}`}
        edges={['top']}
      >
        <View className="w-full max-w-[1280px] self-center flex-1 min-h-0">
          <View className="flex-1 min-h-0 mx-4 desktop:mx-6">
            <ListDetailHeader
              title={detailsTitle}
              color={listColor}
              description={listDescription}
              metadataError={metadataError}
              itemCount={items.length}
              rankedCount={rankedCount}
              addDisabled={
                isDeletingList || workspace.isBusy || workspace.mode === 'add'
              }
              onAdd={() => void handleAddPress()}
              deleteDisabled={workspace.isBusy || isDeletingList}
              onBack={() => navigation.goBack()}
              onDelete={() => void handleDeleteList()}
              onRetryMetadata={() => void refreshMetadata()}
            />
            {itemsError && items.length > 0 ? (
              <View className="flex-row items-center justify-between py-1">
                <Text
                  className="text-body-small text-danger-text dark:text-danger-text-dark shrink"
                  accessibilityRole="alert"
                >
                  {itemsError}
                </Text>
                <TouchableOpacity
                  onPress={() => void fetchItems().catch(() => {})}
                  accessibilityRole="button"
                  accessibilityLabel="Retry refreshing items"
                  className="px-4 py-1 min-h-11 justify-center"
                >
                  <Text className="text-label-medium font-semibold text-accent-text dark:text-accent-text-dark">
                    Retry
                  </Text>
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
              onRetrySession={() => {
                if (selectedItemId) void refreshSessionLookup(selectedItemId);
              }}
              onOpenRange={handleOpenRange}
              onResume={handleResume}
              onEdit={() => {
                if (selectedItem) workspace.openEdit(selectedItem);
              }}
              onDelete={() => {
                if (selectedItem) void workspace.deleteItem(selectedItem);
              }}
              onDetailsClose={handleWorkspaceContentClose}
              onMobileClose={handleMobileClose}
              onStartRanking={() => void workspace.startRanking()}
            >
              {renderListItems()}
            </ListDetailWorkspaceHost>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};
