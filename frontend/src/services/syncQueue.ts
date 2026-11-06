import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, getApiErrorMessage, isNetworkError } from './apiError.ts';
import type { ListCreatePayload, ListMetadataPatch } from './listsService.ts';

export type SyncOp =
  | {
      id: string;
      createdAt: string;
      kind: 'list.create';
      listId: string;
      list: ListCreatePayload;
    }
  | {
      id: string;
      createdAt: string;
      kind: 'list.update';
      listId: string;
      metadata: ListMetadataPatch;
    }
  | { id: string; createdAt: string; kind: 'list.delete'; listId: string }
  | {
      id: string;
      createdAt: string;
      kind: 'item.create';
      listId: string;
      itemId: string;
      name: string;
      description: string | null;
    }
  | {
      id: string;
      createdAt: string;
      kind: 'item.update';
      listId: string;
      itemId: string;
      name?: string;
      description?: string | null;
    }
  | {
      id: string;
      createdAt: string;
      kind: 'item.delete';
      listId: string;
      itemId: string;
    }
  | {
      id: string;
      createdAt: string;
      kind: 'ranking.set';
      listId: string;
      itemId: string;
      gap: number;
    };

export interface SyncStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface FlushOutcome {
  status: 'idle' | 'offline' | 'auth';
  applied: string[];
  dropped: { opId: string; message: string }[];
  remaining: number;
}

const outboxKey = (userId: string): string => `outbox:v1:${userId}`;

const GENERIC_MESSAGE = "Couldn't save a pending change.";
const LIST_DELETED_MESSAGE =
  'A list you edited was deleted on another device. Your edit was discarded.';
const ITEM_DELETED_MESSAGE =
  'An item you edited was deleted on another device. Your edit was discarded.';

