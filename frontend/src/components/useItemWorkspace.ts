import { useCallback, useRef, useState } from 'react';
import { useSync } from '../providers/SyncProvider';
import type { Item } from '../services/itemsService';
import { localLibrary } from '../services/localLibrary';
import {
  clearDraft,
  loadDraft,
  saveDraft,
} from '../services/rankingDraftStore';
import {
  applyAnswer,
  comparisonLimit,
  createRankingSession,
  gap,
  insertIndexBestFirst,
  isDecided,
  isDraftCurrent,
  preview,
  type RankingAnswer,
  type RankingSession,
  targetPeerId,
  undoAnswer,
} from '../services/rankingEngine';
import { confirmDestructive } from '../utils/confirm';
import { newId } from '../utils/id';
import type {
  ItemFormDraft,
  ItemWorkspace,
  ItemWorkspaceState,
  UseItemWorkspaceOptions,
} from './itemWorkspaceTypes';

const EMPTY_FORM: ItemFormDraft = { name: '', description: '' };
const EMPTY_WORKSPACE: ItemWorkspaceState = {
  mode: 'closed',
  item: null,
  form: EMPTY_FORM,
  fieldErrors: {},
  ranking: null,
  isBusy: false,
  error: null,
};
const AUTH_ERROR = 'Authentication required';
const RANKING_SAVE_ERROR = 'Unable to save this ranking. Try again.';

