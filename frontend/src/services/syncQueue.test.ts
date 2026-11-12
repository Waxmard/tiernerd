import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, NetworkError } from './apiError.ts';
import {
  createSyncQueue,
  pendingOps,
  type SyncOp,
  type SyncStorage,
} from './syncQueue.ts';

const USER = 'user-1';
const NOW = '2026-01-01T00:00:00.000Z';

const memoryStorage = (): SyncStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => {
      map.set(key, value);
    },
  };
};

const itemCreate = (id: string, itemId: string, name = 'Alpha'): SyncOp => ({
  id,
  createdAt: NOW,
  kind: 'item.create',
  listId: 'list-1',
  itemId,
  name,
  description: null,
});

const itemDelete = (id: string, itemId: string): SyncOp => ({
  id,
  createdAt: NOW,
  kind: 'item.delete',
  listId: 'list-1',
  itemId,
});

const itemUpdate = (id: string, itemId: string, name?: string): SyncOp => ({
  id,
  createdAt: NOW,
  kind: 'item.update',
  listId: 'list-1',
  itemId,
  name,
});

const rankingSet = (id: string, itemId: string, gap: number): SyncOp => ({
  id,
  createdAt: NOW,
  kind: 'ranking.set',
  listId: 'list-1',
  itemId,
  gap,
});

const listDelete = (id: string, listId = 'list-1'): SyncOp => ({
  id,
  createdAt: NOW,
  kind: 'list.delete',
  listId,
});

const makeQueue = (
  applyOp: (op: SyncOp, token: string) => Promise<void>,
  token: string | null = 'token'
) => {
  const storage = memoryStorage();
  const queue = createSyncQueue({
    userId: USER,
    storage,
    applyOp,
    getToken: () => token,
  });
  return { queue, storage };
};

test('replays queued changes in FIFO order', async () => {
  const seen: string[] = [];
  const { queue } = makeQueue(async (op) => {
    seen.push(op.kind);
  });
  await queue.enqueue(itemCreate('1', 'a'));
  await queue.enqueue(rankingSet('2', 'a', 1));
  await queue.enqueue(itemDelete('3', 'b'));

  assert.equal(await queue.count(), 3);
  const outcome = await queue.flush();

  assert.deepEqual(seen, ['item.create', 'ranking.set', 'item.delete']);
  assert.equal(outcome.status, 'idle');
  assert.deepEqual(outcome.applied, ['1', '2', '3']);
  assert.equal(outcome.remaining, 0);
  assert.equal(await queue.count(), 0);
});

test('a network failure keeps the failing and later ops', async () => {
  const { queue } = makeQueue(async (op) => {
    if (op.id === '2') throw new NetworkError();
  });
  await queue.enqueue(itemCreate('1', 'a'));
  await queue.enqueue(itemCreate('2', 'b'));
  await queue.enqueue(itemCreate('3', 'c'));

  const outcome = await queue.flush();

  assert.equal(outcome.status, 'offline');
  assert.deepEqual(outcome.applied, ['1']);
  assert.equal(outcome.remaining, 2);
  assert.equal(await queue.count(), 2);
});

test('a server failure is treated as offline', async () => {
  const { queue } = makeQueue(async (op) => {
    if (op.id === '1') throw new ApiError(503, 'Service Unavailable');
  });
  await queue.enqueue(itemCreate('1', 'a'));
  await queue.enqueue(itemCreate('2', 'b'));

  const outcome = await queue.flush();

  assert.equal(outcome.status, 'offline');
  assert.equal(outcome.remaining, 2);
});

test('a missing token keeps everything and reports auth', async () => {
  const { queue } = makeQueue(async () => undefined, null);
  await queue.enqueue(itemCreate('1', 'a'));

  const outcome = await queue.flush();

  assert.equal(outcome.status, 'auth');
  assert.equal(outcome.remaining, 1);
  assert.equal(await queue.count(), 1);
});

test('a conflict drops the op with the server message and keeps replaying', async () => {
  const applied: string[] = [];
  const { queue } = makeQueue(async (op) => {
    if (op.id === '1')
      throw new ApiError(409, 'Conflict', { detail: 'Item ID already in use' });
    applied.push(op.id);
  });
  await queue.enqueue(itemCreate('1', 'a', 'Alpha'));
  await queue.enqueue(itemDelete('2', 'b'));

  const outcome = await queue.flush();

  assert.deepEqual(applied, ['2']);
  assert.deepEqual(outcome.dropped, [
    { opId: '1', message: 'Item ID already in use' },
  ]);
  assert.equal(outcome.status, 'idle');
  assert.equal(await queue.count(), 0);
});

test('a conflict without a server message falls back to generic text', async () => {
  const { queue } = makeQueue(async () => {
    throw new ApiError(409, 'Conflict');
  });
  await queue.enqueue(itemCreate('1', 'a', 'Alpha'));

  const outcome = await queue.flush();

  assert.deepEqual(outcome.dropped, [
    { opId: '1', message: "Couldn't save a pending change." },
  ]);
});

