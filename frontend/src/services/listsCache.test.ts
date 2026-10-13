import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listsCacheKey, parseCachedLists } from './listsCache.ts';
import type { ListSimple } from './listsService.ts';

const listSimple: ListSimple = {
  list_id: 'list-1',
  title: 'Cache proof',
  description: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  item_count: 2,
};

test('keys the cache per user id', () => {
  assert.equal(listsCacheKey('user-1'), 'cachedLists:user-1');
  assert.notEqual(listsCacheKey('user-1'), listsCacheKey('user-2'));
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
