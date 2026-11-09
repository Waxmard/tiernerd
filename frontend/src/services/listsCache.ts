import {
  LIST_COLORS,
  LIST_COVERS,
  LIST_ICONS,
  type ListColor,
  type ListCover,
  type ListIcon,
} from '../design-system/tokens/colors.ts';
import { ApiError } from './apiError.ts';
import type { Item } from './itemsService.ts';
import type { ListPhoto } from './listCoversService.ts';
import type { ListRankingMode, ListSimple } from './listsService.ts';

export const listsCacheKey = (userId: string): string =>
  `cachedLists:${userId}`;

export const listItemsCacheKey = (userId: string, listId: string): string =>
  `cachedListItems:v2:${userId}:${listId}`;

const cacheWrites = new Map<string, Promise<void>>();

export function enqueueListCacheWrite(
  key: string,
  operation: () => Promise<void>
): Promise<void> {
  const previous = cacheWrites.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  cacheWrites.set(key, current);
  const release = () => {
    if (cacheWrites.get(key) === current) cacheWrites.delete(key);
  };
  void current.then(release, release);
  return current;
}

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

type CachedItem = Omit<Item, 'manual_rating'> & {
  manual_rating?: number | null;
};

const isItem = (value: unknown, listId: string): value is CachedItem => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as CachedItem;
  return (
    typeof candidate.item_id === 'string' &&
    candidate.list_id === listId &&
    typeof candidate.name === 'string' &&
    isNullableString(candidate.description) &&
    isNullableString(candidate.image_url) &&
    (candidate.rating === null ||
      (typeof candidate.rating === 'number' &&
        Number.isFinite(candidate.rating))) &&
    isNullableString(candidate.position) &&
    (!('manual_rating' in candidate) ||
      candidate.manual_rating === undefined ||
      candidate.manual_rating === null ||
      (candidate.position !== null &&
        typeof candidate.manual_rating === 'number' &&
        Number.isFinite(candidate.manual_rating) &&
        candidate.manual_rating >= 0 &&
        candidate.manual_rating <= 10)) &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

export function parseCachedListItems(
  raw: string | null,
  listId: string
): Item[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed.every((item) => isItem(item, listId))
    ? parsed.map((item) => ({
        ...item,
        manual_rating: item.manual_rating ?? null,
      }))
    : null;
}

export function mergePendingItems(items: Item[], pending: Item[]): Item[] {
  const merged = [...items];
  const placed = new Set(merged.map((item) => item.item_id));
  for (const entry of pending) {
    if (placed.has(entry.item_id)) continue;
    placed.add(entry.item_id);
    const rating = entry.rating;
    const index =
      rating === null
        ? -1
        : merged.findIndex(
            (item) => item.rating === null || item.rating < rating
          );
    merged.splice(index === -1 ? merged.length : index, 0, entry);
  }
  return merged;
}

export function sortListsByRecency(lists: ListSimple[]): ListSimple[] {
  return [...lists].sort((a, b) => {
    const difference = Date.parse(b.updated_at) - Date.parse(a.updated_at);
    return (
      difference || (a.list_id < b.list_id ? -1 : a.list_id > b.list_id ? 1 : 0)
    );
  });
}

type CachedListSimple = Omit<
  ListSimple,
  'ranking_mode' | 'icon' | 'cover' | 'cover_photo'
> & {
  ranking_mode?: ListRankingMode;
  icon?: ListIcon | null;
  cover?: ListCover | null;
  cover_photo?: ListPhoto | null;
};

const isProviderUrl = (value: unknown, host: RegExp): boolean => {
  if (typeof value !== 'string' || !host.test(value)) return false;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 32 || code === 127) return false;
  }
  return true;
};

const isListPhoto = (value: unknown): value is ListPhoto => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const photo = value as Record<string, unknown>;
  if (photo.source === 'upload')
    return (
      Object.keys(photo).length === 2 &&
      typeof photo.id === 'string' &&
      photo.id.length === 36 &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        photo.id
      )
    );
  return (
    photo.source === 'unsplash' &&
    Object.keys(photo).length === 6 &&
    typeof photo.id === 'string' &&
    photo.id.length >= 1 &&
    photo.id.length <= 100 &&
    !/[^A-Za-z0-9_-]/.test(photo.id) &&
    typeof photo.photographer_name === 'string' &&
    photo.photographer_name.trim().length > 0 &&
    isProviderUrl(photo.url, /^https:\/\/images\.unsplash\.com\//i) &&
    isProviderUrl(
      photo.photographer_url,
      /^https:\/\/(www\.)?unsplash\.com\//i
    ) &&
    isProviderUrl(photo.photo_url, /^https:\/\/(www\.)?unsplash\.com\//i)
  );
};

const isListSimple = (value: unknown): value is CachedListSimple => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as CachedListSimple;
  return (
    typeof candidate.list_id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.item_count === 'number' &&
    typeof candidate.updated_at === 'string' &&
    !Number.isNaN(Date.parse(candidate.updated_at)) &&
    (candidate.color === null ||
      LIST_COLORS.includes(candidate.color as ListColor)) &&
    (!('icon' in candidate) ||
      candidate.icon === null ||
      LIST_ICONS.includes(candidate.icon as ListIcon)) &&
    (!('cover' in candidate) ||
      candidate.cover === null ||
      LIST_COVERS.includes(candidate.cover as ListCover)) &&
    (!('cover_photo' in candidate) ||
      candidate.cover_photo === null ||
      isListPhoto(candidate.cover_photo)) &&
    (!candidate.cover || !candidate.cover_photo) &&
    (!('ranking_mode' in candidate) ||
      candidate.ranking_mode === 'rank' ||
      candidate.ranking_mode === 'score')
  );
};

