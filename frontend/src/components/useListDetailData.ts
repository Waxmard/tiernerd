import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type ComparisonSession,
  type Item,
  itemsService,
} from '../services/itemsService';
import { findNextDraftSession } from '../services/itemWorkspaceActions';
import {
  acceptLiveItems,
  acceptLiveMetadata,
  applyCachedItemsState,
  applyCachedMetadataState,
  applyEvictedListState,
  applyLiveItemsState,
  applyMutationRefreshState,
  bumpLifecycleMutation,
  canAcceptItemsResponse,
  canAcceptMetadataResponse,
  canApplyCachedItems,
  canApplyCachedMetadata,
  canApplyHydration,
  canWriteCachedItems,
  createInvalidatedReadState,
  createListDetailLifecycle,
  createListDetailState,
  deactivateLifecycle,
  enqueueListCacheWrite,
  evictLifecycleList,
  invalidateLifecycleReads,
  isCacheCurrent,
  isDefinitiveReadError,
  isLifecycleActive,
  isLifecycleReadable,
  type ListDetailDataState,
  type ListDetailLifecycle,
  listItemsCacheKey,
  listsCacheKey,
  parseCachedListItems,
  parseCachedLists,
  startHydrationRequest,
  startItemsRequest,
  startMetadataRequest,
} from '../services/listsCache';
import { listsService } from '../services/listsService';

const ITEMS_ERROR = 'Unable to refresh items. Try again.';

