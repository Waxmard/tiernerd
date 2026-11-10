import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Item } from './itemsService.ts';
import {
  applyCachedMetadataState,
  bumpLifecycleMutation,
  canAcceptItemsResponse,
  canAcceptMetadataResponse,
  canApplyHydration,
  canWriteCachedItems,
  canWriteCachedSummary,
  createInvalidatedReadState,
  createListDetailLifecycle,
  createListDetailState,
  deactivateLifecycle,
  enqueueListCacheWrite,
  evictLifecycleList,
  invalidateLifecycleReads,
  isCacheCurrent,
  isLifecycleActive,
  isLifecycleReadable,
  listItemsCacheKey,
  listsCacheKey,
  mergePendingItems,
  parseCachedListItems,
  parseCachedLists,
  sortListsByRecency,
} from './listsCache.ts';
import type { ListSimple } from './listsService.ts';

const listSimple: ListSimple = {
  list_id: 'list-1',
  title: 'Cache proof',
  description: null,
  color: null,
  icon: null,
  ranking_mode: 'score',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  item_count: 2,
};

const item = (overrides: Partial<Item> = {}): Item => ({
  item_id: 'item-1',
  list_id: 'list-1',
  name: 'First',
  description: null,
  image_url: null,
  icon: null,
  rating: 8.5,
  manual_rating: null,
  position: '1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  ...overrides,
});

test('keys list snapshots by user and list', () => {
  assert.equal(
    listItemsCacheKey('user-1', 'list-1'),
    'cachedListItems:v2:user-1:list-1'
  );
  assert.notEqual(
    listItemsCacheKey('user-1', 'list-1'),
    listItemsCacheKey('user-2', 'list-1')
  );
  assert.notEqual(
    listItemsCacheKey('user-1', 'list-1'),
    listItemsCacheKey('user-1', 'list-2')
  );
  assert.equal(listsCacheKey('user-1'), 'cachedLists:user-1');
});

test('round-trips ordered ranked and unranked items unchanged', () => {
  const items = [
    item(),
    item({
      item_id: 'item-2',
      name: 'Second',
      rating: null,
      position: null,
    }),
  ];
  assert.deepEqual(
    parseCachedListItems(JSON.stringify(items), 'list-1'),
    items
  );
});

test('normalizes legacy cached items missing manual_rating and rejects invalid manual_rating', () => {
  const { manual_rating: _omitted, ...legacyRanked } = item({
    item_id: 'legacy-1',
    position: 'a0',
    rating: 6.5,
  });
  const parsed = parseCachedListItems(JSON.stringify([legacyRanked]), 'list-1');
  assert.equal(parsed?.[0]?.manual_rating, null);

  assert.equal(
    parseCachedListItems(
      JSON.stringify([
        item({ position: null, rating: null, manual_rating: 7.0 }),
      ]),
      'list-1'
    ),
    null
  );
  assert.equal(
    parseCachedListItems(
      JSON.stringify([item({ manual_rating: 10.5 })]),
      'list-1'
    ),
    null
  );
});

test('keeps an empty item snapshot distinct from a cache miss', () => {
  assert.deepEqual(parseCachedListItems('[]', 'list-1'), []);
  assert.equal(parseCachedListItems(null, 'list-1'), null);
  assert.equal(parseCachedListItems('', 'list-1'), null);
});

test('rejects malformed, foreign-list, missing, and invalid item fields', () => {
  const invalidItems: unknown[] = [
    null,
    { ...item(), list_id: 'another-list' },
    ...(
      [
        'item_id',
        'list_id',
        'name',
        'description',
        'image_url',
        'rating',
        'position',
        'created_at',
        'updated_at',
      ] as const
    ).map((field) => {
      const value = item();
      delete (value as unknown as Record<string, unknown>)[field];
      return value;
    }),
    { ...item(), item_id: null },
    { ...item(), name: 1 },
    { ...item(), created_at: null },
    { ...item(), updated_at: false },
    { ...item(), description: 1 },
    { ...item(), image_url: false },
    { ...item(), icon: 1 },
    { ...item(), position: 1 },
    { ...item(), rating: '8.5' },
    { ...item(), rating: false },
  ];
  assert.equal(parseCachedListItems('{', 'list-1'), null);
  assert.equal(
    parseCachedListItems(
      JSON.stringify([item()]).replace('"rating":8.5', '"rating":1e999'),
      'list-1'
    ),
    null
  );
  for (const invalid of invalidItems) {
    assert.equal(
      parseCachedListItems(JSON.stringify([invalid]), 'list-1'),
      null
    );
  }
});