export function useItemWorkspace({
  userId,
  listId,
  listTitle,
  items,
  onItemsChanged,
  onClosed,
}: UseItemWorkspaceOptions): ItemWorkspace {
  const { mutate } = useSync();
  const [workspace, setWorkspace] =
    useState<ItemWorkspaceState>(EMPTY_WORKSPACE);
  const workspaceRef = useRef(workspace);
  const initialFormRef = useRef<ItemFormDraft>({ ...EMPTY_FORM });
  const busyRef = useRef(false);
  const optionsRef = useRef({
    userId,
    listId,
    listTitle,
    items,
    onItemsChanged,
    onClosed,
  });
  optionsRef.current = {
    userId,
    listId,
    listTitle,
    items,
    onItemsChanged,
    onClosed,
  };

  const replaceWorkspace = useCallback((next: ItemWorkspaceState) => {
    workspaceRef.current = next;
    setWorkspace(next);
  }, []);
  const updateWorkspace = useCallback((patch: Partial<ItemWorkspaceState>) => {
    const next = { ...workspaceRef.current, ...patch };
    workspaceRef.current = next;
    setWorkspace(next);
  }, []);
  const setBusy = useCallback(
    (isBusy: boolean) => {
      busyRef.current = isBusy;
      updateWorkspace({ isBusy });
    },
    [updateWorkspace]
  );
  const beginBusy = useCallback(() => {
    if (busyRef.current) return false;
    setBusy(true);
    return true;
  }, [setBusy]);
  const closeWorkspace = useCallback(() => {
    initialFormRef.current = { ...EMPTY_FORM };
    replaceWorkspace({ ...EMPTY_WORKSPACE, form: { ...EMPTY_FORM } });
    optionsRef.current.onClosed();
  }, [replaceWorkspace]);

  const rankedPeerIds = useCallback((excludeItemId: string) => {
    return optionsRef.current.items
      .filter(
        (item) => item.position !== null && item.item_id !== excludeItemId
      )
      .map((item) => item.item_id);
  }, []);

  const openAdd = useCallback(() => {
    if (busyRef.current) return;
    initialFormRef.current = { ...EMPTY_FORM };
    replaceWorkspace({
      ...EMPTY_WORKSPACE,
      mode: 'add',
      form: { ...EMPTY_FORM },
    });
  }, [replaceWorkspace]);

  const openEdit = useCallback(
    (item: Item) => {
      if (busyRef.current) return;
      const form = { name: item.name, description: item.description ?? '' };
      initialFormRef.current = form;
      replaceWorkspace({ ...EMPTY_WORKSPACE, mode: 'edit', item, form });
    },
    [replaceWorkspace]
  );

  const setForm = useCallback(
    (patch: Partial<ItemFormDraft>) => {
      if (busyRef.current) return;
      const current = workspaceRef.current;
      const fieldErrors = { ...current.fieldErrors };
      if ('name' in patch) delete fieldErrors.name;
      updateWorkspace({
        form: { ...current.form, ...patch },
        fieldErrors,
        error: null,
      });
    },
    [updateWorkspace]
  );

  const commit = useCallback(
    async (session: RankingSession) => {
      const current = workspaceRef.current;
      const activeUserId = optionsRef.current.userId;
      const item =
        current.item ??
        optionsRef.current.items.find(
          (entry) => entry.item_id === session.itemId
        ) ??
        null;
      if (!item || item.item_id !== session.itemId || !activeUserId) {
        updateWorkspace({ error: RANKING_SAVE_ERROR });
        return;
      }
      if (!beginBusy()) return;
      try {
        const outcome = await mutate(
          {
            id: newId(),
            createdAt: new Date().toISOString(),
            kind: 'ranking.set',
            listId: optionsRef.current.listId,
            itemId: session.itemId,
            gap: gap(session),
          },
          {
            applyLocal: () =>
              localLibrary.applyLocalRanking(
                activeUserId,
                optionsRef.current.listId,
                item,
                insertIndexBestFirst(session)
              ),
          }
        );
        await clearDraft(activeUserId);
        if (outcome.status === 'rejected') {
          updateWorkspace({ error: outcome.message });
          return;
        }
        await optionsRef.current.onItemsChanged(item);
        closeWorkspace();
      } finally {
        setBusy(false);
      }
    },
    [beginBusy, closeWorkspace, mutate, setBusy, updateWorkspace]
  );

  const resumeRanking = useCallback(
    (session: RankingSession) => {
      if (busyRef.current) return;
      const item =
        optionsRef.current.items.find(
          (entry) => entry.item_id === session.itemId
        ) ?? null;
      replaceWorkspace({
        ...EMPTY_WORKSPACE,
        mode: 'ranking',
        item,
        ranking: session,
      });
      if (isDecided(session)) void commit(session);
    },
    [commit, replaceWorkspace]
  );

  const answer = useCallback(
    async (result: RankingAnswer) => {
      const current = workspaceRef.current;
      const ranking = current.ranking;
      const activeUserId = optionsRef.current.userId;
      if (
        busyRef.current ||
        current.mode !== 'ranking' ||
        !ranking ||
        !activeUserId
      )
        return;
      const next = applyAnswer(ranking, result);
      await saveDraft(activeUserId, next);
      if (isDecided(next)) {
        await commit(next);
        return;
      }
      updateWorkspace({ ranking: next, error: null });
    },
    [commit, updateWorkspace]
  );

  const undo = useCallback(async () => {
    const current = workspaceRef.current;
    const activeUserId = optionsRef.current.userId;
    if (busyRef.current || current.mode !== 'ranking' || !current.ranking)
      return;
    const next = undoAnswer(current.ranking);
    if (activeUserId) await saveDraft(activeUserId, next);
    updateWorkspace({ ranking: next, error: null });
  }, [updateWorkspace]);

  const cancelRanking = useCallback(async () => {
    if (busyRef.current) return;
    const activeUserId = optionsRef.current.userId;
    if (activeUserId) await clearDraft(activeUserId);
    closeWorkspace();
  }, [closeWorkspace]);

  const submitMetadata = useCallback(async () => {
    if (busyRef.current) return;
    const current = workspaceRef.current;
    const { userId: activeUserId, listId: activeListId } = optionsRef.current;
    if (current.mode !== 'add' && current.mode !== 'edit') return;
    const name = current.form.name.trim();
    const fieldErrors: ItemWorkspaceState['fieldErrors'] = {};
    if (!name) fieldErrors.name = 'Name is required';
    else if (Array.from(name).length > 100)
      fieldErrors.name = 'Name must be 100 characters or less';
    if (Object.keys(fieldErrors).length) {
      updateWorkspace({ fieldErrors, error: null });
      return;
    }
    if (!activeUserId) {
      updateWorkspace({ error: AUTH_ERROR });
      return;
    }
    if (!beginBusy()) return;
    const now = new Date().toISOString();
    try {
      if (current.mode === 'edit' && current.item) {
        const original = current.item;
        const updated: Item = {
          ...original,
          name,
          description: current.form.description,
          updated_at: now,
        };
        const outcome = await mutate(
          {
            id: newId(),
            createdAt: now,
            kind: 'item.update',
            listId: activeListId,
            itemId: original.item_id,
            name,
            description: current.form.description,
          },
          {
            applyLocal: () =>
              localLibrary.applyLocalItemUpdate(
                activeUserId,
                activeListId,
                updated
              ),
            rollbackLocal: () =>
              localLibrary.applyLocalItemUpdate(
                activeUserId,
                activeListId,
                original
              ),
          }
        );
        if (outcome.status === 'rejected') {
          updateWorkspace({
            fieldErrors: outcome.message.includes('already exists')
              ? { name: outcome.message }
              : {},
            error: outcome.message.includes('already exists')
              ? null
              : outcome.message,
          });
          return;
        }
        updateWorkspace({ item: updated, fieldErrors: {}, error: null });
        await optionsRef.current.onItemsChanged(updated);
        closeWorkspace();
        return;
      }

      const itemId = newId();
      const localItem: Item = {
        item_id: itemId,
        list_id: activeListId,
        name,
        description: current.form.description,
        image_url: null,
        rating: null,
        position: null,
        created_at: now,
        updated_at: now,
      };
      const outcome = await mutate(
        {
          id: newId(),
          createdAt: now,
          kind: 'item.create',
          listId: activeListId,
          itemId,
          name,
          description: current.form.description,
        },
        {
          applyLocal: () =>
            localLibrary.applyLocalItemCreate(
              activeUserId,
              activeListId,
              localItem
            ),
          rollbackLocal: () =>
            localLibrary.applyLocalItemDelete(
              activeUserId,
              activeListId,
              itemId
            ),
        }
      );
      if (outcome.status === 'rejected') {
        updateWorkspace({
          fieldErrors: outcome.message.includes('already exists')
            ? { name: outcome.message }
            : {},
          error: outcome.message.includes('already exists')
            ? null
            : outcome.message,
        });
        return;
      }

      const peers = rankedPeerIds(itemId);
      let next = localItem;
      if (peers.length === 0) {
        const firstRanked = { ...localItem, position: 'pending', rating: 10 };
        await localLibrary.applyLocalRanking(
          activeUserId,
          activeListId,
          firstRanked,
          0
        );
        next = firstRanked;
      }
      updateWorkspace({ item: next, fieldErrors: {}, error: null });
      await optionsRef.current.onItemsChanged(next);
      if (peers.length === 0) {
        closeWorkspace();
        return;
      }
      const session = createRankingSession(itemId, activeListId, peers);
      await saveDraft(activeUserId, session);
      updateWorkspace({ mode: 'ranking', ranking: session });
    } finally {
      setBusy(false);
    }
  }, [
    beginBusy,
    closeWorkspace,
    mutate,
    rankedPeerIds,
    setBusy,
    updateWorkspace,
  ]);

  const startRanking = useCallback(
    async (item: Item) => {
      if (busyRef.current || workspaceRef.current.mode !== 'closed') return;
      const activeUserId = optionsRef.current.userId;
      const activeListId = optionsRef.current.listId;
      if (!activeUserId) {
        updateWorkspace({ error: AUTH_ERROR });
        return;
      }
      const peers = rankedPeerIds(item.item_id);
      const draft = await loadDraft(activeUserId);
      const resumable =
        draft && isDraftCurrent(draft, item.item_id, activeListId, peers)
          ? draft
          : null;
      const session =
        resumable ?? createRankingSession(item.item_id, activeListId, peers);
      if (!resumable) await saveDraft(activeUserId, session);
      updateWorkspace({
        mode: 'ranking',
        item,
        ranking: session,
        error: null,
        fieldErrors: {},
      });
    },
    [rankedPeerIds, updateWorkspace]
  );

  const deleteItem = useCallback(
    async (item: Item) => {
      if (busyRef.current) return;
      const activeUserId = optionsRef.current.userId;
      if (!activeUserId) {
        updateWorkspace({ error: AUTH_ERROR });
        return;
      }
      if (!beginBusy()) return;
      try {
        const confirmed = await confirmDestructive(
          'Delete Item',
          `Delete "${item.name}"? This cannot be undone.`,
          'Delete Item'
        );
        if (!confirmed) return;
        const draft = await loadDraft(activeUserId);
        if (draft?.itemId === item.item_id) await clearDraft(activeUserId);
        const outcome = await mutate(
          {
            id: newId(),
            createdAt: new Date().toISOString(),
            kind: 'item.delete',
            listId: optionsRef.current.listId,
            itemId: item.item_id,
          },
          {
            applyLocal: () =>
              localLibrary.applyLocalItemDelete(
                activeUserId,
                optionsRef.current.listId,
                item.item_id
              ),
          }
        );
        if (outcome.status === 'rejected') {
          updateWorkspace({ error: outcome.message });
          return;
        }
        await optionsRef.current.onItemsChanged(item);
      } finally {
        setBusy(false);
      }
    },
    [beginBusy, mutate, setBusy, updateWorkspace]
  );

  const pauseRanking = useCallback(async () => {
    if (busyRef.current) return false;
    closeWorkspace();
    return true;
  }, [closeWorkspace]);

  const requestClose = useCallback(async () => {
    if (busyRef.current) return false;
    const current = workspaceRef.current;
    if (current.mode === 'ranking' && current.ranking) {
      if (!beginBusy()) return false;
      try {
        if (current.ranking.answers.length > 0) {
          const confirmed = await confirmDestructive(
            'Cancel ranking?',
            'This item will stay unranked.',
            'Cancel ranking'
          );
          if (!confirmed) return false;
        }
      } finally {
        setBusy(false);
      }
      await cancelRanking();
      return true;
    }
    if (current.mode === 'closed') {
      if (current.item || current.error) closeWorkspace();
      return true;
    }
    const dirty =
      current.form.name !== initialFormRef.current.name ||
      current.form.description !== initialFormRef.current.description;
    if (dirty) {
      if (!beginBusy()) return false;
      const confirmed = await confirmDestructive(
        'Discard changes?',
        'Your unsaved changes will be discarded.',
        'Discard'
      );
      setBusy(false);
      if (!confirmed) return false;
    }
    closeWorkspace();
    return true;
  }, [beginBusy, cancelRanking, closeWorkspace, setBusy]);

  const currentItem = workspace.item;
  const ranking = workspace.ranking;
  const rankingItem =
    currentItem ??
    (ranking
      ? (items.find((item) => item.item_id === ranking.itemId) ?? null)
      : null);
  let view: ItemWorkspace['view'] = null;
  if (workspace.mode === 'ranking' && ranking && rankingItem) {
    const peerId = targetPeerId(ranking);
    const target = peerId
      ? (items.find((item) => item.item_id === peerId) ?? null)
      : null;
    const decided = isDecided(ranking);
    view = {
      item: rankingItem,
      target,
      isDecided: decided,
      answered: ranking.answers.length,
      limit: comparisonLimit(ranking.peersWorstFirst.length),
      canUndo: ranking.answers.length > 0,
      preview: decided ? preview(ranking) : null,
    };
  }

  return {
    ...workspace,
    view,
    openAdd,
    openEdit,
    resumeRanking,
    setForm,
    submitMetadata,
    startRanking,
    answer,
    undo,
    cancelRanking,
    deleteItem,
    requestClose,
    pauseRanking,
  };
}
