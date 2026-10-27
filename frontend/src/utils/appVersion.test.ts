import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  blockAppUpdate,
  claimAutoReload,
  createAppUpdateChecker,
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

function updateFixture(
  readBuildId: () => Promise<string | null> = async () => 'new'
) {
  let visible = true;
  const storage = fakeStorage();
  const claims: string[] = [];
  const reloads: string[] = [];
  const checker = createAppUpdateChecker({
    runningBuildId: 'old',
    isVisible: () => visible,
    readBuildId,
    claimReload: (served) => {
      claims.push(served);
      return claimAutoReload(served, storage);
    },
    reload: (served) => reloads.push(served),
  });
  return {
    checker,
    claims,
    reloads,
    setVisible: (value: boolean) => {
      visible = value;
    },
  };
}

test('an update reloads immediately without an editor', async (t) => {
  const { checker, claims, reloads } = updateFixture();
  t.after(checker.dispose);
  await checker.probe(false);
  assert.deepEqual(claims, ['new']);
  assert.deepEqual(reloads, ['new']);
});

test('overlap and editor handoffs defer reloads', async (t) => {
  const { checker, claims, reloads } = updateFixture();
  t.after(checker.dispose);
  const first = blockAppUpdate();
  const second = blockAppUpdate();
  t.after(first);
  t.after(second);

  await checker.probe(false);
  assert.deepEqual(claims, []);
  assert.deepEqual(reloads, []);
  first();
  await Promise.resolve();
  assert.deepEqual(claims, []);

  second();
  const replacement = blockAppUpdate();
  t.after(replacement);
  await Promise.resolve();
  assert.deepEqual(claims, []);
  replacement();
  await Promise.resolve();
  assert.deepEqual(claims, ['new']);
  assert.deepEqual(reloads, ['new']);
  first();
  second();
  replacement();
  await Promise.resolve();
  assert.deepEqual(reloads, ['new']);
});

test('a hidden tab waits until visible without being throttled', async (t) => {
  let reads = 0;
  const { checker, claims, reloads, setVisible } = updateFixture(async () => {
    reads += 1;
    return 'new';
  });
  t.after(checker.dispose);
  const release = blockAppUpdate();
  t.after(release);

  await checker.probe(true);
  setVisible(false);
  release();
  await Promise.resolve();
  assert.deepEqual(claims, []);
  assert.deepEqual(reloads, []);

  setVisible(true);
  await checker.probe(true);
  assert.equal(reads, 1);
  assert.deepEqual(claims, ['new']);
  assert.deepEqual(reloads, ['new']);
});

test('a hidden in-flight probe waits for visibility', async (t) => {
  const read = Promise.withResolvers<string | null>();
  const { checker, claims, reloads, setVisible } = updateFixture(
    () => read.promise
  );
  t.after(checker.dispose);
  const probe = checker.probe(false);
  setVisible(false);
  read.resolve('new');
  await probe;
  assert.deepEqual(claims, []);
  setVisible(true);
  await checker.probe(true);
  assert.deepEqual(reloads, ['new']);
});

test('an editor opened during a probe still blocks its result', async (t) => {
  const read = Promise.withResolvers<string | null>();
  const { checker, claims, reloads } = updateFixture(() => read.promise);
  t.after(checker.dispose);
  const probe = checker.probe(false);
  const release = blockAppUpdate();
  t.after(release);

  read.resolve('new');
  await probe;
  assert.deepEqual(claims, []);
  release();
  await Promise.resolve();
  assert.deepEqual(reloads, ['new']);
});

test('a probe finishing after an editor closes can reload', async (t) => {
  const read = Promise.withResolvers<string | null>();
  const { checker, claims, reloads } = updateFixture(() => read.promise);
  t.after(checker.dispose);
  const release = blockAppUpdate();
  t.after(release);
  const probe = checker.probe(false);
  release();
  await Promise.resolve();
  assert.deepEqual(claims, []);
  read.resolve('new');
  await probe;
  assert.deepEqual(reloads, ['new']);
});

test('disposal cancels an in-flight probe', async (t) => {
  const read = Promise.withResolvers<string | null>();
  const { checker, claims, reloads } = updateFixture(() => read.promise);
  const release = blockAppUpdate();
  t.after(release);
  const probe = checker.probe(false);
  checker.dispose();
  release();
  read.resolve('new');
  await probe;
  await Promise.resolve();
  assert.deepEqual(claims, []);
  assert.deepEqual(reloads, []);
});

test('pending updates survive an offline probe', async (t) => {
  let served: string | null = 'new';
  const { checker, claims, reloads } = updateFixture(async () => served);
  t.after(checker.dispose);
  const release = blockAppUpdate();
  t.after(release);
  await checker.probe(false);
  served = null;
  await checker.probe(false);
  assert.deepEqual(claims, []);
  release();
  await Promise.resolve();
  assert.deepEqual(reloads, ['new']);
});

test('disposal cancels a queued editor-release reload', async (t) => {
  const { checker, claims, reloads } = updateFixture();
  const release = blockAppUpdate();
  t.after(release);
  await checker.probe(false);
  release();
  checker.dispose();
  await Promise.resolve();
  assert.deepEqual(claims, []);
  assert.deepEqual(reloads, []);
});

test('pending updates use the latest detected build', async (t) => {
  let served = 'new';
  const { checker, reloads } = updateFixture(async () => served);
  t.after(checker.dispose);
  const release = blockAppUpdate();
  t.after(release);
  await checker.probe(false);
  served = 'newer';
  await checker.probe(false);
  release();
  await Promise.resolve();
  assert.deepEqual(reloads, ['newer']);
});

test('a rollback to the running build cancels a pending update', async (t) => {
  let served = 'new';
  const { checker, claims, reloads } = updateFixture(async () => served);
  t.after(checker.dispose);
  const release = blockAppUpdate();
  t.after(release);
  await checker.probe(false);
  served = 'old';
  await checker.probe(false);
  release();
  await Promise.resolve();
  assert.deepEqual(claims, []);
  assert.deepEqual(reloads, []);
});
