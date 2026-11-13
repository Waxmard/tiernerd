import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNotifyWhenOnline, useSync } from '../providers/SyncProvider';
import { getApiErrorMessage } from '../services/apiError';
import type { Item } from '../services/itemsService';
import {
  applyCachedItemsState,
  applyCachedMetadataState,
  applyEvictedListState,
  applyLiveItemsState,
  applyMutationRefreshState,
  bumpLifecycleMutation,
  canAcceptItemsResponse,
  canAcceptMetadataResponse,
  canWriteCachedItems,
  canWriteCachedSummary,
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
  sortListsByRecency,
} from '../services/listsCache';
import {
  INVALID_RANKING_MODE,
  type ListMetadata,
  type ListOptionsInput,
  listsService,
} from '../services/listsService';
import {
  localLibrary,
  reconcileListItems,
  reconcileListMetadata,
} from '../services/localLibrary';
import { pendingOps } from '../services/syncQueue';
import { newId } from '../utils/id';

const ITEMS_ERROR = 'Unable to refresh items.';

const reconcileFetchedItems = async (
  lifecycle: ListDetailLifecycle,
  serverItems: Item[]
): Promise<Item[]> => {
  if (!lifecycle.userId) return serverItems;
  const [ops, cachedRaw] = await Promise.all([
    pendingOps(lifecycle.userId),
    AsyncStorage.getItem(
      listItemsCacheKey(lifecycle.userId, lifecycle.listId)
    ).catch(() => null),
  ]);
  if (ops.length === 0) return serverItems;
  return reconcileListItems(
    lifecycle.listId,
    serverItems,
    parseCachedListItems(cachedRaw, lifecycle.listId) ?? [],
    ops
  );
};

