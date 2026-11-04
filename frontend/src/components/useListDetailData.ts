import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  canApplyCachedItems,
  canApplyCachedMetadata,
  canApplyHydration,
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
  type ListRankingMode,
  listsService,
} from '../services/listsService';

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
        const nextItems = await listsService.getListItems(
          lifecycle.listId,
          lifecycle.token
        );
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
        const list = await listsService.getList(
          lifecycle.listId,
          lifecycle.token
        );
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
            listColor: list.color,
            rankingMode: list.ranking_mode,
            metadataError: false,
            metadataLoaded: true,
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
    [invalidateDefinitiveRead, updateState]
  );
  const hydrateCache = useCallback(
    async (lifecycle: ListDetailLifecycle): Promise<void> => {
      if (
        !isLifecycleReadable(lifecycle, lifecycleRef.current) ||
        !lifecycle.userId
      )
        return;
      const { hydrationId, version } = {
        hydrationId: ++lifecycle.hydrationRequest,
        version: lifecycle.cacheVersion,
      };
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
              rankingMode: cachedList.ranking_mode,
            })
        );
      }
    },
    [updateState]
  );

  const fetchItems = useCallback(async () => {
    const lifecycle = lifecycleRef.current as ListDetailLifecycle;
    const version = lifecycle.cacheVersion;
    const promise = fetchItemsFor(lifecycle);
    const itemsRequestId = lifecycle.itemsRequest;
    const items = await promise;
    const accepted = metadataRef.current;
    if (
      accepted?.lifecycle === lifecycle &&
      canWriteCachedSummary(
        lifecycle,
        version,
        accepted.requestId,
        itemsRequestId,
        lifecycleRef.current
      )
    )
      void writeCachedSummary(
        lifecycle,
        version,
        accepted.metadata,
        items.length,
        accepted.requestId,
        itemsRequestId
      ).catch(() => {});
    return items;
  }, [fetchItemsFor, writeCachedSummary]);
  const refreshMetadata = useCallback(async () => {
    const lifecycle = lifecycleRef.current as ListDetailLifecycle;
    const version = lifecycle.cacheVersion;
    const promise = refreshMetadataFor(lifecycle);
    const requestId = lifecycle.metadataRequest;
    const metadata = await promise;
    if (metadata && lifecycle.itemsAcceptedLive)
      void writeCachedSummary(
        lifecycle,
        version,
        metadata,
        itemsRef.current.length,
        requestId
      ).catch(() => {});
    return metadata;
  }, [refreshMetadataFor, writeCachedSummary]);
  const refreshAfterMutation = useCallback(async (): Promise<Item[]> => {
    const lifecycle = lifecycleRef.current;
    if (!lifecycle || !isLifecycleReadable(lifecycle, lifecycleRef.current))
      throw new Error(ITEMS_ERROR);
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
    await removeCachedItems(lifecycle, version).catch(() => undefined);
    if (
      !isLifecycleReadable(lifecycle, lifecycleRef.current) ||
      lifecycle.cacheVersion !== version
    )
      throw new Error(ITEMS_ERROR);
    const itemsPromise = fetchItemsFor(lifecycle);
    const metadataPromise = refreshMetadataFor(lifecycle);
    const requestId = lifecycle.metadataRequest;
    const [items, metadata] = await Promise.all([
      itemsPromise,
      metadataPromise,
    ]);
    if (
      !metadata ||
      !isCacheCurrent(lifecycle, version, lifecycleRef.current) ||
      !canAcceptMetadataResponse(lifecycle, requestId, lifecycleRef.current)
    ) {
      lifecycle.itemsAcceptedLive = false;
      updateState(
        lifecycle,
        () => lifecycle.cacheVersion === version,
        (previous) => ({
          ...previous,
          itemsLoaded: false,
          itemsError: ITEMS_ERROR,
        })
      );
      throw new Error(ITEMS_ERROR);
    }
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
    removeCachedItems,
    updateState,
    writeCachedSummary,
  ]);
  const updateRankingMode = useCallback(
    async (mode: ListRankingMode): Promise<void> => {
      const lifecycle = lifecycleRef.current;
      if (
        !lifecycle?.token ||
        !isLifecycleReadable(lifecycle, lifecycleRef.current) ||
        !lifecycle.itemsAcceptedLive ||
        !lifecycle.metadataAcceptedLive ||
        modeSaveRef.current === lifecycle
      )
        throw new Error(ITEMS_ERROR);
      modeSaveRef.current = lifecycle;
      const requestId = ++lifecycle.metadataRequest;
      const version = ++lifecycle.cacheVersion;
      lifecycle.hydrationRequest++;
      try {
        const metadata = await listsService.setRankingMode(
          lifecycle.listId,
          mode,
          lifecycle.token
        );
        if (
          !canAcceptMetadataResponse(
            lifecycle,
            requestId,
            lifecycleRef.current
          ) ||
          !isCacheCurrent(lifecycle, version, lifecycleRef.current)
        )
          throw new Error(ITEMS_ERROR);
        metadataRef.current = { lifecycle, requestId, metadata };
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
            detailsTitle: metadata.title,
            listDescription: metadata.description,
            listColor: metadata.color,
            rankingMode: metadata.ranking_mode,
            metadataError: false,
            metadataLoaded: true,
          })
        );
        await writeCachedSummary(
          lifecycle,
          version,
          metadata,
          itemsRef.current.length
        ).catch(() => {});
      } catch (error: unknown) {
        throw new Error(
          error instanceof Error && error.message === INVALID_RANKING_MODE
            ? error.message
            : getApiErrorMessage(
                error,
                'Unable to save ranking mode. Try again.'
              )
        );
      } finally {
        if (modeSaveRef.current === lifecycle) modeSaveRef.current = null;
      }
    },
    [updateState, writeCachedSummary]
  );
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
    void hydrateCache(lifecycle);
    return () => {
      deactivateLifecycle(lifecycle);
    };
  }, [
    fetchItemsFor,
    hydrateCache,
    identity,
    refreshMetadataFor,
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
    listColor: visibleState.listColor,
    rankingMode: visibleState.rankingMode,
    metadataError: visibleState.metadataError,
    metadataLoaded: visibleState.metadataLoaded,
    fetchItems,
    refreshMetadata,
    refreshAfterMutation,
    updateRankingMode,
    evictDeletedList,
  };
}
