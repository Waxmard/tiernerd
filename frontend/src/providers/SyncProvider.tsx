import NetInfo from '@react-native-community/netinfo';
import type React from 'react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { applyOpToApi } from '../services/syncApi';
import {
  asyncStorageSyncBackend,
  createSyncQueue,
  type FlushOutcome,
  type SyncOp,
  type SyncQueue,
} from '../services/syncQueue';
import { useAuth } from './AuthContext';
import { useNotify } from './NotificationProvider';

export type MutationOutcome =
  | { status: 'saved' }
  | { status: 'queued' }
  | { status: 'rejected'; message: string };

export interface SyncContextValue {
  isOffline: boolean;
  lastSyncedAt: number;
  mutate(
    op: SyncOp,
    options: {
      applyLocal: () => Promise<void>;
      rollbackLocal?: () => Promise<void>;
    }
  ): Promise<MutationOutcome>;
  flush: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export const useSync = (): SyncContextValue => {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
};

export const useNotifyWhenOnline = (): ((message: string) => void) => {
  const notify = useNotify();
  const { isOffline } = useSync();
  const offlineRef = useRef(isOffline);
  offlineRef.current = isOffline;
  return useCallback(
    (message: string) => {
      if (offlineRef.current) return;
      notify(message);
    },
    [notify]
  );
};

export const SyncProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user, token } = useAuth();
  const notify = useNotify();
  const userId = user?.id ?? null;
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const queueRef = useRef<SyncQueue | null>(null);
  const queueUserIdRef = useRef<string | null>(null);
  const appliedOpsRef = useRef<Set<string>>(new Set());
  const droppedOpsRef = useRef<Map<string, string>>(new Map());
  if (userId && queueUserIdRef.current !== userId) {
    queueUserIdRef.current = userId;
    queueRef.current = createSyncQueue({
      userId,
      storage: asyncStorageSyncBackend,
      applyOp: applyOpToApi,
      getToken: () => tokenRef.current,
    });
    appliedOpsRef.current = new Set();
    droppedOpsRef.current = new Map();
  } else if (!userId && queueUserIdRef.current !== null) {
    queueUserIdRef.current = null;
    queueRef.current = null;
  }

  const [isOffline, setIsOffline] = useState(false);
  const isOfflineRef = useRef(isOffline);
  isOfflineRef.current = isOffline;
  const [lastSyncedAt, setLastSyncedAt] = useState(0);
  const flushRef = useRef<Promise<void> | null>(null);

  const recordOutcome = useCallback(
    (outcome: FlushOutcome) => {
      for (const id of outcome.applied) appliedOpsRef.current.add(id);
      for (const entry of outcome.dropped) {
        droppedOpsRef.current.set(entry.opId, entry.message);
        notify(entry.message);
      }
      if (outcome.applied.length > 0 || outcome.dropped.length > 0) {
        setLastSyncedAt(Date.now());
      }
    },
    [notify]
  );

  const flush = useCallback(async (): Promise<void> => {
    if (flushRef.current) {
      await flushRef.current.catch(() => undefined);
    }
    const queue = queueRef.current;
    if (!queue || !userIdRef.current) return;
    const task = (async () => {
      let outcome = await queue.flush();
      recordOutcome(outcome);
      while (outcome.status === 'idle' && (await queue.count()) > 0) {
        outcome = await queue.flush();
        recordOutcome(outcome);
      }
      if (outcome.status === 'auth')
        notify('Sign in again to save your pending changes.');
    })();
    flushRef.current = task;
    try {
      await task;
    } finally {
      if (flushRef.current === task) flushRef.current = null;
    }
  }, [notify, recordOutcome]);

  const mutate = useCallback(
    async (
      op: SyncOp,
      options: {
        applyLocal: () => Promise<void>;
        rollbackLocal?: () => Promise<void>;
      }
    ): Promise<MutationOutcome> => {
      await options.applyLocal();
      const queue = queueRef.current;
      if (!queue) return { status: 'queued' };
      await queue.enqueue(op);
      if (isOfflineRef.current) return { status: 'queued' };
      await flush();
      const dropped = droppedOpsRef.current.get(op.id);
      if (dropped !== undefined) {
        await options.rollbackLocal?.();
        return { status: 'rejected', message: dropped };
      }
      return appliedOpsRef.current.has(op.id)
        ? { status: 'saved' }
        : { status: 'queued' };
    },
    [flush]
  );

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline =
        state.isConnected === false || state.isInternetReachable === false;
      setIsOffline(offline);
      if (!offline) void flush();
    });
    return unsubscribe;
  }, [flush]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void flush();
    });
    return () => subscription.remove();
  }, [flush]);

  useEffect(() => {
    if (!userId) return;
    void flush();
  }, [flush, userId]);

  const value = useMemo(
    () => ({ isOffline, lastSyncedAt, mutate, flush }),
    [flush, isOffline, lastSyncedAt, mutate]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};
