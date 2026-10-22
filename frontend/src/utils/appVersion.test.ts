import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  claimAutoReload,
  parseBuildId,
  readServedBuildId,
  shouldReload,
} from './appVersion.ts';

const fakeStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
};

const fakeFetch = (response: unknown) =>
  (async () => response) as unknown as typeof fetch;

test('parseBuildId accepts only a non-empty string buildId', () => {
  assert.equal(parseBuildId('{"buildId":"abc"}'), 'abc');
  assert.equal(parseBuildId('{"buildId":""}'), null);
  assert.equal(parseBuildId('{"buildId":7}'), null);
  assert.equal(parseBuildId('{}'), null);
  assert.equal(parseBuildId('<html></html>'), null);
  assert.equal(parseBuildId('null'), null);
});

test('shouldReload needs two different non-empty ids', () => {
  assert.equal(shouldReload('a', 'b'), true);
  assert.equal(shouldReload('a', 'a'), false);
  assert.equal(shouldReload('a', null), false);
  assert.equal(shouldReload('', 'b'), false);
});

test('claimAutoReload allows each served build id once', () => {
  const storage = fakeStorage();
  assert.equal(claimAutoReload('b', storage), true);
  assert.equal(claimAutoReload('b', storage), false);
  assert.equal(claimAutoReload('c', storage), true);

  const throwing = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {},
  };
  assert.equal(claimAutoReload('b', throwing), false);
});

test('readServedBuildId degrades to null and bypasses the cache', async () => {
  const seen: unknown[] = [];
  const ok = (async (url: string, init?: RequestInit) => {
    seen.push([url, init]);
    return { ok: true, text: async () => '{"buildId":"b"}' };
  }) as unknown as typeof fetch;
  assert.equal(await readServedBuildId({ fetchImpl: ok }), 'b');
  assert.deepEqual(seen, [['/version.json', { cache: 'no-store' }]]);

  assert.equal(
    await readServedBuildId({ fetchImpl: fakeFetch({ ok: false }) }),
    null
  );
  assert.equal(
    await readServedBuildId({
      fetchImpl: (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
    }),
    null
  );
});
