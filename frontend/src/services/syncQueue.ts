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
      manualRating?: number | null;
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
  refused: { opId: string; message: string }[];
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
      let currentOp: Extract<SyncOp, { kind: 'item.update' }> = op;
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
        if (op.manualRating === undefined) {
          continue;
        }
        currentOp = {
          ...op,
          name: undefined,
          description: undefined,
        };
      }
      const updateIndex = result.findIndex(
        (entry) =>
          entry.kind === 'item.update' && entry.itemId === currentOp.itemId
      );
      const update = result[updateIndex];
      if (update && update.kind === 'item.update') {
        const merged: Extract<SyncOp, { kind: 'item.update' }> = {
          ...update,
          name: currentOp.name ?? update.name,
          description:
            currentOp.description === undefined
              ? update.description
              : currentOp.description,
          ...(currentOp.manualRating === undefined &&
          update.manualRating === undefined
            ? {}
            : {
                manualRating:
                  currentOp.manualRating === undefined
                    ? update.manualRating
                    : currentOp.manualRating,
              }),
        };
        if (currentOp.manualRating !== undefined) {
          result.splice(updateIndex, 1);
          result.push(merged);
        } else {
          result[updateIndex] = merged;
        }
        continue;
      }
      result.push(currentOp);
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
      const updateIndex = result.findIndex(
        (entry) => entry.kind === 'item.update' && entry.itemId === op.itemId
      );
      const update = result[updateIndex];
      if (
        update &&
        update.kind === 'item.update' &&
        update.manualRating !== undefined
      ) {
        const { manualRating: _removed, ...rest } = update;
        if (rest.name === undefined && rest.description === undefined) {
          result.splice(updateIndex, 1);
        } else {
          result[updateIndex] = rest;
        }
      }
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
              entry.kind === 'item.create' ||
              entry.kind === 'item.delete') &&
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

function parseOps(raw: string | null): SyncOp[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SyncOp[]) : [];
  } catch {
    return [];
  }
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

  const readOps = async (): Promise<SyncOp[]> =>
    parseOps(await storage.get(outboxKey(userId)).catch(() => null));

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
          return {
            status: 'idle',
            applied: [],
            dropped: [],
            refused: [],
            remaining: 0,
          };
        const token = getToken();
        if (!token) {
          return {
            status: 'auth',
            applied: [],
            dropped: [],
            refused: [],
            remaining: ops.length,
          };
        }

        const applied: string[] = [];
        const dropped: { opId: string; message: string }[] = [];
        const refused: { opId: string; message: string }[] = [];
        const kept: SyncOp[] = [];
        const refusedCreateIds = new Set<string>();

        for (let index = 0; index < ops.length; index += 1) {
          const op = ops[index];
          if (!op) break;
          try {
            await applyOp(op, token);
            applied.push(op.id);
          } catch (error) {
            const offline =
              isNetworkError(error) ||
              (error instanceof ApiError && error.status >= 500);
            if (offline) {
              kept.push(op, ...ops.slice(index + 1));
              await writeOps(kept);
              return {
                status: 'offline',
                applied,
                dropped,
                refused,
                remaining: kept.length,
              };
            }
            if (
              (op.kind === 'item.update' || op.kind === 'ranking.set') &&
              refusedCreateIds.has(op.itemId)
            ) {
              kept.push(op);
              continue;
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
              continue;
            }
            if (error instanceof ApiError && error.status === 409) {
              dropped.push({
                opId: op.id,
                message: getApiErrorMessage(error, GENERIC_MESSAGE),
              });
              continue;
            }
            if (error instanceof ApiError && error.status === 422) {
              refused.push({
                opId: op.id,
                message: getApiErrorMessage(error, GENERIC_MESSAGE),
              });
              kept.push(op);
              if (op.kind === 'item.create') refusedCreateIds.add(op.itemId);
              continue;
            }
            kept.push(op, ...ops.slice(index + 1));
            await writeOps(kept);
            return {
              status: 'offline',
              applied,
              dropped,
              refused,
              remaining: kept.length,
            };
          }
        }
        await writeOps(kept);
        return {
          status: 'idle',
          applied,
          dropped,
          refused,
          remaining: kept.length,
        };
      }),
  };
}

export async function pendingOps(
  userId: string,
  storage: SyncStorage = asyncStorageSyncBackend
): Promise<SyncOp[]> {
  const raw = await storage.get(outboxKey(userId)).catch(() => null);
  return parseOps(raw);
}