test('orders delayed cache writes before a later invalidation', async () => {
  let stored: string | null = null;
  const deferredWrite = Promise.withResolvers<void>();
  const delayedWrite = enqueueListCacheWrite('delayed-key', () =>
    deferredWrite.promise.then(() => {
      stored = 'old snapshot';
    })
  );
  const invalidation = enqueueListCacheWrite('delayed-key', async () => {
    stored = null;
  });

  deferredWrite.resolve();
  await Promise.all([delayedWrite, invalidation]);
  assert.equal(stored, null);
});

test('continues a key queue after a failed operation', async () => {
  let stored: string | null = 'old snapshot';
  await assert.rejects(
    enqueueListCacheWrite('failed-key', async () => {
      throw new Error('storage failed');
    }),
    /storage failed/
  );
  await enqueueListCacheWrite('failed-key', async () => {
    stored = null;
  });
  assert.equal(stored, null);
});

test('rejects missing or malformed payloads', () => {
  const malformed = [
    null,
    '',
    '{',
    '{"a":1}',
    '[1]',
    '[{"title":"x"}]',
    '[null]',
  ];
  for (const raw of malformed) {
    assert.equal(parseCachedLists(raw), null, `expected null for ${raw}`);
  }
});

test('keeps an empty cached list distinct from no cache', () => {
  assert.deepEqual(parseCachedLists('[]'), []);
});

test('defaults only missing legacy ranking modes to score', () => {
  const legacy: Record<string, unknown> = { ...listSimple };
  delete legacy.ranking_mode;

  const ranked: ListSimple = {
    ...listSimple,
    list_id: 'list-2',
    ranking_mode: 'rank',
  };
  assert.deepEqual(parseCachedLists(JSON.stringify([legacy, ranked])), [
    listSimple,
    ranked,
  ]);
});

test('rejects cached summaries with invalid or null ranking modes', () => {
  for (const rankingMode of [null, '', 'other', 'Rank', false, 0, {}]) {
    assert.equal(
      parseCachedLists(
        JSON.stringify([
          listSimple,
          { ...listSimple, ranking_mode: rankingMode },
        ])
      ),
      null
    );
  }
});

test('applies cached ranking mode and resets it when metadata is invalidated', () => {
  const initial = createListDetailState('identity', 'List');
  assert.equal(initial.rankingMode, 'score');

  const restored = applyCachedMetadataState(initial, {
    title: 'Cached list',
    description: null,
    color: null,
    icon: 'coffee',
    rankingMode: 'rank',
  });
  assert.equal(restored.rankingMode, 'rank');
  assert.equal(restored.listIcon, 'coffee');
  assert.equal(restored.metadataLoaded, false);
  assert.equal(
    createInvalidatedReadState(restored, 'List', 'Read failed').rankingMode,
    'score'
  );
});

test('sorts cached and live lists by instant and then ID without mutating input', () => {
  const lists: ListSimple[] = [
    { ...listSimple, list_id: 'old', updated_at: '2026-01-01T00:00:00Z' },
    { ...listSimple, list_id: 'b', updated_at: '2026-01-02T01:00:00+01:00' },
    { ...listSimple, list_id: 'new', updated_at: '2026-01-03T00:00:00Z' },
    { ...listSimple, list_id: 'a', updated_at: '2026-01-01T19:00:00-05:00' },
  ];
  const sorted = sortListsByRecency(lists);
  assert.deepEqual(
    sorted.map((list) => list.list_id),
    ['new', 'a', 'b', 'old']
  );
  assert.deepEqual(
    lists.map((list) => list.list_id),
    ['old', 'b', 'new', 'a']
  );
  assert.notEqual(sorted, lists);
  assert.deepEqual(
    parseCachedLists(JSON.stringify(lists))?.map((list) => list.list_id),
    ['new', 'a', 'b', 'old']
  );
  assert.deepEqual(sortListsByRecency([]), []);
});

test('rejects cached lists with unparseable modification dates', () => {
  assert.equal(
    parseCachedLists(
      JSON.stringify([{ ...listSimple, updated_at: 'not a date' }])
    ),
    null
  );
  assert.equal(
    parseCachedLists(JSON.stringify([{ ...listSimple, updated_at: '' }])),
    null
  );
});

