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
  dismissIssue as dismissStoredIssue,
  type FlushOutcome,
  loadIssues,
  type SyncIssue,
  type SyncOp,
  type SyncQueue,
} from '../services/syncQueue';
import { useAuth } from './AuthContext';

export type MutationOutcome =
  | { status: 'saved' }
  | { status: 'queued' }
  | { status: 'rejected'; message: string };

export interface SyncContextValue {
  isOffline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  issues: SyncIssue[];
  lastSyncedAt: number;
  mutate(
    op: SyncOp,
    options: {
      applyLocal: () => Promise<void>;
      rollbackLocal?: () => Promise<void>;
    }
  ): Promise<MutationOutcome>;
  flush: () => Promise<void>;
  dismissIssue: (id: string) => void;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export const useSync = (): SyncContextValue => {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
};

const BACKOFF_SECONDS = [5, 15, 30, 60, 300];

export const SyncProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user, token } = useAuth();
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const attemptRef = useRef(0);
  const previousPendingRef = useRef(0);
  const [issues, setIssues] = useState<SyncIssue[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState(0);
  const flushRef = useRef<Promise<void> | null>(null);

  const refreshQueueState = useCallback(async () => {
    const queue = queueRef.current;
    const currentUserId = userIdRef.current;
    if (!queue || !currentUserId) return;
    const [pending, storedIssues] = await Promise.all([
      queue.count(),
      loadIssues(currentUserId),
    ]);
    setPendingCount(pending);
    setIssues(storedIssues);
  }, []);

  const recordOutcome = useCallback((outcome: FlushOutcome) => {
    for (const id of outcome.applied) appliedOpsRef.current.add(id);
    for (const entry of outcome.dropped) {
      droppedOpsRef.current.set(entry.opId, entry.message);
    }
    if (outcome.applied.length > 0 || outcome.dropped.length > 0) {
      setLastSyncedAt(Date.now());
    }
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    if (flushRef.current) {
      await flushRef.current.catch(() => undefined);
    }
    const queue = queueRef.current;
    if (!queue || !userIdRef.current) return;
    const task = (async () => {
      setIsSyncing(true);
      try {
        let outcome = await queue.flush();
        recordOutcome(outcome);
        while (outcome.status === 'idle' && (await queue.count()) > 0) {
          outcome = await queue.flush();
          recordOutcome(outcome);
        }
        await refreshQueueState();
      } finally {
        setIsSyncing(false);
      }
    })();
    flushRef.current = task;
    try {
      await task;
    } finally {
      if (flushRef.current === task) flushRef.current = null;
    }
  }, [recordOutcome, refreshQueueState]);

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
      setPendingCount(await queue.enqueue(op));
      if (isOfflineRef.current) return { status: 'queued' };
      await flush();
      const dropped = droppedOpsRef.current.get(op.id);
      if (dropped !== undefined) {
        await options.rollbackLocal?.();
        await refreshQueueState();
        return { status: 'rejected', message: dropped };
      }
      return appliedOpsRef.current.has(op.id)
        ? { status: 'saved' }
        : { status: 'queued' };
    },
    [flush, refreshQueueState]
  );

  const dismissIssue = useCallback((id: string) => {
    const currentUserId = userIdRef.current;
    if (!currentUserId) return;
    void dismissStoredIssue(currentUserId, id).then(setIssues);
  }, []);

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
    if (!userId) {
      setPendingCount(0);
      setIssues([]);
      attemptRef.current = 0;
      previousPendingRef.current = 0;
      return;
    }
    void refreshQueueState().then(() => flush());
  }, [flush, refreshQueueState, userId]);

  useEffect(() => {
    if (pendingCount < previousPendingRef.current) attemptRef.current = 0;
    previousPendingRef.current = pendingCount;
    if (pendingCount === 0 || isOffline) {
      attemptRef.current = 0;
      return;
    }
    const delay =
      BACKOFF_SECONDS[
        Math.min(attemptRef.current, BACKOFF_SECONDS.length - 1)
      ] ?? 300;
    const timer = setTimeout(() => {
      attemptRef.current += 1;
      void flush();
    }, delay * 1000);
    return () => clearTimeout(timer);
  }, [flush, isOffline, pendingCount]);

  const value = useMemo(
    () => ({
      isOffline,
      isSyncing,
      pendingCount,
      issues,
      lastSyncedAt,
      mutate,
      flush,
      dismissIssue,
    }),
    [
      dismissIssue,
      flush,
      isOffline,
      isSyncing,
      issues,
      lastSyncedAt,
      mutate,
      pendingCount,
    ]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};
