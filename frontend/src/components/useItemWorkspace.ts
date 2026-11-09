import { useCallback, useRef, useState } from 'react';
import { useNotifyWhenOnline, useSync } from '../providers/SyncProvider';
import { duplicateItemName } from '../services/itemNames';
import type { Item } from '../services/itemsService';
import { localLibrary } from '../services/localLibrary';
import {
  clearDraft,
  loadDraft,
  saveDraft,
} from '../services/rankingDraftStore';
import {
  applyAnswer,
  autoScoreWithoutPin,
  comparisonLimit,
  computeScores,
  createRankingSession,
  formatScore,
  gap,
  insertIndexBestFirst,
  isDecided,
  isDraftCurrent,
  landingRange,
  manualRatingBounds,
  manualRatingBoundsError,
  parseManualRatingInput,
  type RankingAnswer,
  type RankingSession,
  scoreForRank,
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

const EMPTY_FORM: ItemFormDraft = {
  name: '',
  description: '',
  manualRating: '',
};
const EMPTY_WORKSPACE: ItemWorkspaceState = {
  mode: 'closed',
  item: null,
  form: EMPTY_FORM,
  fieldErrors: {},
  ranking: null,
  isBusy: false,
};
const AUTH_ERROR = 'Authentication required';
const RANKING_SAVE_ERROR = 'Unable to save this ranking.';
const DUPLICATE_NAME_ERROR =
  'An item with this name already exists in this list.';

export function useItemWorkspace({
  userId,
  listId,
  listTitle,
  items,
  onItemsChanged,
  onClosed,
}: UseItemWorkspaceOptions): ItemWorkspace {
  const { mutate } = useSync();
  const notify = useNotifyWhenOnline();
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
      const form = {
        name: item.name,
        description: item.description ?? '',
        manualRating:
          item.manual_rating !== null ? formatScore(item.manual_rating) : '',
      };
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
      if ('manualRating' in patch) delete fieldErrors.manualRating;
      updateWorkspace({
        form: { ...current.form, ...patch },
        fieldErrors,
      });
    },
    [updateWorkspace]
  );

  const commit = useCallback(
    async (session: RankingSession): Promise<boolean> => {
      const current = workspaceRef.current;
      const activeUserId = optionsRef.current.userId;
      const item =
        current.item ??
        optionsRef.current.items.find(
          (entry) => entry.item_id === session.itemId
        ) ??
        null;
      if (!item || item.item_id !== session.itemId || !activeUserId) {
        notify(RANKING_SAVE_ERROR);
        return false;
      }
      if (!beginBusy()) return false;
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
          notify(outcome.message);
          return false;
        }
        await optionsRef.current.onItemsChanged(item);
        closeWorkspace();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [beginBusy, closeWorkspace, mutate, notify, setBusy]
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
      if (current.mode !== 'ranking' || !ranking || !activeUserId) return;
      const next = applyAnswer(ranking, result);
      if (isDecided(next)) {
        await commit(next);
        return;
      }
      if (!beginBusy()) return;
      try {
        updateWorkspace({ ranking: next });
        await saveDraft(activeUserId, next);
      } finally {
        setBusy(false);
      }
    },
    [beginBusy, commit, setBusy, updateWorkspace]
  );

  const undo = useCallback(async () => {
    const current = workspaceRef.current;
    const activeUserId = optionsRef.current.userId;
    if (busyRef.current || current.mode !== 'ranking' || !current.ranking)
      return;
    const next = undoAnswer(current.ranking);
    updateWorkspace({ ranking: next });
    if (activeUserId) await saveDraft(activeUserId, next);
  }, [updateWorkspace]);

  const cancelRanking = useCallback(async () => {
    if (busyRef.current) return false;
    const current = workspaceRef.current;
    const activeUserId = optionsRef.current.userId;
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
    }
    if (activeUserId) await clearDraft(activeUserId);
    closeWorkspace();
    return true;
  }, [beginBusy, closeWorkspace, setBusy]);

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
      updateWorkspace({ fieldErrors });
      return;
    }
    if (
      duplicateItemName(optionsRef.current.items, name, current.item?.item_id)
    ) {
      updateWorkspace({ fieldErrors: { name: DUPLICATE_NAME_ERROR } });
      return;
    }
    if (!activeUserId) {
      notify(AUTH_ERROR);
      return;
    }
    if (!beginBusy()) return;
    const now = new Date().toISOString();
    try {
      if (current.mode === 'edit' && current.item) {
        const original = current.item;
        let nextManualRating = original.manual_rating;
        let nextRating = original.rating;
        let manualChanged = false;
        if (original.position !== null) {
          const parsed = parseManualRatingInput(current.form.manualRating);
          if ('error' in parsed) {
            updateWorkspace({ fieldErrors: { manualRating: parsed.error } });
            return;
          }
          const rankedItems = optionsRef.current.items.filter(
            (entry) => entry.position !== null
          );
          if (parsed.value !== null) {
            const boundsError = manualRatingBoundsError(
              rankedItems,
              original.item_id,
              parsed.value
            );
            if (boundsError) {
              updateWorkspace({ fieldErrors: { manualRating: boundsError } });
              return;
            }
          }
          nextManualRating = parsed.value;
          manualChanged = nextManualRating !== original.manual_rating;
          if (manualChanged) {
            const targetIdx = rankedItems.findIndex(
              (entry) => entry.item_id === original.item_id
            );
            if (targetIdx !== -1) {
              const scores = computeScores(
                rankedItems.map((entry, idx) =>
                  idx === targetIdx ? nextManualRating : entry.manual_rating
                )
              );
              nextRating = scores[targetIdx] ?? original.rating;
            }
          }
        }
        const updated: Item = {
          ...original,
          name,
          description: current.form.description,
          rating: nextRating,
          manual_rating: nextManualRating,
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
            ...(manualChanged ? { manualRating: nextManualRating } : {}),
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
          const duplicate = outcome.message.includes('already exists');
          const scoreError =
            outcome.message.includes('Score') ||
            outcome.message.includes('Rank this item');
          updateWorkspace({
            fieldErrors: duplicate
              ? { name: outcome.message }
              : scoreError
                ? { manualRating: outcome.message }
                : {},
          });
          if (!duplicate && !scoreError) notify(outcome.message);
          return;
        }
        updateWorkspace({ item: updated, fieldErrors: {} });
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
        manual_rating: null,
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
        const duplicate = outcome.message.includes('already exists');
        updateWorkspace({
          fieldErrors: duplicate ? { name: outcome.message } : {},
        });
        if (!duplicate) notify(outcome.message);
        return;
      }

      const peers = rankedPeerIds(itemId);
      let next = localItem;
      if (peers.length === 0) {
        const firstRanked = {
          ...localItem,
          position: 'pending',
          rating: scoreForRank(1, 1),
        };
        await localLibrary.applyLocalRanking(
          activeUserId,
          activeListId,
          firstRanked,
          0
        );
        next = firstRanked;
      }
      updateWorkspace({ item: next, fieldErrors: {} });
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
    notify,
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
        notify(AUTH_ERROR);
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
        fieldErrors: {},
      });
      if (isDecided(session)) void commit(session);
    },
    [commit, notify, rankedPeerIds, updateWorkspace]
  );

  const deleteItem = useCallback(
    async (item: Item) => {
      if (busyRef.current) return;
      const activeUserId = optionsRef.current.userId;
      if (!activeUserId) {
        notify(AUTH_ERROR);
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
          notify(outcome.message);
          return;
        }
        if (workspaceRef.current.item?.item_id === item.item_id) {
          closeWorkspace();
        }
        await optionsRef.current.onItemsChanged();
      } finally {
        setBusy(false);
      }
    },
    [beginBusy, closeWorkspace, mutate, notify, setBusy]
  );

  const pauseRanking = useCallback(async () => {
    if (busyRef.current) return false;
    const current = workspaceRef.current;
    if (
      current.mode === 'ranking' &&
      current.ranking &&
      isDecided(current.ranking)
    ) {
      return await commit(current.ranking);
    }
    closeWorkspace();
    return true;
  }, [closeWorkspace, commit]);

  const requestClose = useCallback(async () => {
    if (busyRef.current) return false;
    const current = workspaceRef.current;
    if (current.mode === 'ranking' && current.ranking) {
      if (isDecided(current.ranking)) return await commit(current.ranking);
      return await cancelRanking();
    }
    if (current.mode === 'closed') {
      if (current.item) closeWorkspace();
      return true;
    }
    const dirty =
      current.form.name !== initialFormRef.current.name ||
      current.form.description !== initialFormRef.current.description ||
      current.form.manualRating.trim() !==
        initialFormRef.current.manualRating.trim();
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
  }, [beginBusy, cancelRanking, closeWorkspace, setBusy, commit]);

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
    const ranked = items.filter((entry) => entry.position !== null);
    const targetIndex = ranked.findIndex((entry) => entry.item_id === peerId);
    view = {
      item: rankingItem,
      target,
      targetRank: targetIndex === -1 ? null : targetIndex + 1,
      rankedCount: ranked.length,
      range: landingRange(ranking),
      answered: ranking.answers.length,
      limit: comparisonLimit(ranking.peersWorstFirst.length),
      canUndo: ranking.answers.length > 0,
    };
  }
  const scoreItemId = currentItem?.item_id ?? '';
  const scoreItems =
    workspace.mode === 'edit' && currentItem?.position != null
      ? items.filter((entry) => entry.position !== null)
      : null;
  const scoreEdit = scoreItems && {
    autoScore: autoScoreWithoutPin(scoreItems, scoreItemId),
    bounds: manualRatingBounds(scoreItems, scoreItemId),
  };

  return {
    ...workspace,
    view,
    scoreEdit,
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