const reconcileFetchedMetadata = async (
  lifecycle: ListDetailLifecycle,
  serverList: ListMetadata
): Promise<ListMetadata> => {
  if (!lifecycle.userId) return serverList;
  const [ops, cachedRaw] = await Promise.all([
    pendingOps(lifecycle.userId),
    AsyncStorage.getItem(listsCacheKey(lifecycle.userId)).catch(() => null),
  ]);
  if (ops.length === 0) return serverList;
  return reconcileListMetadata(
    serverList,
    parseCachedLists(cachedRaw) ?? [],
    ops
  );
};

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
  const { mutate, isOffline } = useSync();
  const notify = useNotifyWhenOnline();
  const isOfflineRef = useRef(isOffline);
  isOfflineRef.current = isOffline;
  const identity = useMemo(
    () => JSON.stringify([userId, token, listId]),
    [listId, token, userId]
  );
  const lifecycleRef = useRef<ListDetailLifecycle | null>(null);
  const itemsRef = useRef<Item[]>([]);
  const metadataRef = useRef<{
    lifecycle: ListDetailLifecycle;
    requestId: number;
    metadata: ListMetadata;
  } | null>(null);
  const modeSaveRef = useRef<ListDetailLifecycle | null>(null);
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
    metadataRef.current = null;
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
  const writeCachedSummary = useCallback(
    (
      lifecycle: ListDetailLifecycle,
      version: number,
      metadata: ListMetadata,
      count: number,
      requestId?: number,
      itemsRequestId?: number
    ) => {
      if (!lifecycle.userId) return Promise.resolve();
      const key = listsCacheKey(lifecycle.userId);
      return queueCacheWork(lifecycle, key, version, async () => {
        const raw = await AsyncStorage.getItem(key);
        if (
          !canWriteCachedSummary(
            lifecycle,
            version,
            requestId,
            itemsRequestId,
            lifecycleRef.current
          )
        )
          return;
        const lists = parseCachedLists(raw) ?? [];
        const summary = { ...metadata, item_count: count };
        await AsyncStorage.setItem(
          key,
          JSON.stringify(
            sortListsByRecency([
              ...lists.filter((list) => list.list_id !== lifecycle.listId),
              summary,
            ])
          )
        );
      });
    },
    [queueCacheWork]
  );
  const removeListFromCachedOverview = useCallback(
    (lifecycle: ListDetailLifecycle, version: number) => {
      if (!lifecycle.userId) return Promise.resolve();
      const key = listsCacheKey(lifecycle.userId);
      return queueCacheWork(lifecycle, key, version, async () => {
        const raw = await AsyncStorage.getItem(key);
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
      const requestId = ++lifecycle.itemsRequest;
      updateState(
        lifecycle,
        () => lifecycle.itemsRequest === requestId,
        (previous) => ({ ...previous, isLoadingItems: true })
      );
      try {
        const serverItems = await listsService.getListItems(
          lifecycle.listId,
          lifecycle.token
        );
        const nextItems = await reconcileFetchedItems(lifecycle, serverItems);
        if (!canAcceptItemsResponse(lifecycle, requestId, lifecycleRef.current))
          throw new Error(ITEMS_ERROR);
        lifecycle.itemsAcceptedLive = true;
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
          lifecycle.itemsAcceptedLive = false;
          if (isDefinitiveReadError(error)) {
            invalidateDefinitiveRead(lifecycle);
          } else {
            notify("Couldn't refresh this list.");
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
    [invalidateDefinitiveRead, notify, queueCacheWork, updateState]
  );
  const refreshMetadataFor = useCallback(
    async (lifecycle: ListDetailLifecycle): Promise<ListMetadata | null> => {
      if (
        !isLifecycleReadable(lifecycle, lifecycleRef.current) ||
        modeSaveRef.current === lifecycle
      )
        return null;
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
        return null;
      }
      const requestId = ++lifecycle.metadataRequest;
      updateState(
        lifecycle,
        () => lifecycle.metadataRequest === requestId,
        (previous) => ({ ...previous, metadataError: false })
      );
      try {
        const serverList = await listsService.getList(
          lifecycle.listId,
          lifecycle.token
        );
        const list = await reconcileFetchedMetadata(lifecycle, serverList);
        if (
          !canAcceptMetadataResponse(lifecycle, requestId, lifecycleRef.current)
        )
          return null;
        metadataRef.current = { lifecycle, requestId, metadata: list };
        lifecycle.metadataAcceptedLive = true;
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
            listIcon: list.icon ?? null,
            rankingMode: list.ranking_mode,
            metadataError: false,
            metadataLoaded: true,
            hasMetadataSnapshot: true,
          })
        );
        return list;
      } catch (error: unknown) {
        if (
          canAcceptMetadataResponse(lifecycle, requestId, lifecycleRef.current)
        ) {
          lifecycle.metadataAcceptedLive = false;
          if (isDefinitiveReadError(error)) {
            invalidateDefinitiveRead(lifecycle);
          } else {
            notify("Couldn't load this list.");
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
        return null;
      }
    },
    [invalidateDefinitiveRead, notify, updateState]
  );
  const reloadFromCache = useCallback(
    async (respectLive = false): Promise<void> => {
      const lifecycle = lifecycleRef.current;
      if (
        !lifecycle?.userId ||
        !isLifecycleReadable(lifecycle, lifecycleRef.current)
      )
        return;
      const entries = await AsyncStorage.multiGet([
        listItemsCacheKey(lifecycle.userId, lifecycle.listId),
        listsCacheKey(lifecycle.userId),
      ]).catch(() => null);
      if (!entries || !isLifecycleReadable(lifecycle, lifecycleRef.current))
        return;
      const cachedItems = parseCachedListItems(
        entries[0]?.[1] ?? null,
        lifecycle.listId
      );
      if (cachedItems && (!respectLive || !lifecycle.itemsAcceptedLive)) {
        itemsRef.current = cachedItems;
        updateState(
          lifecycle,
          () => true,
          (previous) => applyCachedItemsState(previous, cachedItems)
        );
      }
      const summary = parseCachedLists(entries[1]?.[1] ?? null)?.find(
        (list) => list.list_id === lifecycle.listId
      );
      if (summary && (!respectLive || !lifecycle.metadataAcceptedLive))
        updateState(
          lifecycle,
          () => true,
          (previous) =>
            applyCachedMetadataState(previous, {
              title: summary.title,
              description: summary.description,
              icon: summary.icon,
              rankingMode: summary.ranking_mode,
            })
        );
    },
    [updateState]
  );
  const refreshAfterMutation = useCallback(async (): Promise<Item[]> => {
    await reloadFromCache();
    const lifecycle = lifecycleRef.current;
    if (
      !lifecycle ||
      !isLifecycleReadable(lifecycle, lifecycleRef.current) ||
      isOfflineRef.current
    )
      return itemsRef.current;
    const version = bumpLifecycleMutation(lifecycle);
    lifecycle.metadataAcceptedLive = false;
    updateState(
      lifecycle,
      () => lifecycle.cacheVersion === version,
      (previous) => ({
        ...applyMutationRefreshState(previous),
        metadataLoaded: false,
      })
    );
    const itemsPromise = fetchItemsFor(lifecycle);
    const metadataPromise = refreshMetadataFor(lifecycle);
    const requestId = lifecycle.metadataRequest;
    const [itemsResult, metadataResult] = await Promise.allSettled([
      itemsPromise,
      metadataPromise,
    ]);
    const metadata =
      metadataResult.status === 'fulfilled' ? metadataResult.value : null;
    const items =
      itemsResult.status === 'fulfilled' ? itemsResult.value : itemsRef.current;
    if (
      metadata &&
      isCacheCurrent(lifecycle, version, lifecycleRef.current) &&
      canAcceptMetadataResponse(lifecycle, requestId, lifecycleRef.current)
    )
      void writeCachedSummary(
        lifecycle,
        version,
        metadata,
        items.length,
        requestId
      ).catch(() => {});
    return items;
  }, [
    fetchItemsFor,
    refreshMetadataFor,
    reloadFromCache,
    updateState,
    writeCachedSummary,
  ]);
  const updateListOptions = useCallback(
    async (options: ListOptionsInput): Promise<void> => {
      const lifecycle = lifecycleRef.current;
      if (
        !lifecycle?.token ||
        !lifecycle.userId ||
        !isLifecycleReadable(lifecycle, lifecycleRef.current) ||
        modeSaveRef.current === lifecycle
      )
        throw new Error(ITEMS_ERROR);
      const metadata = {
        title: options.title,
        ranking_mode: options.ranking_mode,
        description: options.description,
        icon: options.icon,
      };
      const now = new Date().toISOString();
      modeSaveRef.current = lifecycle;
      const requestId = ++lifecycle.metadataRequest;
      ++lifecycle.cacheVersion;
      lifecycle.hydrationRequest++;
      try {
        const outcome = await mutate(
          {
            id: newId(),
            createdAt: now,
            kind: 'list.update',
            listId: lifecycle.listId,
            metadata,
          },
          {
            applyLocal: () =>
              localLibrary.applyLocalListUpdate(
                lifecycle.userId as string,
                lifecycle.listId,
                metadata,
                now
              ),
          }
        );
        if (outcome.status === 'rejected') throw new Error(outcome.message);
        const base =
          metadataRef.current?.lifecycle === lifecycle
            ? metadataRef.current.metadata
            : null;
        const saved: ListMetadata | null = base
          ? {
              ...base,
              title: options.title,
              description: options.description,
              icon: options.icon,
              ranking_mode: options.ranking_mode,
              updated_at: now,
            }
          : null;
        if (saved)
          metadataRef.current = { lifecycle, requestId, metadata: saved };
        updateState(
          lifecycle,
          () => isLifecycleReadable(lifecycle, lifecycleRef.current),
          (previous) => ({
            ...previous,
            detailsTitle: saved?.title ?? options.title,
            listDescription: saved?.description ?? options.description,
            listIcon: saved?.icon ?? options.icon,
            rankingMode: saved?.ranking_mode ?? options.ranking_mode,
            metadataError: false,
            metadataLoaded: true,
            hasMetadataSnapshot: true,
          })
        );
      } catch (error: unknown) {
        throw new Error(
          error instanceof Error &&
            (error.message === INVALID_RANKING_MODE ||
              error.message === ITEMS_ERROR)
            ? error.message
            : getApiErrorMessage(error, 'Unable to save list options.')
        );
      } finally {
        if (modeSaveRef.current === lifecycle) modeSaveRef.current = null;
      }
    },
    [mutate, updateState]
  );
  const evictDeletedList = useCallback(async (): Promise<void> => {
    const lifecycle = lifecycleRef.current;
    if (
      !lifecycle?.userId ||
      !isLifecycleActive(lifecycle, lifecycleRef.current) ||
      lifecycle.deleted
    )
      return;
    await mutate(
      {
        id: newId(),
        createdAt: new Date().toISOString(),
        kind: 'list.delete',
        listId: lifecycle.listId,
      },
      {
        applyLocal: () =>
          localLibrary.applyLocalListDelete(
            lifecycle.userId as string,
            lifecycle.listId
          ),
      }
    );
    const version = evictLifecycleList(lifecycle);
    itemsRef.current = [];
    updateState(
      lifecycle,
      () => lifecycle.cacheVersion === version,
      () => applyEvictedListState(lifecycle.identity, lifecycle.routeTitle)
    );
    await clearPersistedList(lifecycle, version);
  }, [clearPersistedList, mutate, updateState]);
  useEffect(() => {
    const lifecycle = lifecycleRef.current;
    if (!lifecycle || lifecycle.identity !== identity) return;
    lifecycle.active = true;
    setState(createListDetailState(lifecycle.identity, lifecycle.routeTitle));
    itemsRef.current = [];
    const version = lifecycle.cacheVersion;
    const itemsPromise = fetchItemsFor(lifecycle);
    const metadataPromise = refreshMetadataFor(lifecycle);
    const itemsRequest = lifecycle.itemsRequest;
    const metadataRequest = lifecycle.metadataRequest;
    void Promise.all([itemsPromise, metadataPromise])
      .then(([items, metadata]) => {
        if (
          metadata &&
          isCacheCurrent(lifecycle, version, lifecycleRef.current) &&
          canAcceptItemsResponse(
            lifecycle,
            itemsRequest,
            lifecycleRef.current
          ) &&
          canAcceptMetadataResponse(
            lifecycle,
            metadataRequest,
            lifecycleRef.current
          )
        )
          void writeCachedSummary(
            lifecycle,
            version,
            metadata,
            items.length,
            metadataRequest
          ).catch(() => {});
      })
      .catch(() => {});
    void reloadFromCache(true);
    return () => {
      deactivateLifecycle(lifecycle);
    };
  }, [
    fetchItemsFor,
    identity,
    refreshMetadataFor,
    reloadFromCache,
    writeCachedSummary,
  ]);

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
    listIcon: visibleState.listIcon,
    rankingMode: visibleState.rankingMode,
    metadataLoaded: visibleState.metadataLoaded,
    hasMetadataSnapshot: visibleState.hasMetadataSnapshot,
    refreshAfterMutation,
    updateListOptions,
    evictDeletedList,
  };
}
