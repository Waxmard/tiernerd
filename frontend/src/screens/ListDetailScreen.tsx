import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type FlatList,
  type ListRenderItemInfo,
  View,
} from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmojiPickerModal } from '../components/EmojiPicker';
import {
  ImmersiveScreenShell,
  useScrolledPast,
} from '../components/ImmersiveBoard';
import { ListNavBar, ListTitleBlock } from '../components/ListDetailHeader';
import {
  ListDetailItemRow,
  ListItemEmptyState,
} from '../components/ListDetailItemRow';
import { ListDetailWorkspaceHost } from '../components/ListDetailWorkspaceHost';
import type { ListOptionsHandle } from '../components/ListRankingOptions';
import { useItemEmojiFill } from '../components/useItemEmojiFill';
import { useItemWorkspace } from '../components/useItemWorkspace';
import { useListDetailData } from '../components/useListDetailData';
import { useListViewRestore } from '../components/useListViewRestore';
import type { RootStackScreenProps } from '../navigation/types';
import { useAuth } from '../providers/AuthContext';
import { useNotify } from '../providers/NotificationProvider';
import { useSync } from '../providers/SyncProvider';
import { useThemeColors } from '../providers/ThemeProvider';
import { aiService } from '../services/aiService';
import { getApiErrorMessage } from '../services/apiError';
import type { Item } from '../services/itemsService';
import { confirmDestructive, notifyError } from '../utils/confirm';

type ListDetailScreenProps = RootStackScreenProps<'ListDetail'>;
const ROW_TRANSITION = LinearTransition.duration(250);
const NO_ITEMS: Item[] = [];

