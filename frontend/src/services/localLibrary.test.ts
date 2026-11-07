import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Item } from './itemsService.ts';
import {
  listItemsCacheKey,
  listsCacheKey,
  parseCachedListItems,
  parseCachedLists,
} from './listsCache.ts';
import type { ListSimple } from './listsService.ts';
import { createLocalLibrary, type LocalCacheStorage } from './localLibrary.ts';

const USER = 'user-1';
const LIST = 'list-1';

const memoryStorage = (): LocalCacheStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => {
      map.set(key, value);
    },
    removeItem: async (key) => {
      map.delete(key);
    },
  };
};

const listSummary = (overrides: Partial<ListSimple> = {}): ListSimple => ({
  list_id: LIST,
  title: 'Ranked',
  description: null,
  color: null,
  icon: null,
  cover: null,
  cover_photo: null,
  ranking_mode: 'score',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  item_count: 0,
  ...overrides,
});

const item = (
  itemId: string,
  position: string | null,
  rating: number | null
): Item => ({
  item_id: itemId,
  list_id: LIST,
  name: itemId,
  description: null,
  image_url: null,
  position,
  rating,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
});

const seed = async (
  storage: ReturnType<typeof memoryStorage>,
  items: Item[],
  summary: ListSimple = listSummary()
) => {
  await storage.setItem(listsCacheKey(USER), JSON.stringify([summary]));
  await storage.setItem(listItemsCacheKey(USER, LIST), JSON.stringify(items));
};

const readItems = async (storage: ReturnType<typeof memoryStorage>) =>
  parseCachedListItems(
    await storage.getItem(listItemsCacheKey(USER, LIST)),
    LIST
  ) ?? [];

const readSummary = async (storage: ReturnType<typeof memoryStorage>) =>
  parseCachedLists(await storage.getItem(listsCacheKey(USER)))?.[0] ?? null;

test('creating a list seeds its item cache and summary', async () => {
  const storage = memoryStorage();
  const library = createLocalLibrary(storage);

  await library.applyLocalListCreate(USER, listSummary({ title: 'Fresh' }));

  assert.deepEqual(await readItems(storage), []);
  assert.equal((await readSummary(storage))?.title, 'Fresh');
});

test('updating a list merges metadata and keeps the item count', async () => {
  const storage = memoryStorage();
  const library = createLocalLibrary(storage);
  await seed(storage, [item('a', 'a0', 10)], listSummary({ item_count: 1 }));

  await library.applyLocalListUpdate(
    USER,
    LIST,
    { title: 'Renamed', icon: 'heart' },
    '2026-02-01T00:00:00.000Z'
  );

  const summary = await readSummary(storage);
  assert.equal(summary?.title, 'Renamed');
  assert.equal(summary?.icon, 'heart');
  assert.equal(summary?.item_count, 1);
  assert.equal(summary?.updated_at, '2026-02-01T00:00:00.000Z');
});

test('deleting a list removes its summary and items', async () => {
  const storage = memoryStorage();
  const library = createLocalLibrary(storage);
  await seed(storage, [item('a', 'a0', 10)]);

  await library.applyLocalListDelete(USER, LIST);

  assert.equal(await readSummary(storage), null);
  assert.equal(storage.map.has(listItemsCacheKey(USER, LIST)), false);
});

test('creating an item appends it and bumps the count', async () => {
  const storage = memoryStorage();
  const library = createLocalLibrary(storage);
  await seed(storage, [item('a', 'a0', 10)]);

  await library.applyLocalItemCreate(USER, LIST, item('b', null, null));

  const items = await readItems(storage);
  assert.deepEqual(
    items.map((entry) => entry.item_id),
    ['a', 'b']
  );
  const summary = await readSummary(storage);
  assert.equal(summary?.item_count, 2);
  assert.equal(summary?.updated_at, items[1]?.updated_at);
});

test('deleting a ranked item rescores the survivors', async () => {
  const storage = memoryStorage();
  const library = createLocalLibrary(storage);
  const ranked = [
    item('a', 'a5', 10),
    item('b', 'a4', 8),
    item('c', 'a3', 6),
    item('d', 'a2', 4),
    item('e', 'a1', 2),
    item('f', 'a0', 0),
  ];
  await seed(storage, ranked);

  await library.applyLocalItemDelete(USER, LIST, 'c');

  assert.deepEqual(
    (await readItems(storage)).map((entry) => entry.rating),
    [10, 7.5, 5, 2.5, 0]
  );
  assert.deepEqual(
    (await readItems(storage)).map((entry) => entry.item_id),
    ['a', 'b', 'd', 'e', 'f']
  );
});

test('deleting an unranked item leaves the scores alone', async () => {
  const storage = memoryStorage();
  const library = createLocalLibrary(storage);
  await seed(storage, [item('a', 'a0', 10), item('b', null, null)]);

  await library.applyLocalItemDelete(USER, LIST, 'b');

  assert.deepEqual(
    (await readItems(storage)).map((entry) => entry.rating),
    [10]
  );
});

test('ranking inserts at the index and rescores every ranked item', async () => {
  const storage = memoryStorage();
  const library = createLocalLibrary(storage);
  const ranked = [
    item('a', 'a6', 10),
    item('b', 'a5', 8),
    item('c', 'a4', 6),
    item('d', 'a3', 4),
    item('e', 'a2', 2),
    item('f', 'a1', 0),
  ];
  await seed(storage, ranked);

  await library.applyLocalRanking(USER, LIST, item('mover', null, null), 2);

  const items = await readItems(storage);
  assert.deepEqual(
    items.map((entry) => entry.item_id),
    ['a', 'b', 'mover', 'c', 'd', 'e', 'f']
  );
  assert.deepEqual(
    items.map((entry) => entry.rating),
    [10, 8.3, 6.7, 5, 3.3, 1.7, 0]
  );
  assert.equal(items[2]?.position, 'pending');
});

test('unranked items stay last after a ranking', async () => {
  const storage = memoryStorage();
  const library = createLocalLibrary(storage);
  await seed(storage, [
    item('a', 'a1', 10),
    item('b', 'a0', 0),
    item('loose', null, null),
  ]);

  await library.applyLocalRanking(USER, LIST, item('mover', null, null), 1);

  assert.deepEqual(
    (await readItems(storage)).map((entry) => entry.item_id),
    ['a', 'mover', 'b', 'loose']
  );
});
