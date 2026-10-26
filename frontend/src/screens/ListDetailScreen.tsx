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
import { useListDetailData } from '../components/useListDetailData';
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
  requestId: number;
  session: ComparisonSession | null;
  isLoading: boolean;
  error: string | null;
}

export const ListDetailScreen: React.FC<ListDetailScreenProps> = ({
  route,
  navigation,
}) => {
  const { user, token } = useAuth();
  const userId = user?.id ?? null;
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
  const screenIdentity = JSON.stringify([userId, token, listId]);
  const {
    items,
    itemsRef,
    isLoadingItems,
    itemsLoaded,
    hasItemsSnapshot,
    itemsError,
    detailsTitle,
    listDescription,
    listColor,
    metadataError,
    metadataLoaded,
    fetchItems,
    refreshMetadata,
    refreshAfterMutation,
    evictDeletedList,
  } = useListDetailData({ userId, token, listId, routeTitle });
  const canMutate =
    itemsLoaded && metadataLoaded && !itemsError && !metadataError;
  const sessionLookupRequestRef = useRef(0);
  const identityRef = useRef(screenIdentity);
  if (identityRef.current !== screenIdentity) {
    identityRef.current = screenIdentity;
    sessionLookupRequestRef.current++;
  }
  const canMutateRef = useRef(canMutate);
  canMutateRef.current = canMutate;
  const canMutateFor = useCallback(
    (identity: string) =>
      identityRef.current === identity && canMutateRef.current,
    []
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [dismissedDetailsItemId, setDismissedDetailsItemId] = useState<
    string | null
  >(null);
  const [sessionLookup, setSessionLookup] = useState<SessionLookup>({
    itemId: null,
    requestId: 0,
    session: null,
    isLoading: false,
    error: null,
  });
  const [isDeletingList, setIsDeletingList] = useState(false);
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Item> | null>(null);
  const itemRowRefs = useRef(new Map<string, FocusTarget>());
  const pendingScrollRef = useRef<PendingScroll | null>(null);
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
  const liveItemsSnapshot = useMemo(
    () => ({ items, itemsLoaded, screenIdentity }),
    [items, itemsLoaded, screenIdentity]
  );
  const liveItemsSnapshotRef = useRef(liveItemsSnapshot);
  if (liveItemsSnapshotRef.current !== liveItemsSnapshot) {
    sessionLookupRequestRef.current++;
    liveItemsSnapshotRef.current = liveItemsSnapshot;
  }
  if (selectedItemIdRef.current !== selectedItemId) {
    selectedItemIdRef.current = selectedItemId;
    sessionLookupRequestRef.current++;
  }

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

  useEffect(() => {
    if (previousDesktopRef.current && !isDesktop) {
      setDismissedDetailsItemId(null);
    }
    previousDesktopRef.current = isDesktop;
  }, [isDesktop]);

  useEffect(() => {
    identityRef.current = screenIdentity;
    setSelectedItemId(null);
    setScrollTargetId(null);
    pendingScrollRef.current = null;
    setDismissedDetailsItemId(null);
    resolvedDraftIdsRef.current.clear();
    return () => {
      sessionLookupRequestRef.current++;
    };
  }, [screenIdentity]);

  const handleWorkspaceItemsChanged = useCallback(
    async (item?: Item) => {
      const identity = screenIdentity;
      const existed = Boolean(
        item && itemsRef.current.some((entry) => entry.item_id === item.item_id)
      );
      const isCompleted =
        item !== undefined &&
        (!existed || rankingCandidateIdRef.current === item.item_id);
      const refreshedItems = await refreshAfterMutation();
      if (identityRef.current !== identity) return;
      if (
        item &&
        !refreshedItems.some((entry) => entry.item_id === item.item_id)
      )
        return;
      if (!item) return;
      pendingScrollRef.current = {
        itemId: item.item_id,
        index: -1,
        attempted: false,
        retried: false,
      };
      setScrollTargetId(item.item_id);
      setSelectedItemId(item.item_id);
      if (isCompleted) {
        setDismissedDetailsItemId(item.item_id);
        focusItemRow(item.item_id);
      }
    },
    [refreshAfterMutation, focusItemRow, itemsRef, screenIdentity]
  );

  const refreshSessionLookup = useCallback(
    async (itemId: string) => {
      const identity = screenIdentity;
      const lookup: SessionLookup = {
        itemId,
        requestId: ++sessionLookupRequestRef.current,
        session: null,
        isLoading: true,
        error: null,
      };
      const isCurrent = () =>
        lookup.requestId === sessionLookupRequestRef.current &&
        identity === identityRef.current &&
        selectedItemIdRef.current === itemId;
      if (!isCurrent()) return;
      setSessionLookup(lookup);
      if (!token) {
        setSessionLookup({
          ...lookup,
          isLoading: false,
          error: 'Sign in again to check ranking status.',
        });
        return;
      }
      try {
        const session = await itemsService.getComparison(itemId, token);
        if (isCurrent())
          setSessionLookup({ ...lookup, session, isLoading: false });
      } catch (error: unknown) {
        if (!isCurrent()) return;
        if (error instanceof ApiError && error.status === 404)
          void fetchItems().catch(() => {});
        setSessionLookup({
          ...lookup,
          isLoading: false,
          error: `Unable to check ranking status. ${getApiErrorMessage(error, 'Try again.')}`,
        });
      }
    },
    [fetchItems, screenIdentity, token]
  );
  const handleWorkspaceClosed = useCallback(() => {
    if (rankingCandidateIdRef.current)
      resolvedDraftIdsRef.current.add(rankingCandidateIdRef.current);
    rankingCandidateIdRef.current = null;
    if (
      selectedItemId &&
      !skipWorkspaceCloseFocusRef.current &&
      (isDesktop || dismissedDetailsItemId === selectedItemId)
    )
      focusItemRow(selectedItemId);
    else if (!selectedItemId && !skipWorkspaceCloseFocusRef.current)
      focusAddButton();
  }, [
    dismissedDetailsItemId,
    focusAddButton,
    focusItemRow,
    isDesktop,
    selectedItemId,
  ]);

  const workspace = useItemWorkspace({
    listTitle: detailsTitle,
    token,
    onItemsChanged: handleWorkspaceItemsChanged,
    onClosed: handleWorkspaceClosed,
  });
  const workspaceModeRef = useRef(workspace.mode);
  if (workspaceModeRef.current !== workspace.mode) {
    workspaceModeRef.current = workspace.mode;
    sessionLookupRequestRef.current++;
  }
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
  const liveItemsGeneration = liveItemsSnapshot;

  useEffect(() => {
    if (
      !canMutate ||
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
        if (
          cancelled ||
          !session ||
          !canMutateFor(screenIdentity) ||
          liveItemsSnapshotRef.current !== liveItemsGeneration ||
          !liveItemsSnapshotRef.current.itemsLoaded ||
          workspaceModeRef.current !== 'closed'
        )
          return;
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
    canMutate,
    canMutateFor,
    completedItemId,
    isDeletingList,
    items,
    liveItemsGeneration,
    promptAddItem,
    screenIdentity,
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
    itemsLoaded &&
    selectedItemId !== null &&
    sessionLookup.itemId === selectedItemId &&
    sessionLookup.requestId === sessionLookupRequestRef.current;
  const selectedSession = matchedSessionLookup ? sessionLookup.session : null;
  const isLoadingSession =
    selectedItemId !== null &&
    (!matchedSessionLookup || sessionLookup.isLoading);
  const sessionError = matchedSessionLookup ? sessionLookup.error : null;

  useEffect(() => {
    if (
      liveItemsSnapshot.itemsLoaded &&
      selectedItemId &&
      hasSelectedItem &&
      workspace.mode === 'closed'
    )
      void refreshSessionLookup(selectedItemId);
  }, [
    hasSelectedItem,
    liveItemsSnapshot,
    refreshSessionLookup,
    selectedItemId,
    workspace.mode,
  ]);

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
    ({ averageItemLength }: { index: number; averageItemLength: number }) => {
      const pending = pendingScrollRef.current;
      if (!pending || pending.retried) return;
      pending.retried = true;
      listRef.current?.scrollToOffset({
        offset: averageItemLength * pending.index,
        animated: false,
      });
      requestAnimationFrame(
        () =>
          pendingScrollRef.current === pending &&
          listRef.current?.scrollToIndex({
            index: pending.index,
            animated: false,
            viewPosition: 0,
          })
      );
    },
    []
  );

  const handleDeleteList = useCallback(async () => {
    const identity = screenIdentity;
    if (
      deletingListInFlightRef.current ||
      workspaceBusyRef.current ||
      !token ||
      !canMutateFor(identity)
    )
      return;
    deletingListInFlightRef.current = true;
    setIsDeletingList(true);
    try {
      const confirmed = await confirmDestructive(
        'Delete List',
        'Are you sure you want to delete this list? All items will be permanently deleted.',
        'Delete'
      );
      if (!confirmed || workspaceBusyRef.current || !canMutateFor(identity))
        return;
      await listsService.deleteList(listId, token);
      if (identityRef.current !== identity) return;
      await evictDeletedList();
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
  }, [
    canMutateFor,
    evictDeletedList,
    listId,
    navigation,
    screenIdentity,
    token,
  ]);
  const handleItemPress = async (item: Item) => {
    const identity = screenIdentity;
    if (deletingListInFlightRef.current) return;
    if (workspace.mode !== 'closed' && !(await requestCloseForSwitch())) return;
    if (identityRef.current !== identity || deletingListInFlightRef.current)
      return;
    setSelectedItemId(item.item_id);
    setDismissedDetailsItemId(null);
  };
  const handleAddPress = useCallback(async () => {
    const identity = screenIdentity;
    if (
      deletingListInFlightRef.current ||
      !canMutateFor(identity) ||
      !(await requestCloseForSwitch()) ||
      deletingListInFlightRef.current ||
      !canMutateFor(identity)
    )
      return false;
    setSelectedItemId(null);
    setDismissedDetailsItemId(null);
    workspace.openAdd();
    return true;
  }, [canMutateFor, requestCloseForSwitch, screenIdentity, workspace.openAdd]);
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
  const handleOpenRange = () => {
    if (!selectedItem || !canMutateFor(screenIdentity)) return;
    rankingCandidateIdRef.current = selectedItem.item_id;
    workspace.openRange(selectedItem);
  };
  const handleResume = () => {
    if (
      !selectedSession ||
      !canMutateFor(screenIdentity) ||
      selectedItemIdRef.current !== selectedSession.item_id ||
      sessionLookup.requestId !== sessionLookupRequestRef.current
    )
      return;
    rankingCandidateIdRef.current = selectedSession.item_id;
    workspace.resume(selectedSession);
  };
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
    if (!canMutate || promptHandledRef.current) return;
    promptHandledRef.current = true;
    const identity = screenIdentity;
    void handleAddPress().then((opened) => {
      if (opened) navigation.setParams({ promptAddItem: undefined });
      else if (identityRef.current === identity)
        promptHandledRef.current = false;
    });
  }, [canMutate, handleAddPress, navigation, promptAddItem, screenIdentity]);

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
    if (isLoadingItems && !hasItemsSnapshot) {
      return (
        <View className="flex-1 items-center justify-center px-6">
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      );
    }
    if (items.length === 0 && (hasItemsSnapshot || !itemsError))
      return (
        <ListItemEmptyState
          onAdd={() => void handleAddPress()}
          disabled={
            !canMutate ||
            isDeletingList ||
            workspace.isBusy ||
            workspace.mode === 'add'
          }
        />
      );

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
              itemsError={itemsError}
              showingSavedItems={
                hasItemsSnapshot && !itemsLoaded && !itemsError
              }
              onRetryItems={() => void fetchItems().catch(() => {})}
              itemCount={items.length}
              rankedCount={rankedCount}
              addDisabled={
                !canMutate ||
                isDeletingList ||
                workspace.isBusy ||
                workspace.mode === 'add'
              }
              onAdd={() => void handleAddPress()}
              deleteDisabled={!canMutate || workspace.isBusy || isDeletingList}
              onBack={() => navigation.goBack()}
              onDelete={() => void handleDeleteList()}
              onRetryMetadata={() => void refreshMetadata()}
            />
            <ListDetailWorkspaceHost
              canMutate={canMutate}
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
                if (selectedItem && canMutateFor(screenIdentity))
                  workspace.openEdit(selectedItem);
              }}
              onDelete={() => {
                if (selectedItem && canMutateFor(screenIdentity))
                  void workspace.deleteItem(selectedItem);
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