export const ListDetailScreen: React.FC<ListDetailScreenProps> = ({
  route,
  navigation,
}) => {
  const { user, token } = useAuth();
  const { flush, isOffline, lastSyncedAt } = useSync();
  const userId = user?.id ?? null;
  const colors = useThemeColors();
  const safeAreaInsets = useSafeAreaInsets();
  const {
    listId,
    listTitle: routeTitle,
    promptAddItem,
    completedItemId,
  } = route.params;
  const screenIdentity = JSON.stringify([userId, token, listId]);
  const {
    items,
    isLoadingItems,
    itemsLoaded,
    hasItemsSnapshot,
    itemsError,
    detailsTitle,
    listDescription,
    listIcon,
    rankingMode,
    metadataLoaded,
    hasMetadataSnapshot,
    refreshAfterMutation,
    updateListOptions,
    evictDeletedList,
  } = useListDetailData({ userId, token, listId, routeTitle });
  const { autoFill, fillMissing, suggestIcon } = useItemEmojiFill({
    userId,
    token,
    listId,
    listTitle: detailsTitle,
    items,
    refresh: refreshAfterMutation,
  });
  const [isDeletingList, setIsDeletingList] = useState(false);
  const canMutate =
    (itemsLoaded || hasItemsSnapshot) &&
    (metadataLoaded || hasMetadataSnapshot) &&
    !isDeletingList;
  const isLoadingList =
    (!itemsLoaded && !hasItemsSnapshot) ||
    (!metadataLoaded && !hasMetadataSnapshot);
  const isListOptionsOpenRef = useRef(false);
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
  const notify = useNotify();
  const [isSuggesting, setIsSuggesting] = useState(false);
  const suggestedNamesRef = useRef<string[]>([]);
  const [dismissedDetailsItemId, setDismissedDetailsItemId] = useState<
    string | null
  >(null);
  const detailsOpen =
    selectedItemId !== null && dismissedDetailsItemId !== selectedItemId;
  const listRef = useRef<FlatList<Item> | null>(null);
  const optionsRef = useRef<ListOptionsHandle>(null);
  const nav = useScrolledPast();
  const selectedItemIdRef = useRef<string | null>(null);
  const consumedCompletedItemIdRef = useRef<string | null>(null);
  const promptHandledRef = useRef(false);
  const bypassBeforeRemoveRef = useRef(false);
  const closingForNavigationRef = useRef(false);
  const skipWorkspaceCloseFocusRef = useRef(false);
  const deletingListInFlightRef = useRef(false);

  useEffect(() => {
    identityRef.current = screenIdentity;
    setSelectedItemId(null);
    setDismissedDetailsItemId(null);
    isListOptionsOpenRef.current = false;
    suggestedNamesRef.current = [];
  }, [screenIdentity]);
  const setOptionsOpen = (open: boolean) => {
    if (identityRef.current !== screenIdentity) return;
    isListOptionsOpenRef.current = open;
  };
  const [iconItem, setIconItem] = useState<Item | null>(null);

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
    skipRestore: Boolean(promptAddItem || completedItemId),
    setSelectedItemId,
    listRef,
    scrollToOffset,
  });

  const landItemIdRef = useRef<string | null>(null);
  const scrollOnLandRef = useRef(false);
  const handleWorkspaceItemsChanged = useCallback(
    async (
      item?: Item,
      created = false,
      pendingIcon?: Promise<string | null>
    ) => {
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
      if (created && !item.icon)
        void autoFill(item, pendingIcon).catch(() => undefined);
      view.clearRestoredSelection();
      view.clearRestoredOffset();
      landItemIdRef.current = item.item_id;
      if (created) scrollOnLandRef.current = true;
      setSelectedItemId(item.item_id);
      setDismissedDetailsItemId(item.item_id);
    },
    [view, refreshAfterMutation, screenIdentity, autoFill]
  );

  const workspace = useItemWorkspace({
    userId,
    listId,
    listTitle: detailsTitle,
    rankingMode,
    items,
    onItemsChanged: handleWorkspaceItemsChanged,
    suggestIcon,
  });
  const sheetOpen = workspace.mode !== 'closed' || detailsOpen;
  useEffect(() => {
    const itemId = landItemIdRef.current;
    if (sheetOpen || !itemId) return;
    landItemIdRef.current = null;
    if (scrollOnLandRef.current) view.scrollToItem(itemId, true);
    scrollOnLandRef.current = false;
  }, [sheetOpen, view]);
  const { openAdd, setForm, submitMetadata } = workspace;
  const workspaceBusyRef = useRef(workspace.isBusy);
  workspaceBusyRef.current = workspace.isBusy;
  const workspaceModeRef = useRef(workspace.mode);
  workspaceModeRef.current = workspace.mode;
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

  const selectedItem =
    items.find((item) => item.item_id === selectedItemId) ?? null;
  const rankByItemId = useMemo(
    () =>
      new Map(
        items.map((item, index): [string, number] => [item.item_id, index + 1])
      ),
    [items]
  );
  const rankedCount = items.length;
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
      if (!completedItem.icon)
        void autoFill(completedItem).catch(() => undefined);
      view.clearRestoredSelection();
      setSelectedItemId(completedItemId);
      view.clearRestoredOffset();
      view.scrollToItem(completedItemId);
      setDismissedDetailsItemId(completedItemId);
    }
    consumedCompletedItemIdRef.current = completedItemId;
    navigation.setParams({ completedItemId: undefined });
  }, [view, completedItemId, items, itemsLoaded, navigation, autoFill]);

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
      if (
        !confirmed ||
        workspaceBusyRef.current ||
        identityRef.current !== identity
      )
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
    if (canMutateFor(identity)) {
      setDismissedDetailsItemId(item.item_id);
      workspace.openEdit(item, null);
    } else {
      setDismissedDetailsItemId(null);
    }
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
  const handleSuggestPress = useCallback(async () => {
    const identity = screenIdentity;
    if (!token || !canMutateFor(identity)) return;
    setIsSuggesting(true);
    try {
      const name = await aiService.suggestNextItem(
        listId,
        suggestedNamesRef.current,
        token
      );
      if (
        identityRef.current !== identity ||
        workspaceModeRef.current !== 'closed' ||
        isListOptionsOpenRef.current
      )
        return;
      suggestedNamesRef.current = [...suggestedNamesRef.current, name].slice(
        -50
      );
      if (!(await handleAddPress())) return;
      setForm({ name });
      if (items.length > 0) await submitMetadata();
    } catch (err) {
      if (identityRef.current === identity)
        notify(
          getApiErrorMessage(err, "Couldn't suggest an item. Try again."),
          '⚠️'
        );
    } finally {
      setIsSuggesting(false);
    }
  }, [
    canMutateFor,
    handleAddPress,
    items.length,
    listId,
    notify,
    screenIdentity,
    setForm,
    submitMetadata,
    token,
  ]);
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
  const handleItemIcon = async (item: Item, icon: string | null) => {
    if (!canMutateFor(screenIdentity)) return;
    if (await workspace.saveIcon(item, icon))
      await refreshAfterMutation().catch(() => undefined);
  };
  const pickItemIcon = (icon: string | null) => {
    const target = iconItem;
    setOptionsOpen(false);
    setIconItem(null);
    if (target) void handleItemIcon(target, icon);
  };
  const handleStartRanking = () => {
    if (!selectedItem || !canMutateFor(screenIdentity)) return;
    workspace.startRanking(selectedItem);
  };
  const leaveEdit = async () => {
    const item = workspace.item;
    const identity = screenIdentity;
    if (workspace.mode !== 'edit' || !item) return null;
    setDismissedDetailsItemId(null);
    if (await requestCloseForSwitch())
      return identityRef.current === identity ? item : null;
    if (identityRef.current === identity)
      setDismissedDetailsItemId(item.item_id);
    return null;
  };
  const handleEditRank = async () => {
    const identity = screenIdentity;
    const item = await leaveEdit();
    if (!item) return;
    if (canMutateFor(identity)) workspace.startRanking(item);
    if (identityRef.current === identity)
      setDismissedDetailsItemId(item.item_id);
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
          if (detailsOpen) {
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
      detailsOpen,
      handleWorkspaceContentClose,
      navigation,
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
      rank={rankByItemId.get(item.item_id) ?? null}
      rankingMode={rankingMode}
      disabled={isDeletingList || workspace.isBusy}
      onPress={(selected) => void handleItemPress(selected)}
      onIconPress={
        canMutate && workspace.mode === 'closed'
          ? (target) => {
              setOptionsOpen(true);
              setIconItem(target);
            }
          : undefined
      }
    />
  );
  const addDisabled =
    !canMutate ||
    isDeletingList ||
    workspace.isBusy ||
    workspace.mode === 'add';
  const optionsDisabled =
    !canMutate || isDeletingList || workspace.isBusy || detailsOpen;
  const missingEmojiCount = items.filter((item) => !item.icon).length;
  const titleBlock = (
    <ListTitleBlock
      title={detailsTitle}
      icon={listIcon}
      description={listDescription}
      addLoading={isLoadingList}
      addDisabled={addDisabled}
      onAdd={() => void handleAddPress()}
      onSuggest={() => void handleSuggestPress()}
      suggestLoading={isSuggesting}
      suggestDisabled={
        !canMutate ||
        isDeletingList ||
        workspace.isBusy ||
        workspace.mode !== 'closed' ||
        isOffline ||
        !token
      }
      optionsDisabled={optionsDisabled}
      onOpenOptions={(target) => optionsRef.current?.open(target)}
      onTitleLayout={nav.onTitleLayout}
    />
  );
  const renderListItems = () => {
    const showSpinner =
      isLoadingList && (!hasItemsSnapshot || items.length === 0);
    const listEmpty = showSpinner ? (
      <View className="items-center justify-center px-6 py-16">
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    ) : hasItemsSnapshot || !itemsError ? (
      <ListItemEmptyState
        onAdd={() => void handleAddPress()}
        disabled={addDisabled}
      />
    ) : undefined;
    return (
      <Animated.FlatList
        ref={listRef}
        style={{ flex: 1, minHeight: 0 }}
        itemLayoutAnimation={ROW_TRANSITION}
        data={showSpinner ? NO_ITEMS : items}
        keyExtractor={(item) => item.item_id}
        ListHeaderComponent={titleBlock}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={{ paddingBottom: 16 + safeAreaInsets.bottom }}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        onScrollToIndexFailed={view.onScrollToIndexFailed}
        scrollEventThrottle={16}
        onScrollBeginDrag={view.onScrollBeginDrag}
        onScroll={(event) => {
          view.onScroll(event);
          nav.onScroll(event);
        }}
        onContentSizeChange={view.onContentSizeChange}
      />
    );
  };

  return (
    <ImmersiveScreenShell>
      <ListNavBar
        title={detailsTitle}
        icon={listIcon}
        scrolled={nav.scrolled}
        description={listDescription}
        optionsKey={screenIdentity}
        rankingMode={rankingMode}
        optionsDisabled={optionsDisabled}
        optionsRef={optionsRef}
        onSaveOptions={updateListOptions}
        onOptionsVisibilityChange={setOptionsOpen}
        missingEmojiCount={missingEmojiCount}
        onFillEmojis={fillMissing}
        addDisabled={addDisabled || isLoadingList}
        onAdd={() => void handleAddPress()}
        deleteDisabled={!canMutate || workspace.isBusy || isDeletingList}
        onOpenProfile={() => navigation.navigate('Profile')}
        onBack={() => navigation.goBack()}
        onDelete={() => void handleDeleteList()}
      />
      <View className="w-full max-w-[1280px] self-center flex-1 min-h-0">
        <View className="flex-1 min-h-0 mx-4">
          <ListDetailWorkspaceHost
            canMutate={canMutate}
            isScreenBusy={isDeletingList}
            listTitle={detailsTitle}
            selectedItemId={selectedItemId}
            dismissedDetailsItemId={dismissedDetailsItemId}
            selectedItem={selectedItem}
            selectedRank={selectedRank}
            rankedCount={rankedCount}
            rankingMode={rankingMode}
            isLoadingItems={isLoadingItems}
            itemsLoaded={itemsLoaded}
            workspace={workspace}
            onEdit={(focus) => {
              if (selectedItem && canMutateFor(screenIdentity))
                workspace.openEdit(selectedItem, focus);
            }}
            onIconChange={(icon) => {
              if (selectedItem) void handleItemIcon(selectedItem, icon);
            }}
            onDelete={() => {
              if (selectedItem && canMutateFor(screenIdentity))
                void workspace.deleteItem(selectedItem);
            }}
            onDetailsClose={handleWorkspaceContentClose}
            onMobileClose={handleMobileClose}
            onStartRanking={handleStartRanking}
            onEditRank={() => void handleEditRank()}
            onEditDetails={() => void leaveEdit()}
          >
            {renderListItems()}
          </ListDetailWorkspaceHost>
        </View>
      </View>
      <EmojiPickerModal
        visible={iconItem !== null}
        value={iconItem?.icon ?? null}
        onSelect={pickItemIcon}
        suggestFor={
          iconItem
            ? {
                name: iconItem.name,
                kind: 'item',
                description: iconItem.description,
                listTitle: detailsTitle,
              }
            : undefined
        }
        onRemove={() => pickItemIcon(null)}
        onClose={() => {
          setOptionsOpen(false);
          setIconItem(null);
        }}
      />
    </ImmersiveScreenShell>
  );
};