export function parseCachedLists(raw: string | null): ListSimple[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed.every(isListSimple)
    ? sortListsByRecency(
        parsed.map((list) => ({
          ...list,
          icon: list.icon ?? null,
          cover: list.cover ?? null,
          cover_photo: list.cover_photo ?? null,
          ranking_mode: list.ranking_mode ?? 'score',
        }))
      )
    : null;
}
export interface ListDetailDataState {
  identity: string;
  items: Item[];
  isLoadingItems: boolean;
  itemsLoaded: boolean;
  hasItemsSnapshot: boolean;
  itemsError: string | null;
  detailsTitle: string;
  listDescription: string | null;
  listColor: ListColor | null;
  listIcon: ListIcon | null;
  listCover: ListCover | null;
  listCoverPhoto: ListPhoto | null;
  rankingMode: ListRankingMode;
  metadataError: boolean;
  metadataLoaded: boolean;
  hasMetadataSnapshot: boolean;
}

export interface ListDetailLifecycle {
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

export const isDefinitiveReadError = (error: unknown): boolean =>
  error instanceof ApiError &&
  (error.status === 401 || error.status === 403 || error.status === 404);

export const createListDetailState = (
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
  listIcon: null,
  listCover: null,
  listCoverPhoto: null,
  rankingMode: 'score',
  metadataError: false,
  metadataLoaded: false,
  hasMetadataSnapshot: false,
});

export const createListDetailLifecycle = (options: {
  identity: string;
  userId: string | null;
  token: string | null;
  listId: string;
  routeTitle: string;
}): ListDetailLifecycle => ({
  identity: options.identity,
  userId: options.userId,
  token: options.token,
  listId: options.listId,
  routeTitle: options.routeTitle,
  active: true,
  deleted: false,
  itemsRequest: 0,
  metadataRequest: 0,
  hydrationRequest: 0,
  cacheVersion: 0,
  itemsAcceptedLive: false,
  metadataAcceptedLive: false,
});

export const isLifecycleActive = (
  lifecycle: ListDetailLifecycle,
  current?: ListDetailLifecycle | null
): boolean => lifecycle.active && (!current || current === lifecycle);

export const isLifecycleReadable = (
  lifecycle: ListDetailLifecycle,
  current?: ListDetailLifecycle | null
): boolean => isLifecycleActive(lifecycle, current) && !lifecycle.deleted;

export const isCacheCurrent = (
  lifecycle: ListDetailLifecycle,
  version: number,
  current?: ListDetailLifecycle | null
): boolean =>
  isLifecycleActive(lifecycle, current) && lifecycle.cacheVersion === version;

export const canAcceptItemsResponse = (
  lifecycle: ListDetailLifecycle,
  requestId: number,
  current?: ListDetailLifecycle | null
): boolean =>
  isLifecycleReadable(lifecycle, current) &&
  lifecycle.itemsRequest === requestId;

export const canAcceptMetadataResponse = (
  lifecycle: ListDetailLifecycle,
  requestId: number,
  current?: ListDetailLifecycle | null
): boolean =>
  isLifecycleReadable(lifecycle, current) &&
  lifecycle.metadataRequest === requestId;

export const canApplyHydration = (
  lifecycle: ListDetailLifecycle,
  hydrationId: number,
  version: number,
  current?: ListDetailLifecycle | null
): boolean =>
  isLifecycleReadable(lifecycle, current) &&
  lifecycle.hydrationRequest === hydrationId &&
  lifecycle.cacheVersion === version;

export const canApplyCachedItems = (
  lifecycle: ListDetailLifecycle,
  hydrationId: number,
  version: number,
  current?: ListDetailLifecycle | null
): boolean =>
  canApplyHydration(lifecycle, hydrationId, version, current) &&
  !lifecycle.itemsAcceptedLive;

export const canApplyCachedMetadata = (
  lifecycle: ListDetailLifecycle,
  hydrationId: number,
  version: number,
  current?: ListDetailLifecycle | null
): boolean =>
  canApplyHydration(lifecycle, hydrationId, version, current) &&
  !lifecycle.metadataAcceptedLive;

