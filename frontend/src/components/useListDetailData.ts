import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ListColor } from '../design-system/tokens/colors';
import { ApiError } from '../services/apiError';
import type { Item } from '../services/itemsService';
import {
  enqueueListCacheWrite,
  listItemsCacheKey,
  listsCacheKey,
  parseCachedListItems,
  parseCachedLists,
} from '../services/listsCache';
import { listsService } from '../services/listsService';

const ITEMS_ERROR = 'Unable to refresh items. Try again.';

interface UseListDetailDataOptions {
  userId: string | null;
  token: string | null;
  listId: string;
  routeTitle: string;
}

interface ListDetailDataState {
  identity: string;
  items: Item[];
  isLoadingItems: boolean;
  itemsLoaded: boolean;
  hasItemsSnapshot: boolean;
  itemsError: string | null;
  detailsTitle: string;
  listDescription: string | null;
  listColor: ListColor | null;
  metadataError: boolean;
  metadataLoaded: boolean;
}

interface Lifecycle {
  identity: string;
  userId: string | null;
  token: string | null;
  listId: string;
  routeTitle: string;
  active: boolean;
  deleted: boolean;
  itemsRequest: number;
  metadataRequest: number;
  hydrationRequest: number;
  cacheVersion: number;
  itemsAcceptedLive: boolean;
  metadataAcceptedLive: boolean;
}

const createState = (
  identity: string,
  routeTitle: string
): ListDetailDataState => ({
  identity,
  items: [],
  isLoadingItems: true,
  itemsLoaded: false,
  hasItemsSnapshot: false,
  itemsError: null,
  detailsTitle: routeTitle,
  listDescription: null,
  listColor: null,
  metadataError: false,
  metadataLoaded: false,
});