interface UseListDetailDataOptions {
  userId: string | null;
  token: string | null;
  listId: string;
  routeTitle: string;
}
export function useListDetailData({
  userId,
  token,
  listId,
  routeTitle,
}: UseListDetailDataOptions) {
  const identity = useMemo(
    () => JSON.stringify([userId, token, listId]),
    [listId, token, userId]
  );
  const lifecycleRef = useRef<ListDetailLifecycle | null>(null);
  const itemsRef = useRef<Item[]>([]);
  if (!lifecycleRef.current || lifecycleRef.current.identity !== identity) {
    if (lifecycleRef.current) deactivateLifecycle(lifecycleRef.current);
    lifecycleRef.current = createListDetailLifecycle({
      identity,
      userId,
      token,
      listId,
      routeTitle,
    });
    itemsRef.current = [];
  } else {
    lifecycleRef.current.routeTitle = routeTitle;
  }
  const [state, setState] = useState(() =>
    createListDetailState(identity, routeTitle)
  );

  const updateState = useCallback(
    (
      lifecycle: ListDetailLifecycle,
      guard: () => boolean,
      update: (previous: ListDetailDataState) => ListDetailDataState
    ) => {
      if (!isLifecycleActive(lifecycle, lifecycleRef.current) || !guard())
        return;
      setState((previous) =>
        isLifecycleActive(lifecycle, lifecycleRef.current) &&
        previous.identity === lifecycle.identity &&
        guard()
          ? update(previous)
          : previous
      );
    },
    []
  );
  const queueCacheWork = useCallback(
    (
      lifecycle: ListDetailLifecycle,
      key: string,
      version: number,
      operation: () => Promise<void>
    ) => {
      if (!isCacheCurrent(lifecycle, version, lifecycleRef.current))
        return Promise.resolve();
      return enqueueListCacheWrite(key, async () => {
        if (!isCacheCurrent(lifecycle, version, lifecycleRef.current)) return;
        await operation();
      });
    },
    []
  );
  const removeCachedItems = useCallback(
    (lifecycle: ListDetailLifecycle, version: number) => {
      if (!lifecycle.userId) return Promise.resolve();
      const key = listItemsCacheKey(lifecycle.userId, lifecycle.listId);
      return queueCacheWork(lifecycle, key, version, () =>
        AsyncStorage.removeItem(key)
      );
    },
    [queueCacheWork]
  );
  const removeCachedOverview = useCallback(
    (lifecycle: ListDetailLifecycle, version: number) => {
      if (!lifecycle.userId) return Promise.resolve();
      const key = listsCacheKey(lifecycle.userId);
      return queueCacheWork(lifecycle, key, version, () =>
        AsyncStorage.removeItem(key)
      );
    },
    [queueCacheWork]
  );
  const removeListFromCachedOverview = useCallback(
    (lifecycle: ListDetailLifecycle, version: number) => {
      if (!lifecycle.userId) return Promise.resolve();
      const key = listsCacheKey(lifecycle.userId);
      return queueCacheWork(lifecycle, key, version, async () => {
        const raw = await AsyncStorage.getItem(key).catch(() => null);
        if (!isCacheCurrent(lifecycle, version, lifecycleRef.current)) return;
        const cachedLists = parseCachedLists(raw);
        if (cachedLists) {
          await AsyncStorage.setItem(
            key,
            JSON.stringify(
              cachedLists.filter(
                (cachedList) => cachedList.list_id !== lifecycle.listId
              )
            )
          );
        } else {
          await AsyncStorage.removeItem(key);
        }
      });
    },
    [queueCacheWork]
  );
  const clearPersistedList = useCallback(
    async (lifecycle: ListDetailLifecycle, version: number) => {
      await Promise.all([
        removeCachedItems(lifecycle, version).catch(() => undefined),
        removeListFromCachedOverview(lifecycle, version).catch(() => undefined),
      ]);
    },
    [removeCachedItems, removeListFromCachedOverview]
  );
  const invalidateDefinitiveRead = useCallback(
    (lifecycle: ListDetailLifecycle) => {
      const version = invalidateLifecycleReads(lifecycle);
      itemsRef.current = [];
      updateState(
        lifecycle,
        () => lifecycle.cacheVersion === version,
        (previous) =>
          createInvalidatedReadState(
            previous,
            lifecycle.routeTitle,
            ITEMS_ERROR
          )
      );
      void clearPersistedList(lifecycle, version);
    },
    [clearPersistedList, updateState]
  );
  const fetchItemsFor = useCallback(
    async (lifecycle: ListDetailLifecycle): Promise<Item[]> => {
      if (!isLifecycleReadable(lifecycle, lifecycleRef.current))
        throw new Error(ITEMS_ERROR);
      if (!lifecycle.token) {
        updateState(
          lifecycle,
          () => isLifecycleReadable(lifecycle, lifecycleRef.current),
          (previous) => ({
            ...previous,
            isLoadingItems: false,
            itemsLoaded: false,
          })
        );
        throw new Error(ITEMS_ERROR);
      }
      const requestId = startItemsRequest(lifecycle);
      updateState(
        lifecycle,
        () => lifecycle.itemsRequest === requestId,
        (previous) => ({ ...previous, isLoadingItems: true })
      );
      try {
        const nextItems = await listsService.getListItems(
          lifecycle.listId,
          lifecycle.token
        );
        if (!canAcceptItemsResponse(lifecycle, requestId, lifecycleRef.current))
          throw new Error(ITEMS_ERROR);
        acceptLiveItems(lifecycle);
        itemsRef.current = nextItems;
        updateState(
          lifecycle,
          () =>
            canAcceptItemsResponse(lifecycle, requestId, lifecycleRef.current),
          (previous) => applyLiveItemsState(previous, nextItems)
        );
        const version = lifecycle.cacheVersion;
        if (
          lifecycle.userId &&
          canWriteCachedItems(
            lifecycle,
            version,
            requestId,
            lifecycleRef.current
          )
        ) {
          const key = listItemsCacheKey(lifecycle.userId, lifecycle.listId);
          void queueCacheWork(lifecycle, key, version, () => {
            if (
              !canWriteCachedItems(
                lifecycle,
                version,
                requestId,
                lifecycleRef.current
              )
            )
              return Promise.resolve();
            return AsyncStorage.setItem(key, JSON.stringify(nextItems));
          }).catch(() => {});
        }
        return nextItems;
      } catch (error: unknown) {
        if (
          canAcceptItemsResponse(lifecycle, requestId, lifecycleRef.current)
        ) {
          if (isDefinitiveReadError(error)) {
            invalidateDefinitiveRead(lifecycle);
          } else {
            updateState(
              lifecycle,
              () => lifecycle.itemsRequest === requestId,
              (previous) => ({
                ...previous,
                itemsLoaded: false,
                itemsError: ITEMS_ERROR,
              })
            );
          }
        }
        throw new Error(ITEMS_ERROR);
      } finally {
        if (
          canAcceptItemsResponse(lifecycle, requestId, lifecycleRef.current)
        ) {
          updateState(
            lifecycle,
            () => lifecycle.itemsRequest === requestId,
            (previous) => ({ ...previous, isLoadingItems: false })
          );
        }
      }
    },
    [invalidateDefinitiveRead, queueCacheWork, updateState]
  );
  const refreshMetadataFor = useCallback(
    async (lifecycle: ListDetailLifecycle): Promise<void> => {
      if (!isLifecycleReadable(lifecycle, lifecycleRef.current)) return;
      if (!lifecycle.token) {
        updateState(
          lifecycle,
          () => isLifecycleReadable(lifecycle, lifecycleRef.current),
          (previous) => ({
            ...previous,
            metadataError: true,
            metadataLoaded: false,
          })
        );
        return;
      }
      const requestId = startMetadataRequest(lifecycle);
      updateState(
        lifecycle,
        () => lifecycle.metadataRequest === requestId,
        (previous) => ({ ...previous, metadataError: false })
      );
      try {
        const list = await listsService.getList(
          lifecycle.listId,
          lifecycle.token
        );
        if (
          !canAcceptMetadataResponse(lifecycle, requestId, lifecycleRef.current)
        )
          return;
        acceptLiveMetadata(lifecycle);
        updateState(
          lifecycle,
          () =>
            canAcceptMetadataResponse(
              lifecycle,
              requestId,
              lifecycleRef.current
            ),
          (previous) => ({
            ...previous,
            detailsTitle: list.title,
            listDescription: list.description,
            listColor: list.color,
            metadataError: false,
            metadataLoaded: true,
          })
        );
      } catch (error: unknown) {
        if (
          canAcceptMetadataResponse(lifecycle, requestId, lifecycleRef.current)
        ) {
          if (isDefinitiveReadError(error)) {
            invalidateDefinitiveRead(lifecycle);
          } else {
            updateState(
              lifecycle,
              () => lifecycle.metadataRequest === requestId,
              (previous) => ({
                ...previous,
                metadataError: true,
                metadataLoaded: false,
              })
            );
          }
        }
      }
    },
    [invalidateDefinitiveRead, updateState]
  );
  const hydrateCache = useCallback(
    async (lifecycle: ListDetailLifecycle): Promise<void> => {
      if (
        !isLifecycleReadable(lifecycle, lifecycleRef.current) ||
        !lifecycle.userId
      )
        return;
      const { hydrationId, version } = startHydrationRequest(lifecycle);
      const itemKey = listItemsCacheKey(lifecycle.userId, lifecycle.listId);
      const overviewKey = listsCacheKey(lifecycle.userId);
      const entries = await AsyncStorage.multiGet([itemKey, overviewKey]).catch(
        () => null
      );
      if (!entries) return;
      if (
        !canApplyHydration(
          lifecycle,
          hydrationId,
          version,
          lifecycleRef.current
        )
      )
        return;
      const cachedItems = parseCachedListItems(
        entries.find(([key]) => key === itemKey)?.[1] ?? null,
        lifecycle.listId
      );
      if (
        cachedItems &&
        canApplyCachedItems(
          lifecycle,
          hydrationId,
          version,
          lifecycleRef.current
        )
      ) {
        itemsRef.current = cachedItems;
        updateState(
          lifecycle,
          () =>
            canApplyCachedItems(
              lifecycle,
              hydrationId,
              version,
              lifecycleRef.current
            ),
          (previous) => applyCachedItemsState(previous, cachedItems)
        );
      }
      const cachedLists = parseCachedLists(
        entries.find(([key]) => key === overviewKey)?.[1] ?? null
      );
      const cachedList = cachedLists?.find(
        (candidate) => candidate.list_id === lifecycle.listId
      );
      if (
        cachedList &&
        canApplyCachedMetadata(
          lifecycle,
          hydrationId,
          version,
          lifecycleRef.current
        )
      ) {
        updateState(
          lifecycle,
          () =>
            canApplyCachedMetadata(
              lifecycle,
              hydrationId,
              version,
              lifecycleRef.current
            ),
          (previous) =>
            applyCachedMetadataState(previous, {
              title: cachedList.title,
              description: cachedList.description,
              color: cachedList.color,
            })
        );
      }
    },
    [updateState]
  );

  const fetchItems = useCallback(
    () => fetchItemsFor(lifecycleRef.current as ListDetailLifecycle),
    [fetchItemsFor]
  );
  const refreshMetadata = useCallback(
    () => refreshMetadataFor(lifecycleRef.current as ListDetailLifecycle),
    [refreshMetadataFor]
  );
  const refreshAfterMutation = useCallback(async (): Promise<Item[]> => {
    const lifecycle = lifecycleRef.current;
    if (!lifecycle || !isLifecycleReadable(lifecycle, lifecycleRef.current))
      throw new Error(ITEMS_ERROR);
    const version = bumpLifecycleMutation(lifecycle);
    updateState(
      lifecycle,
      () => lifecycle.cacheVersion === version,
      applyMutationRefreshState
    );
    await Promise.all([
      removeCachedItems(lifecycle, version).catch(() => undefined),
      removeCachedOverview(lifecycle, version).catch(() => undefined),
    ]);
    if (
      !isLifecycleReadable(lifecycle, lifecycleRef.current) ||
      lifecycle.cacheVersion !== version
    )
      throw new Error(ITEMS_ERROR);
    return fetchItemsFor(lifecycle);
  }, [fetchItemsFor, removeCachedItems, removeCachedOverview, updateState]);
  const evictDeletedList = useCallback(async (): Promise<void> => {
    const lifecycle = lifecycleRef.current;
    if (
      !lifecycle ||
      !isLifecycleActive(lifecycle, lifecycleRef.current) ||
      lifecycle.deleted
    )
      return;
    const version = evictLifecycleList(lifecycle);
    itemsRef.current = [];
    updateState(
      lifecycle,
      () => lifecycle.cacheVersion === version,
      () => applyEvictedListState(lifecycle.identity, lifecycle.routeTitle)
    );
    await clearPersistedList(lifecycle, version);
  }, [clearPersistedList, updateState]);

  useEffect(() => {
    const lifecycle = lifecycleRef.current;
    if (!lifecycle || lifecycle.identity !== identity) return;
    lifecycle.active = true;
    setState(createListDetailState(lifecycle.identity, lifecycle.routeTitle));
    itemsRef.current = [];
    void fetchItemsFor(lifecycle).catch(() => {});
    void refreshMetadataFor(lifecycle);
    void hydrateCache(lifecycle);
    return () => {
      deactivateLifecycle(lifecycle);
    };
  }, [fetchItemsFor, hydrateCache, identity, refreshMetadataFor]);

  const visibleState =
    state.identity === identity
      ? state
      : createListDetailState(identity, routeTitle);
  return {
    items: visibleState.items,
    itemsRef,
    isLoadingItems: visibleState.isLoadingItems,
    itemsLoaded: visibleState.itemsLoaded,
    hasItemsSnapshot: visibleState.hasItemsSnapshot,
    itemsError: visibleState.itemsError,
    detailsTitle: visibleState.detailsTitle,
    listDescription: visibleState.listDescription,
    listColor: visibleState.listColor,
    metadataError: visibleState.metadataError,
    metadataLoaded: visibleState.metadataLoaded,
    fetchItems,
    refreshMetadata,
    refreshAfterMutation,
    evictDeletedList,
  };
}

