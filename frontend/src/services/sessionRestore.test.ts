import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildListView,
  buildNavSnapshot,
  parseListView,
  parseNavSnapshot,
  RESTORE_TTL_MS,
} from './sessionRestore.ts';

const T = 1_000_000;

test('nav snapshot drops transient params and Login', () => {
  const raw = buildNavSnapshot(
    {
      routes: [
        { name: 'Login' },
        { name: 'Main' },
        {
          name: 'ListDetail',
          params: {
            listId: 'a',
            listTitle: 'A',
            promptAddItem: true,
            completedItemId: 'x',
          },
        },
      ],
    },
    T
  );
  assert.deepEqual(parseNavSnapshot(raw, T), {
    routes: [
      { name: 'Main' },
      { name: 'ListDetail', params: { listId: 'a', listTitle: 'A' } },
    ],
  });
});

test('nav snapshot expiry boundary', () => {
  const raw = buildNavSnapshot({ routes: [{ name: 'Main' }] }, T);
  assert.ok(parseNavSnapshot(raw, T + RESTORE_TTL_MS));
  assert.equal(parseNavSnapshot(raw, T + RESTORE_TTL_MS + 1), undefined);
});

test('nav snapshot rejects invalid shapes', () => {
  const mk = (routes: unknown) => JSON.stringify({ savedAt: T, routes });
  assert.equal(parseNavSnapshot(null, T), undefined);
  assert.equal(parseNavSnapshot('{bad', T), undefined);
  assert.equal(parseNavSnapshot(mk([{ name: 'Profile' }]), T), undefined);
  assert.equal(
    parseNavSnapshot(mk([{ name: 'Main' }, { name: 'Nope' }]), T),
    undefined
  );
  assert.equal(
    parseNavSnapshot(mk([{ name: 'Main' }, { name: 'ListDetail' }]), T),
    undefined
  );
  assert.equal(parseNavSnapshot(mk([]), T), undefined);
});

test('list view round-trip and rejections', () => {
  const raw = buildListView(
    { listId: 'a', selectedItemId: 'i', offset: 120 },
    T
  );
  assert.deepEqual(parseListView(raw, 'a', T), {
    selectedItemId: 'i',
    offset: 120,
  });
  assert.equal(parseListView(raw, 'b', T), null);
  assert.equal(parseListView(raw, 'a', T + RESTORE_TTL_MS + 1), null);
  assert.equal(parseListView('{bad', 'a', T), null);
  for (const offset of [-1, Number.NaN]) {
    const bad = buildListView({ listId: 'a', selectedItemId: null, offset }, T);
    assert.equal(parseListView(bad, 'a', T), null);
  }
});