test('a missing delete target counts as success with no message', async () => {
  const { queue } = makeQueue(async () => {
    throw new ApiError(404, 'Not Found');
  });
  await queue.enqueue(itemDelete('1', 'a'));

  const outcome = await queue.flush();

  assert.deepEqual(outcome.applied, ['1']);
  assert.deepEqual(outcome.dropped, []);
  assert.equal(await queue.count(), 0);
});

test('a missing update target is dropped with the deleted message', async () => {
  const { queue } = makeQueue(async () => {
    throw new ApiError(404, 'Not Found', { detail: 'Item not found' });
  });
  await queue.enqueue(itemUpdate('1', 'a', 'Renamed'));

  const outcome = await queue.flush();

  assert.deepEqual(outcome.applied, ['1']);
  assert.deepEqual(outcome.dropped, [
    {
      opId: '1',
      message:
        'An item you edited was deleted on another device. Your edit was discarded.',
    },
  ]);
});

test('an update folds into the pending create for the same item', async () => {
  const seen: SyncOp[] = [];
  const { queue } = makeQueue(async (op) => {
    seen.push(op);
  });
  await queue.enqueue(itemCreate('1', 'a', 'Alpha'));
  await queue.enqueue(itemUpdate('2', 'a', 'Renamed'));
  await queue.enqueue(itemUpdate('3', 'a', 'Final'));

  assert.equal(await queue.count(), 1);
  await queue.flush();

  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.kind, 'item.create');
  assert.equal(seen[0]?.kind === 'item.create' && seen[0].name, 'Final');
});

test('deleting a pending item create cancels both ops', async () => {
  const { queue } = makeQueue(async () => undefined);
  await queue.enqueue(itemCreate('1', 'a'));
  await queue.enqueue(itemDelete('2', 'a'));

  assert.equal(await queue.count(), 0);
  assert.equal((await queue.flush()).status, 'idle');
});

test('deleting a list drops its item and ranking ops', async () => {
  const seen: SyncOp[] = [];
  const { queue } = makeQueue(async (op) => {
    seen.push(op);
  });
  await queue.enqueue(itemCreate('1', 'a'));
  await queue.enqueue(rankingSet('2', 'a', 2));
  await queue.enqueue(listDelete('3'));

  assert.equal(await queue.count(), 1);
  await queue.flush();
  assert.deepEqual(
    seen.map((op) => op.kind),
    ['list.delete']
  );
});

test('repeated rankings keep only the last decision', async () => {
  const seen: SyncOp[] = [];
  const { queue } = makeQueue(async (op) => {
    seen.push(op);
  });
  await queue.enqueue(rankingSet('1', 'a', 1));
  await queue.enqueue(rankingSet('2', 'a', 5));

  assert.equal(await queue.count(), 1);
  await queue.flush();
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.kind === 'ranking.set' && seen[0].gap, 5);
});

test('remaining and dropped counts describe a partial flush', async () => {
  const { queue } = makeQueue(async (op) => {
    if (op.id === '1') throw new ApiError(422, 'Unprocessable');
    if (op.id === '2') throw new NetworkError();
  });
  await queue.enqueue(itemCreate('1', 'a', 'Dup'));
  await queue.enqueue(itemCreate('2', 'b'));
  await queue.enqueue(itemCreate('3', 'c'));

  const outcome = await queue.flush();

  assert.equal(outcome.status, 'offline');
  assert.equal(outcome.applied.length, 0);
  assert.deepEqual(outcome.dropped, []);
  assert.deepEqual(outcome.refused, [
    { opId: '1', message: "Couldn't save a pending change." },
  ]);
  assert.equal(outcome.remaining, 3);
  assert.equal(await queue.count(), 3);
});

test('a validation rejection keeps the op for a later flush', async () => {
  let calls = 0;
  const { queue } = makeQueue(async () => {
    calls += 1;
    if (calls === 1)
      throw new ApiError(422, 'Unprocessable', {
        detail: [
          {
            type: 'missing',
            loc: ['query', 'list_title'],
            msg: 'Field required',
          },
        ],
      });
  });
  await queue.enqueue(itemCreate('1', 'a', 'Alpha'));

  const first = await queue.flush();

  assert.equal(first.status, 'idle');
  assert.deepEqual(first.refused, [
    { opId: '1', message: 'list_title: Field required' },
  ]);
  assert.deepEqual(first.dropped, []);
  assert.equal(await queue.count(), 1);

  const second = await queue.flush();

  assert.deepEqual(second.applied, ['1']);
  assert.equal(await queue.count(), 0);
});

test('a dependent edit waits for its refused create', async () => {
  const applied: string[] = [];
  const { queue, storage } = makeQueue(async (op) => {
    if (op.id === '1') throw new ApiError(422, 'Unprocessable');
    if (op.id === '2') throw new ApiError(404, 'Not Found');
    applied.push(op.id);
  });
  storage.map.set(
    `outbox:v1:${USER}`,
    JSON.stringify([
      itemCreate('1', 'a', 'Alpha'),
      itemUpdate('2', 'a', 'Renamed'),
      itemDelete('3', 'b'),
    ])
  );

  const outcome = await queue.flush();

  assert.deepEqual(applied, ['3']);
  assert.deepEqual(outcome.dropped, []);
  assert.deepEqual(
    outcome.refused.map((entry) => entry.opId),
    ['1']
  );
  assert.equal(await queue.count(), 2);
});

