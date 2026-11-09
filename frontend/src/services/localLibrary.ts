import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeItemName } from './itemNames.ts';
import type { Item } from './itemsService.ts';
import {
  enqueueListCacheWrite,
  listItemsCacheKey,
  listsCacheKey,
  mergePendingItems,
  parseCachedListItems,
  parseCachedLists,
  sortListsByRecency,
} from './listsCache.ts';
import type {
  ListMetadata,
  ListSimple,
  ListSummaryPatch,
} from './listsService.ts';
import { computeScores } from './rankingEngine.ts';
import type { SyncOp } from './syncQueue.ts';
export interface LocalCacheStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

type SummaryPatch = ListSummaryPatch & {
  updated_at?: string;
  item_count?: number;
};

export function rescoreItems(items: Item[], nowIso: string): Item[] {
  const ranked = items.filter((item) => item.position !== null);
  const unranked = items.filter((item) => item.position === null);
  const scores = computeScores(ranked.map((item) => item.manual_rating));
  return [
    ...ranked.map((item, index) => ({
      ...item,
      rating: scores[index] ?? null,
      updated_at: nowIso,
    })),
    ...unranked,
  ];
}

export function reconcileListItems(
  listId: string,
  serverItems: Item[],
  cachedItems: Item[],
  ops: SyncOp[]
): Item[] {
  const listOps = ops.filter(
    (op) =>
      op.listId === listId &&
      (op.kind === 'item.create' ||
        op.kind === 'item.update' ||
        op.kind === 'item.delete' ||
        op.kind === 'ranking.set')
  );
  if (listOps.length === 0) return serverItems;
  let items = [...serverItems];
  for (const op of listOps) {
    if (op.kind === 'item.create') {
      const normalized = normalizeItemName(op.name);
      if (
        items.some(
          (entry) =>
            entry.item_id === op.itemId ||
            normalizeItemName(entry.name) === normalized
        )
      ) {
        continue;
      }
      const created = cachedItems.find(
        (entry) => entry.item_id === op.itemId
      ) ?? {
        item_id: op.itemId,
        list_id: listId,
        name: op.name,
        description: op.description,
        image_url: null,
        rating: null,
        manual_rating: null,
        position: null,
        created_at: op.createdAt,
        updated_at: op.createdAt,
      };
      items = mergePendingItems(items, [created]);
      continue;
    }
    if (op.kind === 'item.update') {
      const previous = items.find((entry) => entry.item_id === op.itemId);
      if (!previous) continue;
      const updated: Item = {
        ...previous,
        ...(op.name !== undefined ? { name: op.name } : {}),
        ...(op.description !== undefined
          ? { description: op.description }
          : {}),
        ...(op.manualRating !== undefined
          ? { manual_rating: op.manualRating }
          : {}),
        updated_at: op.createdAt,
      };
      const next = items.map((entry) =>
        entry.item_id === op.itemId ? updated : entry
      );
      items =
        updated.position !== null &&
        (op.manualRating !== undefined ||
          previous.manual_rating !== updated.manual_rating)
          ? rescoreItems(next, op.createdAt)
          : next;
      continue;
    }
    if (op.kind === 'item.delete') {
      const removed = items.find((entry) => entry.item_id === op.itemId);
      if (!removed) continue;
      const remaining = items.filter((entry) => entry.item_id !== op.itemId);
      items =
        removed.position !== null
          ? rescoreItems(remaining, op.createdAt)
          : remaining;
      continue;
    }
    if (op.kind === 'ranking.set') {
      const target =
        items.find((entry) => entry.item_id === op.itemId) ??
        cachedItems.find((entry) => entry.item_id === op.itemId);
      if (!target) continue;
      const others = items.filter((entry) => entry.item_id !== op.itemId);
      const ranked = others.filter((entry) => entry.position !== null);
      const unranked = others.filter((entry) => entry.position === null);
      const clampedGap = Math.max(0, Math.min(op.gap, ranked.length));
      const index = ranked.length - clampedGap;
      items = rescoreItems(
        [
          ...ranked.slice(0, index),
          {
            ...target,
            position: target.position ?? 'pending',
            manual_rating: null,
            updated_at: op.createdAt,
          },
          ...ranked.slice(index),
          ...unranked,
        ],
        op.createdAt
      );
    }
  }
  return items;
}

