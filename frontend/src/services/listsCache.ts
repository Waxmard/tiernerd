import { LIST_COLORS, type ListColor } from '../design-system/tokens/colors.ts';
import type { ListSimple } from './listsService';

export const listsCacheKey = (userId: string): string =>
  `cachedLists:${userId}`;

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
