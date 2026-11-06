export const normalizeItemName = (value: string): string =>
  value.trim().toLocaleLowerCase();

export function duplicateItemName(
  items: { item_id: string; name: string }[],
  name: string,
  excludeItemId?: string
): boolean {
  const target = normalizeItemName(name);
  return items.some(
    (item) =>
      item.item_id !== excludeItemId && normalizeItemName(item.name) === target
  );
}