export function reconcileLists(
  serverLists: ListSimple[],
  cachedLists: ListSimple[],
  ops: SyncOp[]
): ListSimple[] {
  if (ops.length === 0) return sortListsByRecency(serverLists);
  let lists = [...serverLists];
  for (const op of ops) {
    if (op.kind === 'list.create') {
      if (lists.some((entry) => entry.list_id === op.listId)) continue;
      const created = cachedLists.find(
        (entry) => entry.list_id === op.listId
      ) ?? {
        list_id: op.listId,
        title: op.list.title,
        description: op.list.description ?? null,
        color: op.list.color ?? null,
        icon: op.list.icon ?? null,
        cover: op.list.cover ?? null,
        cover_photo: null,
        ranking_mode: op.list.ranking_mode ?? 'score',
        created_at: op.createdAt,
        updated_at: op.createdAt,
        item_count: 0,
      };
      lists = [...lists, created];
      continue;
    }
    if (op.kind === 'list.delete') {
      lists = lists.filter((entry) => entry.list_id !== op.listId);
      continue;
    }
    if (op.kind === 'list.update') {
      const target = lists.find((entry) => entry.list_id === op.listId);
      if (!target) continue;
      const { cover_photo: coverSelection, ...restMetadata } = op.metadata;
      const nextCoverPhoto =
        coverSelection === undefined
          ? target.cover_photo
          : coverSelection === null
            ? null
            : (cachedLists.find((entry) => entry.list_id === op.listId)
                ?.cover_photo ?? target.cover_photo);
      const updated: ListSimple = {
        ...target,
        ...restMetadata,
        cover_photo: nextCoverPhoto,
        updated_at:
          Date.parse(op.createdAt) > Date.parse(target.updated_at)
            ? op.createdAt
            : target.updated_at,
      };
      lists = lists.map((entry) =>
        entry.list_id === op.listId ? updated : entry
      );
      continue;
    }
    if (
      op.kind === 'item.create' ||
      op.kind === 'item.update' ||
      op.kind === 'item.delete' ||
      op.kind === 'ranking.set'
    ) {
      const target = lists.find((entry) => entry.list_id === op.listId);
      if (!target) continue;
      const cached = cachedLists.find((entry) => entry.list_id === op.listId);
      const itemCount =
        (op.kind === 'item.create' || op.kind === 'item.delete') && cached
          ? cached.item_count
          : target.item_count;
      const updated: ListSimple = {
        ...target,
        item_count: itemCount,
        updated_at:
          Date.parse(op.createdAt) > Date.parse(target.updated_at)
            ? op.createdAt
            : target.updated_at,
      };
      lists = lists.map((entry) =>
        entry.list_id === op.listId ? updated : entry
      );
    }
  }
  return sortListsByRecency(lists);
}

export function reconcileListMetadata(
  list: ListMetadata,
  cachedLists: ListSimple[],
  ops: SyncOp[]
): ListMetadata {
  const listOps = ops.filter((op) => op.listId === list.list_id);
  if (listOps.length === 0) return list;
  const reconciled = reconcileLists(
    [{ ...list, item_count: 0 }],
    cachedLists,
    listOps
  )[0];
  if (!reconciled) return list;
  const { item_count: _ignored, ...metadata } = reconciled;
  return metadata;
}

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
      const existing = await readItems(userId, listId);
      const previous = existing.find((entry) => entry.item_id === item.item_id);
      const next = existing.map((entry) =>
        entry.item_id === item.item_id ? item : entry
      );
      const items =
        item.position !== null && previous?.manual_rating !== item.manual_rating
          ? rescoreItems(next, item.updated_at)
          : next;
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
          ? rescoreItems(remaining, nowIso)
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
      const next = rescoreItems(
        [
          ...ranked.slice(0, index),
          {
            ...item,
            position: 'pending',
            manual_rating: null,
            updated_at: nowIso,
          },
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