test('drops payloads whose color is missing or not a known swatch', () => {
  const withoutColor: Record<string, unknown> = { ...listSimple };
  delete withoutColor.color;

  assert.equal(parseCachedLists(JSON.stringify([withoutColor])), null);
  assert.equal(
    parseCachedLists(JSON.stringify([{ ...listSimple, color: 'chartreuse' }])),
    null
  );
  assert.deepEqual(
    parseCachedLists(JSON.stringify([{ ...listSimple, color: 'teal' }])),
    [{ ...listSimple, color: 'teal' }]
  );
  assert.deepEqual(
    parseCachedLists(
      JSON.stringify([
        {
          ...listSimple,
          color: 'violet',
          icon: 'mountain',
        },
      ])
    ),
    [
      {
        ...listSimple,
        color: 'violet',
        icon: 'mountain',
      },
    ]
  );

  const legacyNoIcon: Record<string, unknown> = { ...listSimple };
  delete legacyNoIcon.icon;
  assert.deepEqual(parseCachedLists(JSON.stringify([legacyNoIcon])), [
    listSimple,
  ]);

  assert.equal(
    parseCachedLists(JSON.stringify([{ ...listSimple, icon: 1 }])),
    null
  );
});
test('account switching drops in-flight reads and hydration for the previous account', () => {
  const lifecycleA = createListDetailLifecycle({
    identity: JSON.stringify(['user-a', 'token-a', 'list-1']),
    userId: 'user-a',
    token: 'token-a',
    listId: 'list-1',
    routeTitle: 'Account A List',
  });
  const requestId = ++lifecycleA.itemsRequest;
  const hydrationId = ++lifecycleA.hydrationRequest;
  const version = lifecycleA.cacheVersion;
  assert.equal(canAcceptItemsResponse(lifecycleA, requestId), true);
  assert.equal(canApplyHydration(lifecycleA, hydrationId, version), true);

  deactivateLifecycle(lifecycleA);
  const lifecycleB = createListDetailLifecycle({
    identity: JSON.stringify(['user-b', 'token-b', 'list-1']),
    userId: 'user-b',
    token: 'token-b',
    listId: 'list-1',
    routeTitle: 'Account B List',
  });

  assert.equal(isLifecycleActive(lifecycleA, lifecycleB), false);
  assert.equal(isLifecycleReadable(lifecycleA, lifecycleB), false);
  assert.equal(
    canAcceptItemsResponse(lifecycleA, requestId, lifecycleB),
    false
  );
  assert.equal(
    canWriteCachedItems(lifecycleA, 0, requestId, lifecycleB),
    false
  );
  assert.equal(
    canApplyHydration(lifecycleA, hydrationId, version, lifecycleB),
    false
  );
});

test('eviction drops in-flight reads and hydration so a deleted list cannot be repopulated', () => {
  const lifecycle = createListDetailLifecycle({
    identity: JSON.stringify(['user-1', 'token-1', 'list-1']),
    userId: 'user-1',
    token: 'token-1',
    listId: 'list-1',
    routeTitle: 'My List',
  });
  const requestId = ++lifecycle.itemsRequest;
  const hydrationId = ++lifecycle.hydrationRequest;
  const version = lifecycle.cacheVersion;
  const preEvictionVersion = lifecycle.cacheVersion;
  assert.equal(canApplyHydration(lifecycle, hydrationId, version), true);

  const evictionVersion = evictLifecycleList(lifecycle);
  assert.equal(lifecycle.deleted, true);
  assert.notEqual(evictionVersion, preEvictionVersion);

  assert.equal(isLifecycleReadable(lifecycle), false);
  assert.equal(canAcceptItemsResponse(lifecycle, requestId), false);
  assert.equal(canAcceptMetadataResponse(lifecycle, 1), false);
  assert.equal(
    canWriteCachedItems(lifecycle, preEvictionVersion, requestId),
    false
  );
  assert.equal(
    canWriteCachedItems(lifecycle, evictionVersion, requestId),
    false
  );
  assert.equal(canApplyHydration(lifecycle, hydrationId, version), false);
});

test('definitive read error invalidation drops in-flight responses and hydration', () => {
  const lifecycle = createListDetailLifecycle({
    identity: JSON.stringify(['user-1', 'token-1', 'list-1']),
    userId: 'user-1',
    token: 'token-1',
    listId: 'list-1',
    routeTitle: 'My List',
  });
  const requestId = ++lifecycle.itemsRequest;
  const hydrationId = ++lifecycle.hydrationRequest;
  const version = lifecycle.cacheVersion;

  const invalidatedVersion = invalidateLifecycleReads(lifecycle);

  assert.equal(canAcceptItemsResponse(lifecycle, requestId), false);
  assert.equal(canApplyHydration(lifecycle, hydrationId, version), false);
  assert.equal(canWriteCachedItems(lifecycle, version, requestId), false);
  assert.equal(isCacheCurrent(lifecycle, version), false);
  assert.equal(isCacheCurrent(lifecycle, invalidatedVersion), true);
});

