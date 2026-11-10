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
import {
  createLocalLibrary,
  type LocalCacheStorage,
  reconcileListItems,
  reconcileListMetadata,
  reconcileLists,
} from './localLibrary.ts';
import type { SyncOp } from './syncQueue.ts';

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
  ranking_mode: 'score',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  item_count: 0,
  ...overrides,
});

const item = (
  itemId: string,
  position: string | null,
  rating: number | null,
  manualRating: number | null = null
): Item => ({
  item_id: itemId,
  list_id: LIST,
  name: itemId,
  description: null,
  image_url: null,
  icon: null,
  position,
  rating,
  manual_rating: manualRating,
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
    [8.5, 7.5, 6.5, 5.3, 3.8]
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
    [8.8, 8.0, 7.3, 6.5, 5.6, 4.6, 3.2]
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

test('updating manual_rating rescales neighbors and re-ranking clears moved item pin', async () => {
  const storage = memoryStorage();
  const library = createLocalLibrary(storage);
  await seed(storage, [
    item('a', 'a4', 8.5),
    item('b', 'a3', 7.5),
    item('c', 'a2', 6.5),
    item('d', 'a1', 5.3),
    item('e', 'a0', 3.8),
  ]);

  await library.applyLocalItemUpdate(USER, LIST, item('e', 'a0', 7.2, 7.2));
  assert.deepEqual(
    (await readItems(storage)).map((entry) => [
      entry.item_id,
      entry.rating,
      entry.manual_rating,
    ]),
    [
      ['a', 9.1, null],
      ['b', 8.6, null],
      ['c', 8.1, null],
      ['d', 7.7, null],
      ['e', 7.2, 7.2],
    ]
  );

  await library.applyLocalRanking(USER, LIST, item('e', 'a0', 7.2, 7.2), 0);
  assert.deepEqual(
    (await readItems(storage)).map((entry) => [
      entry.item_id,
      entry.rating,
      entry.manual_rating,
    ]),
    [
      ['e', 8.5, null],
      ['a', 7.5, null],
      ['b', 6.5, null],
      ['c', 5.3, null],
      ['d', 3.8, null],
    ]
  );
});

test('reconcileListItems and reconcileLists preserve pending item.delete and recency order', () => {
  const serverItems: Item[] = [
    item('a', 'a2', 10),
    item('b', 'a1', 5),
    item('c', 'a0', 0),
  ];
  const cachedItems: Item[] = [item('a', 'a2', 7.5), item('c', 'a0', 5.3)];
  const deleteOp: SyncOp = {
    id: 'op-del-b',
    createdAt: '2026-01-03T00:00:00.000Z',
    kind: 'item.delete',
    listId: LIST,
    itemId: 'b',
  };

  const reconciledItems = reconcileListItems(LIST, serverItems, cachedItems, [
    deleteOp,
  ]);
  assert.deepEqual(
    reconciledItems.map((entry) => [entry.item_id, entry.rating]),
    [
      ['a', 7.5],
      ['c', 5.3],
    ]
  );

  const serverLists: ListSimple[] = [
    listSummary({
      list_id: 'list-newer',
      title: 'Newer on server',
      updated_at: '2026-01-02T00:00:00.000Z',
      item_count: 4,
    }),
    listSummary({
      list_id: LIST,
      title: 'Edited locally',
      updated_at: '2026-01-01T00:00:00.000Z',
      item_count: 3,
    }),
  ];
  const cachedLists: ListSimple[] = [
    listSummary({
      list_id: LIST,
      title: 'Edited locally',
      updated_at: '2026-01-03T00:00:00.000Z',
      item_count: 2,
    }),
  ];

  const reconciledLists = reconcileLists(serverLists, cachedLists, [deleteOp]);
  assert.deepEqual(
    reconciledLists.map((entry) => [
      entry.list_id,
      entry.item_count,
      entry.updated_at,
    ]),
    [
      [LIST, 2, '2026-01-03T00:00:00.000Z'],
      ['list-newer', 4, '2026-01-02T00:00:00.000Z'],
    ]
  );
});

test('reconcileListItems, reconcileLists, and reconcileListMetadata apply pending update and ranking ops', () => {
  const serverItems: Item[] = [
    item('a', 'a1', 8.5),
    item('b', 'a0', 3.8),
    item('c', null, null),
  ];
  const ops: SyncOp[] = [
    {
      id: 'op-rank-c',
      createdAt: '2026-01-02T00:00:00.000Z',
      kind: 'ranking.set',
      listId: LIST,
      itemId: 'c',
      gap: 2,
    },
    {
      id: 'op-upd-b',
      createdAt: '2026-01-03T00:00:00.000Z',
      kind: 'item.update',
      listId: LIST,
      itemId: 'b',
      name: 'Beta Renamed',
      manualRating: 7.0,
    },
    {
      id: 'op-list-upd',
      createdAt: '2026-01-04T00:00:00.000Z',
      kind: 'list.update',
      listId: LIST,
      metadata: { title: 'Renamed List', ranking_mode: 'rank' },
    },
  ];

  const reconciledItems = reconcileListItems(LIST, serverItems, [], ops);
  assert.deepEqual(
    reconciledItems.map((entry) => [
      entry.item_id,
      entry.name,
      entry.rating,
      entry.manual_rating,
    ]),
    [
      ['c', 'c', 8.7, null],
      ['a', 'a', 7.8, null],
      ['b', 'Beta Renamed', 7.0, 7.0],
    ]
  );

  const serverList = listSummary({
    list_id: LIST,
    title: 'Original List',
    ranking_mode: 'score',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
  const otherList = listSummary({
    list_id: 'list-other',
    title: 'Other List',
    updated_at: '2026-01-03T12:00:00.000Z',
  });

  const reconciledLists = reconcileLists([otherList, serverList], [], ops);
  assert.deepEqual(
    reconciledLists.map((entry) => [
      entry.list_id,
      entry.title,
      entry.ranking_mode,
      entry.updated_at,
    ]),
    [
      [LIST, 'Renamed List', 'rank', '2026-01-04T00:00:00.000Z'],
      ['list-other', 'Other List', 'score', '2026-01-03T12:00:00.000Z'],
    ]
  );

  const { item_count: _ignored, ...serverMetadata } = serverList;
  const reconciledMeta = reconcileListMetadata(serverMetadata, [], ops);
  assert.equal(reconciledMeta.title, 'Renamed List');
  assert.equal(reconciledMeta.ranking_mode, 'rank');
  assert.equal(reconciledMeta.updated_at, '2026-01-04T00:00:00.000Z');
});

test('reconcileListItems and reconcileLists apply pending create and delete ops', () => {
  const serverItems: Item[] = [item('a', 'a1', 8.5), item('b', 'a0', 3.8)];
  const pendingCreate: SyncOp = {
    id: 'op-create-c',
    createdAt: '2026-01-05T00:00:00.000Z',
    kind: 'item.create',
    listId: LIST,
    itemId: 'c',
    name: 'Charlie',
    description: null,
  };

  const fromCache = reconcileListItems(
    LIST,
    serverItems,
    [item('c', null, null)],
    [pendingCreate]
  );
  assert.deepEqual(
    fromCache.map((entry) => [entry.item_id, entry.name, entry.rating]),
    [
      ['a', 'a', 8.5],
      ['b', 'b', 3.8],
      ['c', 'c', null],
    ]
  );

  const fromFallback = reconcileListItems(
    LIST,
    serverItems,
    [],
    [pendingCreate]
  );
  assert.deepEqual(
    fromFallback.map((entry) => [
      entry.item_id,
      entry.name,
      entry.list_id,
      entry.created_at,
    ]),
    [
      ['a', 'a', LIST, '2026-01-01T00:00:00.000Z'],
      ['b', 'b', LIST, '2026-01-01T00:00:00.000Z'],
      ['c', 'Charlie', LIST, '2026-01-05T00:00:00.000Z'],
    ]
  );

  const dedupedById = reconcileListItems(
    LIST,
    [...serverItems, item('c', null, null)],
    [item('c', null, null)],
    [pendingCreate]
  );
  assert.deepEqual(
    dedupedById.map((entry) => entry.item_id),
    ['a', 'b', 'c']
  );

  const dedupedByName = reconcileListItems(
    LIST,
    [...serverItems, { ...item('server-c', 'a2', 10), name: 'CHARLIE' }],
    [item('c', null, null)],
    [{ ...pendingCreate, itemId: 'other-c', name: '  charlie ' }]
  );
  assert.deepEqual(
    dedupedByName.map((entry) => entry.item_id),
    ['a', 'b', 'server-c']
  );

  const serverLists: ListSimple[] = [
    listSummary({
      list_id: LIST,
      item_count: 2,
      updated_at: '2026-01-01T00:00:00.000Z',
    }),
    listSummary({
      list_id: 'list-deleted',
      title: 'Deleted locally',
      updated_at: '2026-01-06T00:00:00.000Z',
    }),
  ];
  const pendingList: ListSimple = listSummary({
    list_id: 'list-pending',
    title: 'Pending list',
    item_count: 1,
    updated_at: '2026-01-02T00:00:00.000Z',
  });
  const createListOp: SyncOp = {
    id: 'op-list-create',
    createdAt: '2026-01-07T00:00:00.000Z',
    kind: 'list.create',
    listId: 'list-pending',
    list: {
      list_id: 'list-pending',
      title: 'Pending list',
      description: null,
      color: null,
      icon: null,
      ranking_mode: 'score',
    },
  };
  const createdListOp: SyncOp = {
    id: 'op-list-create-fallback',
    createdAt: '2026-01-07T00:00:00.000Z',
    kind: 'list.create',
    listId: 'list-fallback',
    list: {
      list_id: 'list-fallback',
      title: 'Fallback list',
      description: null,
      color: null,
      icon: null,
      ranking_mode: 'rank',
    },
  };
  const deleteListOp: SyncOp = {
    id: 'op-list-delete',
    createdAt: '2026-01-08T00:00:00.000Z',
    kind: 'list.delete',
    listId: 'list-deleted',
  };

  const fromCachedLists = reconcileLists(
    serverLists,
    [pendingList],
    [createListOp, deleteListOp]
  );
  assert.deepEqual(
    fromCachedLists.map((entry) => [
      entry.list_id,
      entry.title,
      entry.item_count,
    ]),
    [
      ['list-pending', 'Pending list', 1],
      [LIST, 'Ranked', 2],
    ]
  );

  const fromListFallback = reconcileLists(serverLists, [], [createdListOp]);
  assert.deepEqual(
    fromListFallback.map((entry) => [
      entry.list_id,
      entry.title,
      entry.ranking_mode,
      entry.item_count,
      entry.created_at,
    ]),
    [
      ['list-fallback', 'Fallback list', 'rank', 0, '2026-01-07T00:00:00.000Z'],
      [
        'list-deleted',
        'Deleted locally',
        'score',
        0,
        '2026-01-01T00:00:00.000Z',
      ],
      [LIST, 'Ranked', 'score', 2, '2026-01-01T00:00:00.000Z'],
    ]
  );

  const withItemCreate = reconcileLists(
    serverLists.slice(0, 1),
    [listSummary({ list_id: LIST, item_count: 3 })],
    [pendingCreate]
  );
  assert.deepEqual(
    withItemCreate.map((entry) => [
      entry.list_id,
      entry.item_count,
      entry.updated_at,
    ]),
    [[LIST, 3, '2026-01-05T00:00:00.000Z']]
  );
});