function mergeMetadata(
  earlier: ListMetadataPatch,
  later: ListMetadataPatch
): ListMetadataPatch {
  const merged = { ...earlier };
  for (const [key, value] of Object.entries(later)) {
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

export function compact(ops: SyncOp[]): SyncOp[] {
  const result: SyncOp[] = [];
  for (const op of ops) {
    if (op.kind === 'item.update') {
      const createIndex = result.findIndex(
        (entry) => entry.kind === 'item.create' && entry.itemId === op.itemId
      );
      const create = result[createIndex];
      if (create && create.kind === 'item.create') {
        result[createIndex] = {
          ...create,
          name: op.name ?? create.name,
          description:
            op.description === undefined ? create.description : op.description,
        };
        continue;
      }
      const updateIndex = result.findIndex(
        (entry) => entry.kind === 'item.update' && entry.itemId === op.itemId
      );
      const update = result[updateIndex];
      if (update && update.kind === 'item.update') {
        result[updateIndex] = {
          ...update,
          name: op.name ?? update.name,
          description:
            op.description === undefined ? update.description : op.description,
        };
        continue;
      }
      result.push(op);
      continue;
    }

    if (op.kind === 'list.update') {
      const createIndex = result.findIndex(
        (entry) => entry.kind === 'list.create' && entry.listId === op.listId
      );
      const create = result[createIndex];
      if (create && create.kind === 'list.create') {
        result[createIndex] = {
          ...create,
          list: { ...create.list, ...op.metadata },
        };
        continue;
      }
      const updateIndex = result.findIndex(
        (entry) => entry.kind === 'list.update' && entry.listId === op.listId
      );
      const update = result[updateIndex];
      if (update && update.kind === 'list.update') {
        result[updateIndex] = {
          ...update,
          metadata: mergeMetadata(update.metadata, op.metadata),
        };
        continue;
      }
      result.push(op);
      continue;
    }

    if (op.kind === 'ranking.set') {
      const rankingIndex = result.findIndex(
        (entry) => entry.kind === 'ranking.set' && entry.itemId === op.itemId
      );
      const ranking = result[rankingIndex];
      if (ranking && ranking.kind === 'ranking.set') {
        result[rankingIndex] = { ...ranking, gap: op.gap };
        continue;
      }
      result.push(op);
      continue;
    }

    if (op.kind === 'item.delete') {
      const pendingCreate = result.some(
        (entry) => entry.kind === 'item.create' && entry.itemId === op.itemId
      );
      const kept = result.filter(
        (entry) =>
          !(
            (entry.kind === 'item.update' ||
              entry.kind === 'ranking.set' ||
              entry.kind === 'item.create') &&
            entry.itemId === op.itemId
          )
      );
      result.length = 0;
      result.push(...kept);
      if (!pendingCreate) result.push(op);
      continue;
    }

    if (op.kind === 'list.delete') {
      const pendingCreate = result.some(
        (entry) => entry.kind === 'list.create' && entry.listId === op.listId
      );
      const kept = result.filter((entry) => entry.listId !== op.listId);
      result.length = 0;
      result.push(...kept);
      if (!pendingCreate) result.push(op);
      continue;
    }

    result.push(op);
  }
  return result;
}

function notFoundMessage(op: SyncOp): string | null {
  if (op.kind === 'list.update') return LIST_DELETED_MESSAGE;
  if (op.kind === 'item.update') return ITEM_DELETED_MESSAGE;
  return null;
}

export const asyncStorageSyncBackend: SyncStorage = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
};

export interface SyncQueue {
  enqueue(op: SyncOp): Promise<number>;
  count(): Promise<number>;
  flush(): Promise<FlushOutcome>;
}

export function createSyncQueue(options: {
  userId: string;
  storage: SyncStorage;
  applyOp: (op: SyncOp, token: string) => Promise<void>;
  getToken: () => string | null;
}): SyncQueue {
  const { userId, storage, applyOp, getToken } = options;
  let tail: Promise<unknown> = Promise.resolve();

  const serialize = <T>(work: () => Promise<T>): Promise<T> => {
    const run = tail.then(work, work);
    tail = run.catch(() => undefined);
    return run;
  };

  const readOps = async (): Promise<SyncOp[]> => {
    const raw = await storage.get(outboxKey(userId)).catch(() => null);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as SyncOp[]) : [];
    } catch {
      return [];
    }
  };

  const writeOps = async (ops: SyncOp[]): Promise<void> => {
    await storage.set(outboxKey(userId), JSON.stringify(ops));
  };

  return {
    enqueue: (op: SyncOp): Promise<number> =>
      serialize(async () => {
        const ops = await readOps();
        const next = compact([...ops, op]);
        await writeOps(next);
        return next.length;
      }),

    count: (): Promise<number> =>
      serialize(async () => (await readOps()).length),

    flush: (): Promise<FlushOutcome> =>
      serialize(async (): Promise<FlushOutcome> => {
        const ops = await readOps();
        if (ops.length === 0)
          return { status: 'idle', applied: [], dropped: [], remaining: 0 };
        const token = getToken();
        if (!token) {
          return {
            status: 'auth',
            applied: [],
            dropped: [],
            remaining: ops.length,
          };
        }

        const applied: string[] = [];
        const dropped: { opId: string; message: string }[] = [];
        for (let index = 0; index < ops.length; index += 1) {
          const op = ops[index];
          if (!op) break;
          try {
            await applyOp(op, token);
          } catch (error) {
            const offline =
              isNetworkError(error) ||
              (error instanceof ApiError && error.status >= 500);
            if (offline) {
              return {
                status: 'offline',
                applied,
                dropped,
                remaining: ops.length - index,
              };
            }
            if (
              error instanceof ApiError &&
              error.status === 404 &&
              op.kind !== 'item.create' &&
              op.kind !== 'list.create'
            ) {
              applied.push(op.id);
              const message = notFoundMessage(op);
              if (message) dropped.push({ opId: op.id, message });
              await writeOps(ops.slice(index + 1));
              continue;
            }
            if (
              error instanceof ApiError &&
              (error.status === 409 || error.status === 422)
            ) {
              const message = getApiErrorMessage(error, GENERIC_MESSAGE);
              dropped.push({ opId: op.id, message });
              await writeOps(ops.slice(index + 1));
              continue;
            }
            return {
              status: 'offline',
              applied,
              dropped,
              remaining: ops.length - index,
            };
          }
          applied.push(op.id);
          await writeOps(ops.slice(index + 1));
        }
        return { status: 'idle', applied, dropped, remaining: 0 };
      }),
  };
}