interface DraftLookupOptions {
  identity: string;
  items: Item[];
  itemsLoaded: boolean;
  token: string | null;
  enabled: boolean;
  selectedItemId: string | null;
  resolvedIds: RefObject<Set<string>>;
  onFound: (session: ComparisonSession) => void;
  onFailure: (item: Item) => void;
}

export function useDraftLookup(options: DraftLookupOptions) {
  const { identity, items, itemsLoaded, token, enabled, selectedItemId } =
    options;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const versionRef = useRef(0);
  const guardRef = useRef({ identity, items, enabled, selectedItemId });
  const guard = guardRef.current;
  if (
    guard.identity !== identity ||
    guard.items !== items ||
    guard.enabled !== enabled ||
    guard.selectedItemId !== selectedItemId
  ) {
    versionRef.current++;
    guardRef.current = { identity, items, enabled, selectedItemId };
  }
  const activeRef = useRef(false);
  const retryRef = useRef<{ identity: string } | null>(null);
  const [failure, setFailure] = useState<{
    identity: string;
    itemId: string;
  } | null>(null);
  const [retryingIdentity, setRetryingIdentity] = useState<string | null>(null);
  if (retryRef.current && retryRef.current.identity !== identity) {
    retryRef.current = null;
  }
  const retrying = retryingIdentity === identity;

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      versionRef.current++;
      retryRef.current = null;
    };
  }, []);
  const currentFailure =
    failure?.identity === identity &&
    items.some(
      (item) => item.item_id === failure.itemId && item.rating === null
    )
      ? failure
      : null;
  useEffect(() => {
    if (
      failure &&
      (failure.identity !== identity || (itemsLoaded && !currentFailure))
    )
      setFailure(null);
  }, [currentFailure, failure, identity, itemsLoaded]);

  const runLookup = useCallback(
    async (
      candidates: Item[],
      lookupToken: string,
      lookupIdentity: string,
      version: number,
      cancelled: () => boolean,
      retryItemId?: string
    ) => {
      const resolved = new Set(optionsRef.current.resolvedIds.current);
      const isCurrent = () =>
        activeRef.current &&
        !cancelled() &&
        versionRef.current === version &&
        optionsRef.current.identity === lookupIdentity &&
        optionsRef.current.enabled;
      if (!isCurrent()) return;
      let result: ComparisonSession | { failedItem: Item } | null;
      try {
        result = await findNextDraftSession(
          candidates,
          resolved,
          lookupToken,
          itemsService,
          isCurrent
        );
      } catch {
        const item = candidates.find(
          (candidate) =>
            candidate.rating === null && !resolved.has(candidate.item_id)
        );
        result = item ? { failedItem: item } : null;
      }
      if (!isCurrent()) return;
      for (const id of resolved) optionsRef.current.resolvedIds.current.add(id);
      if (result && 'failedItem' in result) {
        setFailure({
          identity: lookupIdentity,
          itemId: result.failedItem.item_id,
        });
        optionsRef.current.onFailure(result.failedItem);
      } else {
        if (retryItemId && (result || resolved.has(retryItemId)))
          setFailure(null);
        if (result) optionsRef.current.onFound(result);
      }
    },
    []
  );

  useEffect(() => {
    if (
      !enabled ||
      !token ||
      currentFailure ||
      !items.some(
        (item) =>
          item.rating === null && !options.resolvedIds.current.has(item.item_id)
      )
    )
      return;
    let cancelled = false;
    void runLookup(items, token, identity, versionRef.current, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [
    currentFailure,
    enabled,
    identity,
    items,
    options.resolvedIds,
    runLookup,
    token,
  ]);

  const retry = useCallback(() => {
    const current = optionsRef.current;
    if (
      !currentFailure ||
      !current.enabled ||
      !current.token ||
      current.selectedItemId !== currentFailure.itemId ||
      retryRef.current?.identity === current.identity
    )
      return;
    const item = current.items.find(
      (candidate) => candidate.item_id === currentFailure.itemId
    );
    if (!item) return;
    const attempt = { identity: current.identity };
    retryRef.current = attempt;
    setRetryingIdentity(current.identity);
    void runLookup(
      [item],
      current.token,
      current.identity,
      versionRef.current,
      () => false,
      item.item_id
    ).finally(() => {
      if (retryRef.current !== attempt) return;
      retryRef.current = null;
      if (activeRef.current)
        setRetryingIdentity((value) =>
          value === current.identity ? null : value
        );
    });
  }, [currentFailure, runLookup]);

  return {
    failedItemId: currentFailure?.itemId ?? null,
    isRetryingDraft: retrying,
    retryDraft: retry,
  };
}