const isDefinitiveReadError = (error: unknown): boolean =>
  error instanceof ApiError &&
  (error.status === 401 || error.status === 403 || error.status === 404);

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
  const lifecycleRef = useRef<Lifecycle | null>(null);
  const itemsRef = useRef<Item[]>([]);
  if (!lifecycleRef.current || lifecycleRef.current.identity !== identity) {
    lifecycleRef.current = {
      identity,
      userId,
      token,
      listId,
      routeTitle,
      active: true,
      deleted: false,
      itemsRequest: 0,
      metadataRequest: 0,
      hydrationRequest: 0,
      cacheVersion: 0,
      itemsAcceptedLive: false,
      metadataAcceptedLive: false,
    };
    itemsRef.current = [];
  } else {
    lifecycleRef.current.routeTitle = routeTitle;
  }
  const [state, setState] = useState(() => createState(identity, routeTitle));

  const isCurrent = useCallback(
    (lifecycle: Lifecycle) =>
      lifecycleRef.current === lifecycle && lifecycle.active,
    []
  );
  const isReadable = useCallback(
    (lifecycle: Lifecycle) => isCurrent(lifecycle) && !lifecycle.deleted,
    [isCurrent]
  );
  const isCacheCurrent = useCallback(
    (lifecycle: Lifecycle, version: number) =>
      isCurrent(lifecycle) && lifecycle.cacheVersion === version,
    [isCurrent]
  );
  const updateState = useCallback(
    (
      lifecycle: Lifecycle,
      guard: () => boolean,
      update: (previous: ListDetailDataState) => ListDetailDataState
    ) => {
      if (!isCurrent(lifecycle) || !guard()) return;
      setState((previous) =>
        isCurrent(lifecycle) &&
        previous.identity === lifecycle.identity &&
        guard()
          ? update(previous)
          : previous
      );
    },
    [isCurrent]
  );
  const queueCacheWork = useCallback(
    (
      lifecycle: Lifecycle,
      key: string,
      version: number,
      operation: () => Promise<void>
    ) => {
      if (!isCacheCurrent(lifecycle, version)) return Promise.resolve();
      return enqueueListCacheWrite(key, async () => {
        if (!isCacheCurrent(lifecycle, version)) return;
        await operation();
      });
    },
    [isCacheCurrent]
  );
  const removeCachedItems = useCallback(
    (lifecycle: Lifecycle, version: number) => {
      if (!lifecycle.userId) return Promise.resolve();
      const key = listItemsCacheKey(lifecycle.userId, lifecycle.listId);
      return queueCacheWork(lifecycle, key, version, () =>
        AsyncStorage.removeItem(key)
      );
    },
    [queueCacheWork]
  );
  const removeCachedOverview = useCallback(
    (lifecycle: Lifecycle, version: number) => {
      if (!lifecycle.userId) return Promise.resolve();
      const key = listsCacheKey(lifecycle.userId);
      return queueCacheWork(lifecycle, key, version, () =>
        AsyncStorage.removeItem(key)
      );
    },
    [queueCacheWork]
  );
  const removeListFromCachedOverview = useCallback(
    (lifecycle: Lifecycle, version: number) => {
      if (!lifecycle.userId) return Promise.resolve();
      const key = listsCacheKey(lifecycle.userId);
      return queueCacheWork(lifecycle, key, version, async () => {
        const raw = await AsyncStorage.getItem(key).catch(() => null);
        if (!isCacheCurrent(lifecycle, version)) return;
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
    [isCacheCurrent, queueCacheWork]
  );
  const clearPersistedList = useCallback(
    async (lifecycle: Lifecycle, version: number) => {
      await Promise.all([
        removeCachedItems(lifecycle, version).catch(() => undefined),
        removeListFromCachedOverview(lifecycle, version).catch(() => undefined),
      ]);
    },
    [removeCachedItems, removeListFromCachedOverview]
  );
  const invalidateDefinitiveRead = useCallback(
    (lifecycle: Lifecycle) => {
      lifecycle.itemsRequest += 1;
      lifecycle.metadataRequest += 1;
      lifecycle.hydrationRequest += 1;
      lifecycle.cacheVersion += 1;
      lifecycle.itemsAcceptedLive = false;
      lifecycle.metadataAcceptedLive = false;
      const version = lifecycle.cacheVersion;
      itemsRef.current = [];
      updateState(
        lifecycle,
        () => lifecycle.cacheVersion === version,
        (previous) => ({
          ...previous,
          items: [],
          isLoadingItems: false,
          itemsLoaded: false,
          hasItemsSnapshot: false,
          itemsError: ITEMS_ERROR,
          detailsTitle: lifecycle.routeTitle,
          listDescription: null,
          listColor: null,
          metadataError: true,
          metadataLoaded: false,
        })
      );
      void clearPersistedList(lifecycle, version);
    },
    [clearPersistedList, updateState]
  );
  const fetchItemsFor = useCallback(
    async (lifecycle: Lifecycle): Promise<Item[]> => {
      if (!isReadable(lifecycle)) throw new Error(ITEMS_ERROR);
      if (!lifecycle.token) {
        updateState(
          lifecycle,
          () => isReadable(lifecycle),
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
        if (!isReadable(lifecycle) || requestId !== lifecycle.itemsRequest)
          throw new Error(ITEMS_ERROR);
        lifecycle.itemsAcceptedLive = true;
        itemsRef.current = nextItems;
        updateState(
          lifecycle,
          () => lifecycle.itemsRequest === requestId,
          (previous) => ({
            ...previous,
            items: nextItems,
            isLoadingItems: false,
            itemsLoaded: true,
            hasItemsSnapshot: true,
            itemsError: null,
          })
        );
        const version = lifecycle.cacheVersion;
        if (
          lifecycle.userId &&
          isReadable(lifecycle) &&
          lifecycle.itemsRequest === requestId
        ) {
          const key = listItemsCacheKey(lifecycle.userId, lifecycle.listId);
          void queueCacheWork(lifecycle, key, version, () => {
            if (!isReadable(lifecycle) || lifecycle.itemsRequest !== requestId)
              return Promise.resolve();
            return AsyncStorage.setItem(key, JSON.stringify(nextItems));
          }).catch(() => {});
        }
        return nextItems;
      } catch (error: unknown) {
        if (isReadable(lifecycle) && requestId === lifecycle.itemsRequest) {
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
        if (isReadable(lifecycle) && requestId === lifecycle.itemsRequest) {
          updateState(
            lifecycle,
            () => lifecycle.itemsRequest === requestId,
            (previous) => ({ ...previous, isLoadingItems: false })
          );
        }
      }
    },
    [invalidateDefinitiveRead, isReadable, queueCacheWork, updateState]
  );
  const refreshMetadataFor = useCallback(
    async (lifecycle: Lifecycle): Promise<void> => {
      if (!isReadable(lifecycle)) return;
      if (!lifecycle.token) {
        updateState(
          lifecycle,
          () => isReadable(lifecycle),
          (previous) => ({
            ...previous,
            metadataError: true,
            metadataLoaded: false,
          })
        );
        return;
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
        if (!isReadable(lifecycle) || requestId !== lifecycle.metadataRequest)
          return;
        lifecycle.metadataAcceptedLive = true;
        updateState(
          lifecycle,
          () => lifecycle.metadataRequest === requestId,
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
        if (isReadable(lifecycle) && requestId === lifecycle.metadataRequest) {
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
    [invalidateDefinitiveRead, isReadable, updateState]
  );
  const hydrateCache = useCallback(
    async (lifecycle: Lifecycle): Promise<void> => {
      if (!isReadable(lifecycle) || !lifecycle.userId) return;
      const hydrationId = ++lifecycle.hydrationRequest;
      const version = lifecycle.cacheVersion;
      const itemKey = listItemsCacheKey(lifecycle.userId, lifecycle.listId);
      const overviewKey = listsCacheKey(lifecycle.userId);
      const entries = await AsyncStorage.multiGet([itemKey, overviewKey]).catch(
        () => null
      );
      if (!entries) return;
      if (
        !isReadable(lifecycle) ||
        hydrationId !== lifecycle.hydrationRequest ||
        version !== lifecycle.cacheVersion
      )
        return;
      const cachedItems = parseCachedListItems(
        entries.find(([key]) => key === itemKey)?.[1] ?? null,
        lifecycle.listId
      );
      if (cachedItems && !lifecycle.itemsAcceptedLive) {
        itemsRef.current = cachedItems;
        updateState(
          lifecycle,
          () =>
            hydrationId === lifecycle.hydrationRequest &&
            version === lifecycle.cacheVersion &&
            !lifecycle.itemsAcceptedLive,
          (previous) => ({
            ...previous,
            items: cachedItems,
            hasItemsSnapshot: true,
          })
        );
      }
      const cachedLists = parseCachedLists(
        entries.find(([key]) => key === overviewKey)?.[1] ?? null
      );
      const cachedList = cachedLists?.find(
        (candidate) => candidate.list_id === lifecycle.listId
      );
      if (cachedList && !lifecycle.metadataAcceptedLive) {
        updateState(
          lifecycle,
          () =>
            hydrationId === lifecycle.hydrationRequest &&
            version === lifecycle.cacheVersion &&
            !lifecycle.metadataAcceptedLive,
          (previous) => ({
            ...previous,
            detailsTitle: cachedList.title,
            listDescription: cachedList.description,
            listColor: cachedList.color,
          })
        );
      }
    },
    [isReadable, updateState]
  );

  const fetchItems = useCallback(
    () => fetchItemsFor(lifecycleRef.current as Lifecycle),
    [fetchItemsFor]
  );
  const refreshMetadata = useCallback(
    () => refreshMetadataFor(lifecycleRef.current as Lifecycle),
    [refreshMetadataFor]
  );
  const refreshAfterMutation = useCallback(async (): Promise<Item[]> => {
    const lifecycle = lifecycleRef.current;
    if (!lifecycle || !isReadable(lifecycle)) throw new Error(ITEMS_ERROR);
    lifecycle.itemsRequest += 1;
    lifecycle.hydrationRequest += 1;
    lifecycle.cacheVersion += 1;
    lifecycle.itemsAcceptedLive = false;
    const version = lifecycle.cacheVersion;
    updateState(
      lifecycle,
      () => lifecycle.cacheVersion === version,
      (previous) => ({
        ...previous,
        isLoadingItems: true,
        itemsLoaded: false,
        itemsError: null,
      })
    );
    await Promise.all([
      removeCachedItems(lifecycle, version).catch(() => undefined),
      removeCachedOverview(lifecycle, version).catch(() => undefined),
    ]);
    if (!isReadable(lifecycle) || lifecycle.cacheVersion !== version)
      throw new Error(ITEMS_ERROR);
    return fetchItemsFor(lifecycle);
  }, [
    fetchItemsFor,
    isReadable,
    removeCachedItems,
    removeCachedOverview,
    updateState,
  ]);
  const evictDeletedList = useCallback(async (): Promise<void> => {
    const lifecycle = lifecycleRef.current;
    if (!lifecycle || !isCurrent(lifecycle) || lifecycle.deleted) return;
    lifecycle.deleted = true;
    lifecycle.itemsRequest += 1;
    lifecycle.metadataRequest += 1;
    lifecycle.hydrationRequest += 1;
    lifecycle.cacheVersion += 1;
    lifecycle.itemsAcceptedLive = false;
    lifecycle.metadataAcceptedLive = false;
    const version = lifecycle.cacheVersion;
    itemsRef.current = [];
    updateState(
      lifecycle,
      () => lifecycle.cacheVersion === version,
      () => ({
        ...createState(lifecycle.identity, lifecycle.routeTitle),
        isLoadingItems: false,
      })
    );
    await clearPersistedList(lifecycle, version);
  }, [clearPersistedList, isCurrent, updateState]);

  useEffect(() => {
    const lifecycle = lifecycleRef.current;
    if (!lifecycle || lifecycle.identity !== identity) return;
    lifecycle.active = true;
    setState(createState(lifecycle.identity, lifecycle.routeTitle));
    itemsRef.current = [];
    void fetchItemsFor(lifecycle).catch(() => {});
    void refreshMetadataFor(lifecycle);
    void hydrateCache(lifecycle);
    return () => {
      lifecycle.active = false;
      lifecycle.itemsRequest += 1;
      lifecycle.metadataRequest += 1;
      lifecycle.hydrationRequest += 1;
      lifecycle.cacheVersion += 1;
    };
  }, [fetchItemsFor, hydrateCache, identity, refreshMetadataFor]);

  const visibleState =
    state.identity === identity ? state : createState(identity, routeTitle);
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
