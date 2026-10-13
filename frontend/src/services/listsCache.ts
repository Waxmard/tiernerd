import type { ListSimple } from './listsService';

export const listsCacheKey = (userId: string): string =>
  `cachedLists:${userId}`;

const isListSimple = (value: unknown): value is ListSimple =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ListSimple).list_id === 'string';

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
