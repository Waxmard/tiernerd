import { LIST_COLORS, type ListColor } from '../design-system/tokens/colors.ts';
import type { Item } from './itemsService';
import type { ListSimple } from './listsService';

export const listsCacheKey = (userId: string): string =>
  `cachedLists:${userId}`;

export const listItemsCacheKey = (userId: string, listId: string): string =>
  `cachedListItems:v1:${userId}:${listId}`;

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

const isItem = (value: unknown, listId: string): value is Item => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Item;
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
    (candidate.tier_set === null ||
      candidate.tier_set === 'good' ||
      candidate.tier_set === 'mid' ||
      candidate.tier_set === 'bad') &&
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
  return parsed.every((item) => isItem(item, listId)) ? parsed : null;
}

const isListSimple = (value: unknown): value is ListSimple => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as ListSimple;
  return (
    typeof candidate.list_id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.item_count === 'number' &&
    typeof candidate.updated_at === 'string' &&
    (candidate.color === null ||
      LIST_COLORS.includes(candidate.color as ListColor))
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
  return parsed.every(isListSimple) ? parsed : null;
}