test('retired cover keys are stripped from persisted list ops', async () => {
  const seen: SyncOp[] = [];
  const { queue, storage } = makeQueue(async (op) => {
    seen.push(op);
  });
  storage.map.set(
    `outbox:v1:${USER}`,
    JSON.stringify([
      {
        id: '1',
        createdAt: '2026-01-01T00:00:00.000Z',
        kind: 'list.create',
        listId: 'l1',
        list: {
          list_id: 'l1',
          title: 'Old',
          cover: 'landscape',
          cover_photo: null,
        },
      },
      {
        id: '2',
        createdAt: '2026-01-01T00:00:01.000Z',
        kind: 'list.update',
        listId: 'l2',
        metadata: {
          title: 'Renamed',
          cover: null,
          cover_photo: { source: 'upload', id: 'x' },
        },
      },
    ])
  );

  await queue.flush();

  assert.deepEqual(
    seen.map((op) =>
      op.kind === 'list.create'
        ? op.list
        : op.kind === 'list.update'
          ? op.metadata
          : null
    ),
    [{ list_id: 'l1', title: 'Old' }, { title: 'Renamed' }]
  );
});

test('compacts manualRating across item.create, ranking.set, and item.update', async () => {
  const seen: SyncOp[] = [];
  const { queue } = makeQueue(async (op) => {
    seen.push(op);
  });

  await queue.enqueue(itemCreate('1', 'a', 'Alpha'));
  await queue.enqueue(rankingSet('2', 'a', 0));
  await queue.enqueue({
    id: '3',
    createdAt: NOW,
    kind: 'item.update',
    listId: 'list-1',
    itemId: 'a',
    name: 'Alpha Renamed',
    manualRating: 7.5,
  });
  await queue.flush();
  assert.deepEqual(
    seen.map((op) =>
      op.kind === 'item.create'
        ? [op.kind, op.name]
        : op.kind === 'ranking.set'
          ? [op.kind, op.gap]
          : op.kind === 'item.update'
            ? [op.kind, op.name, op.manualRating]
            : [op.kind]
    ),
    [
      ['item.create', 'Alpha Renamed'],
      ['ranking.set', 0],
      ['item.update', undefined, 7.5],
    ]
  );

  seen.length = 0;
  await queue.enqueue({
    id: '4',
    createdAt: NOW,
    kind: 'item.update',
    listId: 'list-1',
    itemId: 'a',
    manualRating: 8.2,
  });
  await queue.enqueue(rankingSet('5', 'a', 2));
  await queue.flush();
  assert.deepEqual(
    seen.map((op) => op.kind),
    ['ranking.set']
  );
});

test('an emoji change survives folding into a create and a later re-rank', async () => {
  const folded: SyncOp[] = [];
  const first = makeQueue(async (op) => {
    folded.push(op);
  });
  await first.queue.enqueue(itemCreate('1', 'a'));
  await first.queue.enqueue({
    id: '2',
    createdAt: NOW,
    kind: 'item.update',
    listId: 'list-1',
    itemId: 'a',
    icon: '🍕',
  });
  await first.queue.flush();
  assert.equal(folded.length, 1);
  assert.equal(folded[0]?.kind, 'item.create');
  assert.equal(folded[0]?.kind === 'item.create' && folded[0].icon, '🍕');

  const reranked: SyncOp[] = [];
  const second = makeQueue(async (op) => {
    reranked.push(op);
  });
  await second.queue.enqueue({
    id: '1',
    createdAt: NOW,
    kind: 'item.update',
    listId: 'list-1',
    itemId: 'b',
    icon: '🍕',
    manualRating: 7,
  });
  await second.queue.enqueue(rankingSet('2', 'b', 0));
  await second.queue.flush();
  assert.deepEqual(
    reranked.map((op) => op.kind),
    ['item.update', 'ranking.set']
  );
  const update = reranked[0];
  assert.equal(update?.kind === 'item.update' && update.icon, '🍕');
  assert.equal(
    update?.kind === 'item.update' && update.manualRating,
    undefined
  );
});

test('duplicate item.delete ops compact to one entry and pendingOps returns all ops', async () => {
  const { queue, storage } = makeQueue(async () => undefined);

  await queue.enqueue(itemDelete('1', 'a'));
  await queue.enqueue(itemDelete('2', 'a'));
  await queue.enqueue(itemDelete('3', 'b'));

  const ops = await pendingOps(USER, storage);
  assert.deepEqual(
    ops.map((op) => (op.kind === 'item.delete' ? [op.id, op.itemId] : [op.id])),
    [
      ['2', 'a'],
      ['3', 'b'],
    ]
  );
});
