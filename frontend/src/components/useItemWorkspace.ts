import { useCallback, useRef, useState } from 'react';
import { MAX_NAME_LENGTH } from '../config/limits';
import { useNotify } from '../providers/NotificationProvider';
import { useNotifyWhenOnline, useSync } from '../providers/SyncProvider';
import { duplicateItemName } from '../services/itemNames';
import type { Item } from '../services/itemsService';
import { localLibrary } from '../services/localLibrary';
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
  landingRange,
  manualRatingBounds,
  manualRatingBoundsError,
  parseManualRatingInput,
  type RankingAnswer,
  type RankingSession,
  targetPeerId,
  undoAnswer,
} from '../services/rankingEngine';
import { confirmDestructive } from '../utils/confirm';
import { newId } from '../utils/id';
import type {
  ItemFormDraft,
  ItemFormField,
  ItemWorkspace,
  ItemWorkspaceState,
  UseItemWorkspaceOptions,
} from './itemWorkspaceTypes';

const EMPTY_FORM: ItemFormDraft = {
  name: '',
  description: '',
  manualRating: '',
  icon: null,
};
const EMPTY_WORKSPACE: ItemWorkspaceState = {
  mode: 'closed',
  item: null,
  form: EMPTY_FORM,
  fieldErrors: {},
  ranking: null,
  isBusy: false,
  focusField: 'name',
  result: null,
};
const AUTH_ERROR = 'Authentication required';
const RANKING_SAVE_ERROR = 'Unable to save this ranking.';
const DUPLICATE_NAME_ERROR =
  'An item with this name already exists in this list.';

