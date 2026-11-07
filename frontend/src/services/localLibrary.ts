import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Item } from './itemsService.ts';
import {
  enqueueListCacheWrite,
  listItemsCacheKey,
  listsCacheKey,
  parseCachedListItems,
  parseCachedLists,
  sortListsByRecency,
} from './listsCache.ts';
import type { ListSimple, ListSummaryPatch } from './listsService.ts';
import { scoreForRank } from './rankingEngine.ts';

export interface LocalCacheStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

type SummaryPatch = ListSummaryPatch & {
  updated_at?: string;
  item_count?: number;
};

export function createLocalLibrary(storage: LocalCacheStorage) {
  const readItems = async (userId: string, listId: string): Promise<Item[]> =>
    parseCachedListItems(
      await storage
        .getItem(listItemsCacheKey(userId, listId))
        .catch(() => null),
      listId
    ) ?? [];

  const writeItems = async (
    userId: string,
    listId: string,
    items: Item[]
  ): Promise<void> => {
    const key = listItemsCacheKey(userId, listId);
    await enqueueListCacheWrite(key, () =>
      storage.setItem(key, JSON.stringify(items))
    );
  };

  const patchSummary = async (
    userId: string,
    listId: string,
    patch: SummaryPatch
  ): Promise<void> => {
    const key = listsCacheKey(userId);
    await enqueueListCacheWrite(key, async () => {
      const lists =
        parseCachedLists(await storage.getItem(key).catch(() => null)) ?? [];
      const target = lists.find((list) => list.list_id === listId);
      if (!target) return;
      await storage.setItem(
        key,
        JSON.stringify(
          sortListsByRecency([
            ...lists.filter((list) => list.list_id !== listId),
            { ...target, ...patch },
          ])
        )
      );
    });
  };

  const rescore = (items: Item[], nowIso: string): Item[] => {
    const ranked = items.filter((item) => item.position !== null);
    const unranked = items.filter((item) => item.position === null);
    const rankedCount = ranked.length;
    return [
      ...ranked.map((item, index) => ({
        ...item,
        rating: scoreForRank(index + 1, rankedCount),
        updated_at: nowIso,
      })),
      ...unranked,
    ];
  };

  return {
    applyLocalListCreate: async (
      userId: string,
      list: ListSimple
    ): Promise<void> => {
      const itemsKey = listItemsCacheKey(userId, list.list_id);
      await enqueueListCacheWrite(itemsKey, async () => {
        const existing = await storage.getItem(itemsKey).catch(() => null);
        if (existing === null) await storage.setItem(itemsKey, '[]');
      });
      const key = listsCacheKey(userId);
      await enqueueListCacheWrite(key, async () => {
        const lists =
          parseCachedLists(await storage.getItem(key).catch(() => null)) ?? [];
        await storage.setItem(
          key,
          JSON.stringify(
            sortListsByRecency([
              ...lists.filter((entry) => entry.list_id !== list.list_id),
              list,
            ])
          )
        );
      });
    },

    applyLocalListUpdate: async (
      userId: string,
      listId: string,
      metadata: ListSummaryPatch,
      updatedAt: string
    ): Promise<void> => {
      await patchSummary(userId, listId, {
        ...metadata,
        updated_at: updatedAt,
      });
    },

    applyLocalListDelete: async (
      userId: string,
      listId: string
    ): Promise<void> => {
      const itemsKey = listItemsCacheKey(userId, listId);
      const key = listsCacheKey(userId);
      await enqueueListCacheWrite(itemsKey, () => storage.removeItem(itemsKey));
      await enqueueListCacheWrite(key, async () => {
        const lists =
          parseCachedLists(await storage.getItem(key).catch(() => null)) ?? [];
        await storage.setItem(
          key,
          JSON.stringify(lists.filter((list) => list.list_id !== listId))
        );
      });
    },

    applyLocalItemCreate: async (
      userId: string,
      listId: string,
      item: Item
    ): Promise<void> => {
      const items = [
        ...(await readItems(userId, listId)).filter(
          (entry) => entry.item_id !== item.item_id
        ),
        item,
      ];
      await writeItems(userId, listId, items);
      await patchSummary(userId, listId, {
        item_count: items.length,
        updated_at: item.updated_at,
      });
    },

    applyLocalItemUpdate: async (
      userId: string,
      listId: string,
      item: Item
    ): Promise<void> => {
      const items = (await readItems(userId, listId)).map((entry) =>
        entry.item_id === item.item_id ? item : entry
      );
      await writeItems(userId, listId, items);
      await patchSummary(userId, listId, { updated_at: item.updated_at });
    },

    applyLocalItemDelete: async (
      userId: string,
      listId: string,
      itemId: string
    ): Promise<void> => {
      const current = await readItems(userId, listId);
      const removed = current.find((item) => item.item_id === itemId);
      const remaining = current.filter((item) => item.item_id !== itemId);
      const nowIso = new Date().toISOString();
      const items =
        removed && removed.position !== null
          ? rescore(remaining, nowIso)
          : remaining;
      await writeItems(userId, listId, items);
      await patchSummary(userId, listId, {
        item_count: items.length,
        updated_at: nowIso,
      });
    },

    applyLocalRanking: async (
      userId: string,
      listId: string,
      item: Item,
      insertIndexBestFirst: number
    ): Promise<void> => {
      const others = (await readItems(userId, listId)).filter(
        (entry) => entry.item_id !== item.item_id
      );
      const ranked = others.filter((entry) => entry.position !== null);
      const unranked = others.filter((entry) => entry.position === null);
      const index = Math.max(0, Math.min(insertIndexBestFirst, ranked.length));
      const nowIso = new Date().toISOString();
      const next = rescore(
        [
          ...ranked.slice(0, index),
          { ...item, position: 'pending', updated_at: nowIso },
          ...ranked.slice(index),
          ...unranked,
        ],
        nowIso
      );
      await writeItems(userId, listId, next);
      await patchSummary(userId, listId, { updated_at: nowIso });
    },
  };
}

export const localLibrary = createLocalLibrary(AsyncStorage);
