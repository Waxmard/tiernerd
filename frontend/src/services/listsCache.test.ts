import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Item } from './itemsService.ts';
import {
  acceptLiveItems,
  acceptLiveMetadata,
  bumpLifecycleMutation,
  canAcceptItemsResponse,
  canAcceptMetadataResponse,
  canApplyCachedItems,
  canApplyCachedMetadata,
  canApplyHydration,
  canWriteCachedItems,
  createListDetailLifecycle,
  deactivateLifecycle,
  enqueueListCacheWrite,
  evictLifecycleList,
  invalidateLifecycleReads,
  isCacheCurrent,
  isLifecycleActive,
  isLifecycleReadable,
  listItemsCacheKey,
  parseCachedListItems,
  parseCachedLists,
  startHydrationRequest,
  startItemsRequest,
} from './listsCache.ts';
import type { ListSimple } from './listsService.ts';

const listSimple: ListSimple = {
  list_id: 'list-1',
  title: 'Cache proof',
  description: null,
  color: null,
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
  rating: 8.5,
  position: '1',
  tier_set: 'good',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  ...overrides,
});

test('keys item snapshots by user and list', () => {
  assert.notEqual(
    listItemsCacheKey('user-1', 'list-1'),
    listItemsCacheKey('user-2', 'list-1')
  );
  assert.notEqual(
    listItemsCacheKey('user-1', 'list-1'),
    listItemsCacheKey('user-1', 'list-2')
  );
});

test('round-trips ordered ranked and unranked items unchanged', () => {
  const items = [
    item(),
    item({
      item_id: 'item-2',
      name: 'Second',
      rating: null,
      position: null,
      tier_set: null,
    }),
  ];
  assert.deepEqual(
    parseCachedListItems(JSON.stringify(items), 'list-1'),
    items
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
        'tier_set',
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
    { ...item(), position: 1 },
    { ...item(), rating: '8.5' },
    { ...item(), rating: false },
    { ...item(), tier_set: 'excellent' },
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

test('round-trips a stored payload', () => {
  assert.deepEqual(parseCachedLists(JSON.stringify([listSimple])), [
    listSimple,
  ]);
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
});
test('account switching drops in-flight reads and hydration for the previous account', () => {
  const lifecycleA = createListDetailLifecycle({
    identity: JSON.stringify(['user-a', 'token-a', 'list-1']),
    userId: 'user-a',
    token: 'token-a',
    listId: 'list-1',
    routeTitle: 'Account A List',
  });
  const requestId = startItemsRequest(lifecycleA);
  const { hydrationId, version } = startHydrationRequest(lifecycleA);
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
  assert.equal(
    canApplyCachedItems(lifecycleA, hydrationId, version, lifecycleB),
    false
  );
  assert.equal(
    canApplyCachedMetadata(lifecycleA, hydrationId, version, lifecycleB),
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
  const requestId = startItemsRequest(lifecycle);
  const { hydrationId, version } = startHydrationRequest(lifecycle);
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
  assert.equal(canApplyCachedItems(lifecycle, hydrationId, version), false);
  assert.equal(canApplyCachedMetadata(lifecycle, hydrationId, version), false);
});

test('definitive read error invalidation drops in-flight responses and hydration', () => {
  const lifecycle = createListDetailLifecycle({
    identity: JSON.stringify(['user-1', 'token-1', 'list-1']),
    userId: 'user-1',
    token: 'token-1',
    listId: 'list-1',
    routeTitle: 'My List',
  });
  const requestId = startItemsRequest(lifecycle);
  const { hydrationId, version } = startHydrationRequest(lifecycle);

  const invalidatedVersion = invalidateLifecycleReads(lifecycle);

  assert.equal(canAcceptItemsResponse(lifecycle, requestId), false);
  assert.equal(canApplyHydration(lifecycle, hydrationId, version), false);
  assert.equal(canWriteCachedItems(lifecycle, version, requestId), false);
  assert.equal(isCacheCurrent(lifecycle, version), false);
  assert.equal(isCacheCurrent(lifecycle, invalidatedVersion), true);
});

test('cached items cannot overwrite live data once live response is accepted', () => {
  const lifecycle = createListDetailLifecycle({
    identity: JSON.stringify(['user-1', 'token-1', 'list-1']),
    userId: 'user-1',
    token: 'token-1',
    listId: 'list-1',
    routeTitle: 'My List',
  });
  const { hydrationId, version } = startHydrationRequest(lifecycle);
  assert.equal(canApplyCachedItems(lifecycle, hydrationId, version), true);
  assert.equal(canApplyCachedMetadata(lifecycle, hydrationId, version), true);

  acceptLiveItems(lifecycle);
  assert.equal(canApplyCachedItems(lifecycle, hydrationId, version), false);
  assert.equal(canApplyCachedMetadata(lifecycle, hydrationId, version), true);

  acceptLiveMetadata(lifecycle);
  assert.equal(canApplyCachedMetadata(lifecycle, hydrationId, version), false);
});

test('mutation refresh invalidates cache version and clears live accepted flags', () => {
  const lifecycle = createListDetailLifecycle({
    identity: JSON.stringify(['user-1', 'token-1', 'list-1']),
    userId: 'user-1',
    token: 'token-1',
    listId: 'list-1',
    routeTitle: 'My List',
  });
  acceptLiveItems(lifecycle);
  assert.equal(lifecycle.itemsAcceptedLive, true);
  const initialVersion = lifecycle.cacheVersion;

  const nextVersion = bumpLifecycleMutation(lifecycle);
  assert.equal(lifecycle.itemsAcceptedLive, false);
  assert.notEqual(nextVersion, initialVersion);
  assert.equal(isCacheCurrent(lifecycle, initialVersion), false);
  assert.equal(isCacheCurrent(lifecycle, nextVersion), true);
});