test('metadata accepted before an item retry can produce a guarded summary', () => {
  const lifecycle = createListDetailLifecycle({
    identity: 'user-1:list-1',
    userId: 'user-1',
    token: 'token-1',
    listId: 'list-1',
    routeTitle: 'My List',
  });
  const version = lifecycle.cacheVersion;
  const metadataRequest = ++lifecycle.metadataRequest;
  lifecycle.metadataAcceptedLive = true;
  lifecycle.itemsRequest += 1;
  assert.equal(
    canWriteCachedSummary(lifecycle, version, metadataRequest),
    false
  );

  const retry = ++lifecycle.itemsRequest;
  lifecycle.itemsAcceptedLive = true;
  assert.equal(
    canWriteCachedSummary(lifecycle, version, metadataRequest, retry),
    true
  );
  lifecycle.itemsRequest += 1;
  assert.equal(
    canWriteCachedSummary(lifecycle, version, metadataRequest, retry),
    false
  );
  lifecycle.metadataRequest += 1;
  assert.equal(
    canWriteCachedSummary(lifecycle, version, metadataRequest),
    false
  );
  assert.equal(
    canWriteCachedSummary(
      lifecycle,
      version,
      undefined,
      undefined,
      createListDetailLifecycle({
        identity: 'other',
        userId: 'user-2',
        token: 'token-2',
        listId: 'list-1',
        routeTitle: 'Other',
      })
    ),
    false
  );
});

test('mode save rejects an older in-flight metadata response', () => {
  const lifecycle = createListDetailLifecycle({
    identity: JSON.stringify(['user-1', 'token-1', 'list-1']),
    userId: 'user-1',
    token: 'token-1',
    listId: 'list-1',
    routeTitle: 'My List',
  });
  const oldRequest = ++lifecycle.metadataRequest;
  const saveRequest = ++lifecycle.metadataRequest;

  assert.equal(canAcceptMetadataResponse(lifecycle, oldRequest), false);
  assert.equal(canAcceptMetadataResponse(lifecycle, saveRequest), true);
});

test('mutation refresh invalidates cache version and clears live accepted flags', () => {
  const lifecycle = createListDetailLifecycle({
    identity: JSON.stringify(['user-1', 'token-1', 'list-1']),
    userId: 'user-1',
    token: 'token-1',
    listId: 'list-1',
    routeTitle: 'My List',
  });
  lifecycle.itemsAcceptedLive = true;
  assert.equal(lifecycle.itemsAcceptedLive, true);
  const initialVersion = lifecycle.cacheVersion;

  const nextVersion = bumpLifecycleMutation(lifecycle);
  assert.equal(lifecycle.itemsAcceptedLive, false);
  assert.notEqual(nextVersion, initialVersion);
  assert.equal(isCacheCurrent(lifecycle, initialVersion), false);
  assert.equal(isCacheCurrent(lifecycle, nextVersion), true);
});

test('a pending create lands where its score places it, not at the end', () => {
  const ratings = [10, 8.9, 7.8, 6.7, 5.6, 4.4, 3.3, 2.2, 1.1, 0];
  const server = ratings.map((rating, index) =>
    item({ item_id: `server-${index}`, rating, position: `a${index}` })
  );
  const pending = item({
    item_id: 'pending-1',
    rating: 4,
    position: 'pending',
  });

  const merged = mergePendingItems(server, [pending]);

  assert.deepEqual(
    merged.map((entry) => entry.item_id),
    [
      'server-0',
      'server-1',
      'server-2',
      'server-3',
      'server-4',
      'server-5',
      'pending-1',
      'server-6',
      'server-7',
      'server-8',
      'server-9',
    ]
  );
});

test('pending creates that are unranked or unknown stay at the end', () => {
  const server = [item({ item_id: 'server-0', rating: 10 })];
  const merged = mergePendingItems(server, [
    item({ item_id: 'pending-ranked', rating: 4 }),
    item({ item_id: 'pending-unranked', rating: null, position: null }),
    item({ item_id: 'server-0', rating: 1 }),
  ]);

  assert.deepEqual(
    merged.map((entry) => entry.item_id),
    ['server-0', 'pending-ranked', 'pending-unranked']
  );
});