export const canWriteCachedItems = (
  lifecycle: ListDetailLifecycle,
  version: number,
  requestId: number,
  current?: ListDetailLifecycle | null
): boolean =>
  isLifecycleReadable(lifecycle, current) &&
  lifecycle.cacheVersion === version &&
  lifecycle.itemsRequest === requestId;

export const canWriteCachedSummary = (
  lifecycle: ListDetailLifecycle,
  version: number,
  metadataRequestId?: number,
  itemsRequestId?: number,
  current?: ListDetailLifecycle | null
): boolean =>
  isLifecycleReadable(lifecycle, current) &&
  isCacheCurrent(lifecycle, version, current) &&
  lifecycle.metadataAcceptedLive &&
  lifecycle.itemsAcceptedLive &&
  (metadataRequestId === undefined ||
    canAcceptMetadataResponse(lifecycle, metadataRequestId, current)) &&
  (itemsRequestId === undefined ||
    canAcceptItemsResponse(lifecycle, itemsRequestId, current));

export const deactivateLifecycle = (lifecycle: ListDetailLifecycle): void => {
  lifecycle.active = false;
  lifecycle.itemsRequest += 1;
  lifecycle.metadataRequest += 1;
  lifecycle.hydrationRequest += 1;
  lifecycle.cacheVersion += 1;
  lifecycle.itemsAcceptedLive = false;
  lifecycle.metadataAcceptedLive = false;
};

export const evictLifecycleList = (lifecycle: ListDetailLifecycle): number => {
  lifecycle.deleted = true;
  lifecycle.itemsRequest += 1;
  lifecycle.metadataRequest += 1;
  lifecycle.hydrationRequest += 1;
  lifecycle.cacheVersion += 1;
  lifecycle.itemsAcceptedLive = false;
  lifecycle.metadataAcceptedLive = false;
  return lifecycle.cacheVersion;
};

export const invalidateLifecycleReads = (
  lifecycle: ListDetailLifecycle
): number => {
  lifecycle.itemsRequest += 1;
  lifecycle.metadataRequest += 1;
  lifecycle.hydrationRequest += 1;
  lifecycle.cacheVersion += 1;
  lifecycle.itemsAcceptedLive = false;
  lifecycle.metadataAcceptedLive = false;
  return lifecycle.cacheVersion;
};

export const bumpLifecycleMutation = (
  lifecycle: ListDetailLifecycle
): number => {
  lifecycle.itemsRequest += 1;
  lifecycle.hydrationRequest += 1;
  lifecycle.cacheVersion += 1;
  lifecycle.itemsAcceptedLive = false;
  return lifecycle.cacheVersion;
};

export const createInvalidatedReadState = (
  previous: ListDetailDataState,
  routeTitle: string,
  errorText: string
): ListDetailDataState => ({
  ...previous,
  items: [],
  isLoadingItems: false,
  itemsLoaded: false,
  hasItemsSnapshot: false,
  itemsError: errorText,
  detailsTitle: routeTitle,
  listDescription: null,
  listColor: null,
  listIcon: null,
  listCover: null,
  listCoverPhoto: null,
  rankingMode: 'score',
  metadataError: true,
  metadataLoaded: false,
  hasMetadataSnapshot: false,
});

export const applyLiveItemsState = (
  previous: ListDetailDataState,
  items: Item[]
): ListDetailDataState => ({
  ...previous,
  items,
  isLoadingItems: false,
  itemsLoaded: true,
  hasItemsSnapshot: true,
  itemsError: null,
});

export const applyCachedItemsState = (
  previous: ListDetailDataState,
  items: Item[]
): ListDetailDataState => ({
  ...previous,
  items,
  hasItemsSnapshot: true,
});

export const applyCachedMetadataState = (
  previous: ListDetailDataState,
  metadata: {
    title: string;
    description: string | null;
    color: ListColor | null;
    icon?: ListIcon | null;
    cover?: ListCover | null;
    coverPhoto?: ListPhoto | null;
    rankingMode: ListRankingMode;
  }
): ListDetailDataState => ({
  ...previous,
  detailsTitle: metadata.title,
  listDescription: metadata.description,
  listColor: metadata.color,
  listIcon: metadata.icon ?? null,
  listCover: metadata.cover ?? null,
  listCoverPhoto: metadata.coverPhoto ?? null,
  rankingMode: metadata.rankingMode,
  hasMetadataSnapshot: true,
});

export const applyMutationRefreshState = (
  previous: ListDetailDataState
): ListDetailDataState => ({
  ...previous,
  isLoadingItems: true,
  itemsLoaded: false,
  itemsError: null,
});

export const applyEvictedListState = (
  identity: string,
  routeTitle: string
): ListDetailDataState => ({
  ...createListDetailState(identity, routeTitle),
  isLoadingItems: false,
});
