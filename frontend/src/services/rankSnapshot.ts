import type { ComparisonSession, Item } from './itemsService';

export function hasSavedRankChanged(
  session: ComparisonSession,
  item: Item
): boolean {
  return (
    item.rating !== session.item.rating ||
    item.position !== session.item.position ||
    item.tier_set !== session.item.tier_set
  );
}