export function useItemWorkspace({
  userId,
  listId,
  listTitle,
  rankingMode = 'rank',
  items,
  onItemsChanged,
  suggestIcon,
  onClosed,
}: UseItemWorkspaceOptions): ItemWorkspace {
  const { mutate } = useSync();
  const notify = useNotifyWhenOnline();
  const toast = useNotify();
  const [workspace, setWorkspace] =
    useState<ItemWorkspaceState>(EMPTY_WORKSPACE);
  const workspaceRef = useRef(workspace);
  const initialFormRef = useRef<ItemFormDraft>({ ...EMPTY_FORM });
  const busyRef = useRef(false);
  const pendingIconRef = useRef<{
    itemId: string;
    icon: Promise<string | null>;
  } | null>(null);
  const optionsRef = useRef({
    userId,
    listId,
    listTitle,
    rankingMode,
    items,
    onItemsChanged,
    suggestIcon,
    onClosed,
  });
  optionsRef.current = {
    userId,
    listId,
    listTitle,
    rankingMode,
    items,
    onItemsChanged,
    suggestIcon,
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
    optionsRef.current.onClosed?.();
  }, [replaceWorkspace]);

  const rankedPeerIds = useCallback((excludeItemId: string) => {
    return optionsRef.current.items
      .filter((item) => item.item_id !== excludeItemId)
      .map((item) => item.item_id);
  }, []);

  const removeItem = useCallback(
    (activeUserId: string, itemId: string) =>
      mutate(
        {
          id: newId(),
          createdAt: new Date().toISOString(),
          kind: 'item.delete',
          listId: optionsRef.current.listId,
          itemId,
        },
        {
          applyLocal: () =>
            localLibrary.applyLocalItemDelete(
              activeUserId,
              optionsRef.current.listId,
              itemId
            ),
        }
      ),
    [mutate]
  );

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
    (item: Item, focusField: ItemFormField | null = 'name') => {
      if (busyRef.current) return;
      const form = {
        name: item.name,
        description: item.description ?? '',
        manualRating:
          item.manual_rating !== null ? formatScore(item.manual_rating) : '',
        icon: item.icon ?? null,
      };
      initialFormRef.current = form;
      replaceWorkspace({
        ...EMPTY_WORKSPACE,
        mode: 'edit',
        item,
        form,
        focusField,
      });
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
      const { userId: activeUserId, listId: activeListId } = optionsRef.current;
      const existing = workspaceRef.current.item;
      if (!activeUserId) {
        notify(RANKING_SAVE_ERROR);
        return false;
      }
      if (!beginBusy()) return false;
      try {
        const now = new Date().toISOString();
        const insertIndex = insertIndexBestFirst(session);
        const manualById = new Map(
          optionsRef.current.items.map((entry) => [
            entry.item_id,
            entry.manual_rating,
          ])
        );
        const manualBestFirst = [...session.peersWorstFirst]
          .reverse()
          .map((id) => manualById.get(id) ?? null);
        manualBestFirst.splice(insertIndex, 0, null);
        const score = computeScores(manualBestFirst)[insertIndex] ?? 0;
        const { form } = workspaceRef.current;
        const item: Item = existing ?? {
          item_id: session.itemId,
          list_id: activeListId,
          name: form.name.trim(),
          description: form.description,
          image_url: null,
          icon: form.icon,
          rating: score,
          manual_rating: null,
          position: 'pending',
          created_at: now,
          updated_at: now,
        };
        const outcome = existing
          ? await mutate(
              {
                id: newId(),
                createdAt: now,
                kind: 'ranking.set',
                listId: activeListId,
                itemId: session.itemId,
                gap: gap(session),
              },
              {
                applyLocal: () =>
                  localLibrary.applyLocalRanking(
                    activeUserId,
                    activeListId,
                    item,
                    insertIndex
                  ),
              }
            )
          : await mutate(
              {
                id: newId(),
                createdAt: now,
                kind: 'item.create',
                listId: activeListId,
                itemId: session.itemId,
                name: item.name,
                description: item.description,
                icon: item.icon,
                gap: gap(session),
              },
              {
                applyLocal: () =>
                  localLibrary.applyLocalItemCreate(
                    activeUserId,
                    activeListId,
                    item,
                    insertIndex
                  ),
                rollbackLocal: () =>
                  localLibrary.applyLocalItemDelete(
                    activeUserId,
                    activeListId,
                    item.item_id
                  ),
              }
            );
        if (outcome.status === 'rejected') {
          if (!existing && outcome.message.includes('already exists')) {
            pendingIconRef.current = null;
            updateWorkspace({
              mode: 'add',
              ranking: null,
              fieldErrors: { name: outcome.message },
            });
          } else notify(outcome.message);
          return false;
        }
        const pending = pendingIconRef.current;
        pendingIconRef.current = null;
        await optionsRef.current.onItemsChanged(
          item,
          !existing,
          pending?.itemId === item.item_id ? pending.icon : undefined
        );
        if (!existing && session.peersWorstFirst.length === 0) {
          closeWorkspace();
          return true;
        }
        updateWorkspace({
          mode: 'ranked',
          item,
          ranking: null,
          result: {
            rank: insertIndex + 1,
            total: manualBestFirst.length,
            score,
          },
        });
        return true;
      } finally {
        setBusy(false);
      }
    },
    [beginBusy, closeWorkspace, mutate, notify, setBusy, updateWorkspace]
  );

  const answer = useCallback(
    async (result: RankingAnswer) => {
      const current = workspaceRef.current;
      if (busyRef.current || current.mode !== 'ranking' || !current.ranking)
        return;
      const next = applyAnswer(current.ranking, result);
      if (isDecided(next)) {
        await commit(next);
        return;
      }
      updateWorkspace({ ranking: next });
    },
    [commit, updateWorkspace]
  );

  const undo = useCallback(() => {
    const current = workspaceRef.current;
    if (busyRef.current || current.mode !== 'ranking' || !current.ranking)
      return;
    updateWorkspace({ ranking: undoAnswer(current.ranking) });
  }, [updateWorkspace]);

  const cancelRanking = useCallback(async () => {
    const current = workspaceRef.current;
    if (current.mode !== 'ranking' || !current.ranking) return false;
    if (!beginBusy()) return false;
    try {
      if (!current.item) {
        toast(`"${current.form.name.trim()}" wasn't added.`, '🗑️');
      } else if (
        current.ranking.answers.length > 0 &&
        !(await confirmDestructive(
          'Cancel ranking?',
          'This item will keep its current rank.',
          'Cancel ranking'
        ))
      )
        return false;
      closeWorkspace();
      return true;
    } finally {
      setBusy(false);
    }
  }, [beginBusy, closeWorkspace, setBusy, toast]);

  const submitMetadata = useCallback(async () => {
    if (busyRef.current) return;
    const current = workspaceRef.current;
    const { userId: activeUserId, listId: activeListId } = optionsRef.current;
    if (current.mode !== 'add' && current.mode !== 'edit') return;
    const name = current.form.name.trim();
    const fieldErrors: ItemWorkspaceState['fieldErrors'] = {};
    if (!name) fieldErrors.name = 'Name is required';
    else if (Array.from(name).length > MAX_NAME_LENGTH)
      fieldErrors.name = `Name must be ${MAX_NAME_LENGTH} characters or less`;
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
    if (current.mode === 'add') {
      const itemId = newId();
      const session = createRankingSession(
        itemId,
        activeListId,
        rankedPeerIds(itemId)
      );
      if (isDecided(session)) {
        await commit(session);
        return;
      }
      updateWorkspace({ mode: 'ranking', ranking: session, fieldErrors: {} });
      const suggest = optionsRef.current.suggestIcon;
      if (current.form.icon || !suggest) return;
      const icon = suggest({ name, description: current.form.description });
      pendingIconRef.current = { itemId, icon };
      void icon.then((value) => {
        const live = workspaceRef.current;
        if (
          !value ||
          busyRef.current ||
          live.mode !== 'ranking' ||
          live.ranking?.itemId !== itemId ||
          live.form.icon
        )
          return;
        updateWorkspace({ form: { ...live.form, icon: value } });
      });
      return;
    }
    const original = current.item;
    if (!original) return;
    if (!beginBusy()) return;
    const now = new Date().toISOString();
    try {
      const parsed = parseManualRatingInput(current.form.manualRating);
      if ('error' in parsed) {
        updateWorkspace({ fieldErrors: { manualRating: parsed.error } });
        return;
      }
      const rankedItems = optionsRef.current.items;
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
      const nextManualRating = parsed.value;
      const manualChanged = nextManualRating !== original.manual_rating;
      let nextRating = original.rating;
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
      const updated: Item = {
        ...original,
        name,
        description: current.form.description,
        icon: current.form.icon,
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
          ...(current.form.icon !== (original.icon ?? null)
            ? { icon: current.form.icon }
            : {}),
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
        const scoreError = outcome.message.includes('Score');
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
    } finally {
      setBusy(false);
    }
  }, [
    beginBusy,
    closeWorkspace,
    commit,
    mutate,
    notify,
    rankedPeerIds,
    setBusy,
    updateWorkspace,
  ]);

  const saveIcon = useCallback(
    async (item: Item, icon: string | null): Promise<boolean> => {
      const { userId: activeUserId, listId: activeListId } = optionsRef.current;
      if (workspaceRef.current.mode !== 'closed' || icon === item.icon)
        return false;
      if (!activeUserId) {
        notify(AUTH_ERROR);
        return false;
      }
      if (!beginBusy()) return false;
      const now = new Date().toISOString();
      try {
        const outcome = await mutate(
          {
            id: newId(),
            createdAt: now,
            kind: 'item.update',
            listId: activeListId,
            itemId: item.item_id,
            icon,
          },
          {
            applyLocal: () =>
              localLibrary.applyLocalItemUpdate(activeUserId, activeListId, {
                ...item,
                icon,
                updated_at: now,
              }),
            rollbackLocal: () =>
              localLibrary.applyLocalItemUpdate(
                activeUserId,
                activeListId,
                item
              ),
          }
        );
        if (outcome.status === 'rejected') {
          notify(outcome.message);
          return false;
        }
        return true;
      } finally {
        setBusy(false);
      }
    },
    [beginBusy, mutate, notify, setBusy]
  );

  const startRanking = useCallback(
    (item: Item) => {
      if (busyRef.current || workspaceRef.current.mode !== 'closed') return;
      const { userId: activeUserId, listId: activeListId } = optionsRef.current;
      if (!activeUserId) {
        notify(AUTH_ERROR);
        return;
      }
      const session = createRankingSession(
        item.item_id,
        activeListId,
        rankedPeerIds(item.item_id)
      );
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
        const outcome = await removeItem(activeUserId, item.item_id);
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
    [beginBusy, closeWorkspace, notify, removeItem, setBusy]
  );

  const dismissResult = useCallback(() => {
    if (workspaceRef.current.mode === 'ranked') closeWorkspace();
  }, [closeWorkspace]);

  const requestClose = useCallback(async () => {
    if (busyRef.current) return false;
    const current = workspaceRef.current;
    if (current.mode === 'ranked') {
      closeWorkspace();
      return true;
    }
    if (current.mode === 'ranking' && current.ranking)
      return await cancelRanking();
    if (current.mode === 'closed') {
      if (current.item) closeWorkspace();
      return true;
    }
    const dirty =
      current.form.name !== initialFormRef.current.name ||
      current.form.description !== initialFormRef.current.description ||
      current.form.manualRating.trim() !==
        initialFormRef.current.manualRating.trim() ||
      current.form.icon !== initialFormRef.current.icon;
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

  const heldItem = workspace.item;
  const currentItem = heldItem
    ? (items.find((item) => item.item_id === heldItem.item_id) ?? heldItem)
    : null;
  const ranking = workspace.ranking;
  let view: ItemWorkspace['view'] = null;
  if (workspace.mode === 'ranking' && ranking) {
    const peerId = targetPeerId(ranking);
    const target = peerId
      ? (items.find((item) => item.item_id === peerId) ?? null)
      : null;
    const targetIndex = items.findIndex((entry) => entry.item_id === peerId);
    view = {
      item: currentItem ?? {
        item_id: ranking.itemId,
        name: workspace.form.name.trim(),
        description: workspace.form.description,
        icon: workspace.form.icon,
        image_url: null,
      },
      isNew: currentItem === null,
      target,
      targetRank: targetIndex === -1 ? null : targetIndex + 1,
      rankedCount: items.length,
      range: landingRange(ranking),
      answered: ranking.answers.length,
      limit: comparisonLimit(ranking.peersWorstFirst.length),
      canUndo: ranking.answers.length > 0,
    };
  }
  const scoreItemId = currentItem?.item_id ?? '';
  const scoreItems = workspace.mode === 'edit' && currentItem ? items : null;
  const scoreEdit = scoreItems && {
    autoScore: autoScoreWithoutPin(scoreItems, scoreItemId),
    bounds: manualRatingBounds(scoreItems, scoreItemId),
  };

  return {
    ...workspace,
    item: currentItem,
    view,
    scoreEdit,
    openAdd,
    openEdit,
    setForm,
    submitMetadata,
    startRanking,
    answer,
    undo,
    cancelRanking,
    deleteItem,
    requestClose,
    dismissResult,
    saveIcon,
  };
}
