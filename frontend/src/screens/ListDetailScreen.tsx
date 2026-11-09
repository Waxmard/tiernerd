import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  type ListRenderItemInfo,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { ImmersiveScreenShell } from '../components/ImmersiveBoard';
import { ListDetailHeader } from '../components/ListDetailHeader';
import {
  ListDetailItemRow,
  ListItemEmptyState,
} from '../components/ListDetailItemRow';
import { ListDetailWorkspaceHost } from '../components/ListDetailWorkspaceHost';
import { useItemWorkspace } from '../components/useItemWorkspace';
import { useListDetailData } from '../components/useListDetailData';
import { useListViewRestore } from '../components/useListViewRestore';
import { useRankingDraft } from '../components/useRankingDraft';
import type { RootStackScreenProps } from '../navigation/types';
import { useAuth } from '../providers/AuthContext';
import { useSync } from '../providers/SyncProvider';
import { useThemeColors } from '../providers/ThemeProvider';
import type { Item } from '../services/itemsService';
import { confirmDestructive, notifyError } from '../utils/confirm';

type ListDetailScreenProps = RootStackScreenProps<'ListDetail'>;

export const ListDetailScreen: React.FC<ListDetailScreenProps> = ({
  route,
  navigation,
}) => {
  const { user, token } = useAuth();
  const { flush, isOffline, lastSyncedAt } = useSync();
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
    isLoadingItems,
    itemsLoaded,
    hasItemsSnapshot,
    itemsError,
    detailsTitle,
    listDescription,
    listColor,
    listIcon,
    listCover,
    listCoverPhoto,
    rankingMode,
    metadataLoaded,
    hasMetadataSnapshot,
    refreshAfterMutation,
    updateListOptions,
    evictDeletedList,
  } = useListDetailData({ userId, token, listId, routeTitle });
  const [isDeletingList, setIsDeletingList] = useState(false);
  const canMutate =
    (itemsLoaded || hasItemsSnapshot) &&
    (metadataLoaded || hasMetadataSnapshot) &&
    !isDeletingList;
  const isLoadingList =
    (!itemsLoaded && !hasItemsSnapshot) ||
    (!metadataLoaded && !hasMetadataSnapshot);
  const isListOptionsOpenRef = useRef(false);
  const [isListOptionsOpen, setIsListOptionsOpen] = useState(false);
  const identityRef = useRef(screenIdentity);
  if (identityRef.current !== screenIdentity) {
    identityRef.current = screenIdentity;
    isListOptionsOpenRef.current = false;
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
  const listRef = useRef<FlatList<Item> | null>(null);
  const selectedItemIdRef = useRef<string | null>(null);
  const consumedCompletedItemIdRef = useRef<string | null>(null);
  const promptHandledRef = useRef(false);
  const bypassBeforeRemoveRef = useRef(false);
  const closingForNavigationRef = useRef(false);
  const skipWorkspaceCloseFocusRef = useRef(false);
  const deletingListInFlightRef = useRef(false);
  const previousDesktopRef = useRef(isDesktop);

  useEffect(() => {
    if (previousDesktopRef.current && !isDesktop) {
      setDismissedDetailsItemId(null);
    }
    previousDesktopRef.current = isDesktop;
  }, [isDesktop]);

  useEffect(() => {
    identityRef.current = screenIdentity;
    setSelectedItemId(null);
    setDismissedDetailsItemId(null);
    setIsListOptionsOpen(false);
    isListOptionsOpenRef.current = false;
  }, [screenIdentity]);

  useEffect(() => {
    if (lastSyncedAt === 0) return;
    void refreshAfterMutation().catch(() => undefined);
  }, [lastSyncedAt, refreshAfterMutation]);

  const wasOfflineRef = useRef(isOffline);
  useEffect(() => {
    if (wasOfflineRef.current && !isOffline) {
      void flush()
        .then(() => refreshAfterMutation())
        .catch(() => undefined);
    }
    wasOfflineRef.current = isOffline;
  }, [flush, isOffline, refreshAfterMutation]);

  const scrollToOffset = useCallback(
    (offset: number) =>
      listRef.current?.scrollToOffset({ offset, animated: false }),
    []
  );
  const view = useListViewRestore({
    identity: screenIdentity,
    userId,
    listId,
    items,
    itemsLoaded,
    selectedItemId,
    dismissedDetailsItemId,
    isDesktop,
    skipRestore: Boolean(promptAddItem || completedItemId),
    setSelectedItemId,
    listRef,
    scrollToOffset,
  });

  const handleWorkspaceItemsChanged = useCallback(
    async (item?: Item) => {
      const identity = screenIdentity;
      const refreshedItems = await refreshAfterMutation();
      if (identityRef.current !== identity) return;
      if (!item) {
        view.clearRestoredSelection();
        setSelectedItemId(null);
        setDismissedDetailsItemId(null);
        return;
      }
      if (!refreshedItems.some((entry) => entry.item_id === item.item_id))
        return;
      view.clearRestoredSelection();
      view.clearRestoredOffset();
      view.scrollToItem(item.item_id);
      setSelectedItemId(item.item_id);
      setDismissedDetailsItemId(item.item_id);
    },
    [view, refreshAfterMutation, screenIdentity]
  );

  const pausedDraftItemIdRef = useRef<string | null>(null);
  const closingItemIdRef = useRef<string | null>(null);
  const workspace = useItemWorkspace({
    userId,
    listId,
    listTitle: detailsTitle,
    items,
    onItemsChanged: handleWorkspaceItemsChanged,
    onClosed: () => {
      if (closingItemIdRef.current)
        pausedDraftItemIdRef.current = closingItemIdRef.current;
    },
  });
  closingItemIdRef.current =
    workspace.mode === 'ranking'
      ? (workspace.item?.item_id ?? workspace.ranking?.itemId ?? null)
      : null;
  const { openAdd } = workspace;
  const workspaceBusyRef = useRef(workspace.isBusy);
  workspaceBusyRef.current = workspace.isBusy;
  const requestCloseForSwitch = useCallback(async () => {
    if (skipWorkspaceCloseFocusRef.current) return false;
    skipWorkspaceCloseFocusRef.current = true;
    try {
      if (workspace.mode === 'ranking') {
        return await workspace.pauseRanking();
      }
      return await workspace.requestClose();
    } catch {
      return false;
    } finally {
      skipWorkspaceCloseFocusRef.current = false;
    }
  }, [workspace.mode, workspace.pauseRanking, workspace.requestClose]);

  const resumeWorkspace = workspace.resumeRanking;
  const draftResumeEnabled =
    canMutate &&
    Boolean(userId) &&
    !promptAddItem &&
    !completedItemId &&
    workspace.mode === 'closed' &&
    !workspace.isBusy &&
    !isListOptionsOpen &&
    !isDeletingList;
  useRankingDraft({
    userId,
    listId,
    items,
    enabled: draftResumeEnabled,
    onResume: (session) => {
      if (
        !canMutateFor(screenIdentity) ||
        workspace.mode !== 'closed' ||
        isListOptionsOpenRef.current ||
        pausedDraftItemIdRef.current === session.itemId
      )
        return;
      view.clearRestoredSelection();
      setSelectedItemId(session.itemId);
      setDismissedDetailsItemId(null);
      resumeWorkspace(session);
    },
  });

  const selectedItem =
    items.find((item) => item.item_id === selectedItemId) ?? null;
  const rankByItemId = useMemo(() => {
    const ranks = new Map<string, number>();
    for (const item of items) {
      if (item.position !== null) ranks.set(item.item_id, ranks.size + 1);
    }
    return ranks;
  }, [items]);
  const rankedCount = rankByItemId.size;
  const selectedRank = selectedItemId
    ? (rankByItemId.get(selectedItemId) ?? null)
    : null;

  useEffect(() => {
    if (
      !selectedItemId ||
      (!itemsLoaded && !hasItemsSnapshot) ||
      isLoadingItems
    )
      return;
    if (items.some((item) => item.item_id === selectedItemId)) return;
    if (workspace.isBusy) return;
    setSelectedItemId(null);
    setDismissedDetailsItemId(null);
  }, [
    hasItemsSnapshot,
    isLoadingItems,
    items,
    itemsLoaded,
    selectedItemId,
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
      view.clearRestoredSelection();
      setSelectedItemId(completedItemId);
      view.clearRestoredOffset();
      view.scrollToItem(completedItemId);
      setDismissedDetailsItemId(completedItemId);
    }
    consumedCompletedItemIdRef.current = completedItemId;
    navigation.setParams({ completedItemId: undefined });
  }, [view, completedItemId, items, itemsLoaded, navigation]);

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
      await evictDeletedList();
      if (identityRef.current !== identity) return;
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
  }, [canMutateFor, evictDeletedList, navigation, screenIdentity, token]);
  const handleItemPress = async (item: Item) => {
    const identity = screenIdentity;
    if (
      deletingListInFlightRef.current ||
      workspace.isBusy ||
      !view.clearRestoredSelection()
    )
      return;
    if (
      (workspace.mode !== 'closed' || workspace.item) &&
      !(await requestCloseForSwitch())
    )
      return;
    if (identityRef.current !== identity || deletingListInFlightRef.current)
      return;
    setSelectedItemId(item.item_id);
    setDismissedDetailsItemId(null);
  };
  const handleAddPress = useCallback(async () => {
    const identity = screenIdentity;
    if (deletingListInFlightRef.current || !canMutateFor(identity))
      return false;
    view.clearRestoredSelection();
    if (
      !(await requestCloseForSwitch()) ||
      deletingListInFlightRef.current ||
      !canMutateFor(identity)
    )
      return false;
    setSelectedItemId(null);
    setDismissedDetailsItemId(null);
    openAdd();
    return true;
  }, [canMutateFor, view, requestCloseForSwitch, screenIdentity, openAdd]);
  const handleWorkspaceContentClose = useCallback(() => {
    if (
      deletingListInFlightRef.current ||
      workspace.isBusy ||
      !view.clearRestoredSelection()
    )
      return;
    if (workspace.mode !== 'closed') {
      void workspace.requestClose().catch(() => false);
      return;
    }
    if (workspace.item) {
      const identity = screenIdentity;
      const itemId = selectedItemIdRef.current;
      void workspace
        .requestClose()
        .then((closed) => {
          if (
            closed &&
            identityRef.current === identity &&
            selectedItemIdRef.current === itemId
          ) {
            setSelectedItemId(null);
            setDismissedDetailsItemId(null);
          }
        })
        .catch(() => false);
    } else {
      setSelectedItemId(null);
      setDismissedDetailsItemId(null);
    }
  }, [
    screenIdentity,
    view,
    workspace.mode,
    workspace.item,
    workspace.isBusy,
    workspace.requestClose,
  ]);
  const handleStartRanking = () => {
    if (!selectedItem || !canMutateFor(screenIdentity)) return;
    void workspace.startRanking(selectedItem);
  };
  const handleMobileClose = useCallback(() => {
    if (deletingListInFlightRef.current || !view.clearRestoredSelection())
      return;
    if (workspace.mode !== 'closed') {
      void requestCloseForSwitch().catch(() => false);
      return;
    }
    handleWorkspaceContentClose();
  }, [
    view,
    handleWorkspaceContentClose,
    requestCloseForSwitch,
    workspace.mode,
  ]);
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (bypassBeforeRemoveRef.current) {
          bypassBeforeRemoveRef.current = false;
          return;
        }
        if (
          workspaceBusyRef.current ||
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
      rankingMode={rankingMode}
      color={listColor}
      disabled={isDeletingList || workspace.isBusy}
      onPress={(selected) => void handleItemPress(selected)}
    />
  );
  const renderListItems = () => {
    if (isLoadingList && (!hasItemsSnapshot || items.length === 0)) {
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
        onScrollToIndexFailed={view.onScrollToIndexFailed}
        scrollEventThrottle={100}
        onScrollBeginDrag={view.onScrollBeginDrag}
        onScroll={view.onScroll}
        onContentSizeChange={view.onContentSizeChange}
      />
    );
  };

  return (
    <ImmersiveScreenShell>
      <SafeAreaView className="flex-1 min-h-0" edges={['top']}>
        <View className="w-full max-w-[1280px] self-center flex-1 min-h-0">
          <View className="flex-1 min-h-0 mx-4 desktop:mx-6">
            <ListDetailHeader
              title={detailsTitle}
              color={listColor}
              icon={listIcon}
              cover={listCover}
              coverPhoto={listCoverPhoto}
              listId={listId}
              description={listDescription}
              addLoading={isLoadingList}
              optionsKey={screenIdentity}
              rankingMode={rankingMode}
              optionsDisabled={
                !canMutate ||
                isDeletingList ||
                workspace.isBusy ||
                workspace.mode !== 'closed' ||
                (!isDesktop &&
                  selectedItemId !== null &&
                  dismissedDetailsItemId !== selectedItemId)
              }
              onSaveOptions={updateListOptions}
              onOptionsVisibilityChange={(open) => {
                if (identityRef.current !== screenIdentity) return;
                isListOptionsOpenRef.current = open;
                setIsListOptionsOpen(open);
              }}
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
            />
            <ListDetailWorkspaceHost
              canMutate={canMutate}
              isDesktop={isDesktop}
              isScreenBusy={isDeletingList}
              listTitle={detailsTitle}
              listColor={listColor}
              selectedItemId={selectedItemId}
              dismissedDetailsItemId={dismissedDetailsItemId}
              selectedItem={selectedItem}
              selectedRank={selectedRank}
              items={items}
              rankedCount={rankedCount}
              rankingMode={rankingMode}
              isLoadingItems={isLoadingItems}
              itemsLoaded={itemsLoaded}
              workspace={workspace}
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
              onStartRanking={handleStartRanking}
            >
              {renderListItems()}
            </ListDetailWorkspaceHost>
          </View>
        </View>
      </SafeAreaView>
    </ImmersiveScreenShell>
  );
};
