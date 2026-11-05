import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Item } from './itemsService.ts';
import type { ListPhoto } from './listCoversService.ts';
import {
  applyCachedMetadataState,
  bumpLifecycleMutation,
  canAcceptItemsResponse,
  canAcceptMetadataResponse,
  canApplyCachedItems,
  canApplyCachedMetadata,
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
  cover: null,
  cover_photo: null,
  ranking_mode: 'score',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  item_count: 2,
};

const uploadPhoto: ListPhoto = {
  source: 'upload',
  id: '25a83199-d68c-4583-900c-ea64d153a8ca',
};

const unsplashPhoto: ListPhoto = {
  source: 'unsplash',
  id: 'photo-id',
  url: 'https://images.unsplash.com/photo-id?fit=crop&w=1200',
  photographer_name: 'Photographer',
  photographer_url: 'https://www.unsplash.com/@photographer',
  photo_url: 'https://unsplash.com/photos/photo-id',
};

const item = (overrides: Partial<Item> = {}): Item => ({
  item_id: 'item-1',
  list_id: 'list-1',
  name: 'First',
  description: null,
  image_url: null,
  rating: 8.5,
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

test('normalizes legacy photos and preserves canonical cached photos', () => {
  const legacy: Record<string, unknown> = { ...listSimple };
  delete legacy.cover_photo;
  const lists = [
    listSimple,
    { ...listSimple, list_id: 'list-2', cover_photo: uploadPhoto },
    { ...listSimple, list_id: 'list-3', cover_photo: unsplashPhoto },
  ];

  assert.deepEqual(parseCachedLists(JSON.stringify([legacy])), [listSimple]);
  assert.deepEqual(parseCachedLists(JSON.stringify(lists)), lists);
});

test('rejects malformed or noncanonical cached photos', () => {
  const photos: unknown[] = [
    '',
    [],
    {},
    { source: 'local', uri: 'file:///private/photo.jpg' },
    { kind: 'local', uri: 'data:image/jpeg;base64,AAAA' },
    { ...uploadPhoto, id: 'not-a-uuid' },
    { ...uploadPhoto, id: `${uploadPhoto.id}\n` },
    { ...uploadPhoto, url: 'https://example.com/private.jpg' },
    { ...uploadPhoto, uri: 'file:///private/photo.jpg' },
    { source: 'unsplash', id: 'photo-id' },
    { ...unsplashPhoto, id: '' },
    { ...unsplashPhoto, id: 'a/b' },
    { ...unsplashPhoto, id: 'photo-id\n' },
    { ...unsplashPhoto, id: 'a'.repeat(101) },
    { ...unsplashPhoto, photographer_name: '  ' },
    { ...unsplashPhoto, photographer_name: null },
    { ...unsplashPhoto, url: 'data:image/jpeg;base64,AAAA' },
    { ...unsplashPhoto, url: 'http://images.unsplash.com/photo-id' },
    { ...unsplashPhoto, url: 'https://images.unsplash.com.evil.test/photo-id' },
    { ...unsplashPhoto, url: 'https://attacker@images.unsplash.com/photo-id' },
    { ...unsplashPhoto, url: 'https://images.unsplash.com:443/photo-id' },
    { ...unsplashPhoto, url: 'https://images.unsplash.com/photo id' },
    { ...unsplashPhoto, url: 'https://images.unsplash.com/photo\nid' },
    { ...unsplashPhoto, url: 'https://images.unsplash.com' },
    { ...unsplashPhoto, photographer_url: 'https://example.com/person' },
    { ...unsplashPhoto, photographer_url: 'https://unsplash.com.evil.test/p' },
    { ...unsplashPhoto, photo_url: 'file:///private/photo.jpg' },
    { ...unsplashPhoto, thumbnail_url: 'https://images.unsplash.com/photo-id' },
  ];
  for (const photo of photos) {
    assert.equal(
      parseCachedLists(JSON.stringify([{ ...listSimple, cover_photo: photo }])),
      null
    );
  }
  assert.equal(
    parseCachedLists(
      JSON.stringify([
        { ...listSimple, cover: 'landscape', cover_photo: uploadPhoto },
      ])
    ),
    null
  );
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

test('preserves both cached ranking modes', () => {
  const lists: ListSimple[] = [
    listSimple,
    { ...listSimple, list_id: 'list-2', ranking_mode: 'rank' },
  ];

  assert.deepEqual(parseCachedLists(JSON.stringify(lists)), lists);
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
    cover: 'landscape',
    rankingMode: 'rank',
  });
  assert.equal(restored.rankingMode, 'rank');
  assert.equal(restored.listIcon, 'coffee');
  assert.equal(restored.listCover, 'landscape');
  assert.equal(restored.metadataLoaded, false);
  assert.equal(
    createInvalidatedReadState(restored, 'List', 'Read failed').rankingMode,
    'score'
  );
});

test('restores and clears cached cover photo metadata', () => {
  const initial = createListDetailState('identity', 'List');
  assert.equal(initial.listCoverPhoto, null);

  const metadata = {
    title: 'Cached list',
    description: null,
    color: null,
    rankingMode: 'score' as const,
  };
  const restored = applyCachedMetadataState(initial, {
    ...metadata,
    coverPhoto: unsplashPhoto,
  });
  assert.deepEqual(restored.listCoverPhoto, unsplashPhoto);
  assert.equal(restored.metadataLoaded, false);
  assert.equal(
    applyCachedMetadataState(restored, metadata).listCoverPhoto,
    null
  );
  assert.equal(
    createInvalidatedReadState(restored, 'List', 'Read failed').listCoverPhoto,
    null
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
          cover: 'landscape',
        },
      ])
    ),
    [
      {
        ...listSimple,
        color: 'violet',
        icon: 'mountain',
        cover: 'landscape',
      },
    ]
  );

  const legacyNoIconOrCover: Record<string, unknown> = { ...listSimple };
  delete legacyNoIconOrCover.icon;
  delete legacyNoIconOrCover.cover;
  assert.deepEqual(parseCachedLists(JSON.stringify([legacyNoIconOrCover])), [
    listSimple,
  ]);

  assert.equal(
    parseCachedLists(JSON.stringify([{ ...listSimple, icon: 'rocket' }])),
    null
  );
  assert.equal(
    parseCachedLists(JSON.stringify([{ ...listSimple, cover: 'photo' }])),
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

test('cached items cannot overwrite live data once live response is accepted', () => {
  const lifecycle = createListDetailLifecycle({
    identity: JSON.stringify(['user-1', 'token-1', 'list-1']),
    userId: 'user-1',
    token: 'token-1',
    listId: 'list-1',
    routeTitle: 'My List',
  });
  const hydrationId = ++lifecycle.hydrationRequest;
  const version = lifecycle.cacheVersion;
  assert.equal(canApplyCachedItems(lifecycle, hydrationId, version), true);
  assert.equal(canApplyCachedMetadata(lifecycle, hydrationId, version), true);

  lifecycle.itemsAcceptedLive = true;
  assert.equal(canApplyCachedItems(lifecycle, hydrationId, version), false);
  assert.equal(canApplyCachedMetadata(lifecycle, hydrationId, version), true);

  lifecycle.metadataAcceptedLive = true;
  assert.equal(canApplyCachedMetadata(lifecycle, hydrationId, version), false);
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
