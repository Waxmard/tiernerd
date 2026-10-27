import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, getApiErrorMessage } from '../services/apiError';
import {
  type ComparisonSession,
  type CreateItemResponse,
  type Item,
  isComparisonSession,
  type TierSet,
} from '../services/itemsService';
import {
  cancelComparisonSession,
  deleteItemWithDraft,
  performComparisonAction,
  reconcileComparisonSession,
  saveItemMetadata,
  shouldAutoCommitRanking,
  startItemRanking,
} from '../services/itemWorkspaceActions';
import { confirmDestructive } from '../utils/confirm';
import { useUpdateBlocker } from '../utils/useAppUpdate';
import type {
  ItemFormDraft,
  ItemWorkspace,
  ItemWorkspaceState,
  PendingRefresh,
  UseItemWorkspaceOptions,
} from './itemWorkspaceTypes';

const REFRESH_ERROR = 'Unable to refresh items. Try again.';
const CANCEL_NEW_ERROR =
  'Unable to discard this item. Check your connection and try again.';
const CANCEL_EXISTING_ERROR =
  'Unable to cancel ranking. Check your connection and try again.';
const RECOVERY_ERROR =
  'Unable to confirm whether your choice was saved. Reload the current question before trying again.';
const START_RECOVERY_ERROR =
  'Unable to confirm whether ranking was started. Reload the item before trying again.';
const EMPTY_FORM: ItemFormDraft = { name: '', description: '', tierSet: null };
const EMPTY_WORKSPACE: ItemWorkspaceState = {
  mode: 'closed',
  item: null,
  form: EMPTY_FORM,
  fieldErrors: {},
  session: null,
  isBusy: false,
  error: null,
};

export function useItemWorkspace({
  listTitle,
  token,
  onItemsChanged,
  onClosed,
}: UseItemWorkspaceOptions): ItemWorkspace {
  const [workspace, setWorkspace] =
    useState<ItemWorkspaceState>(EMPTY_WORKSPACE);
  useUpdateBlocker(workspace.mode !== 'closed' && workspace.mode !== 'ranking');
  const workspaceRef = useRef(workspace);
  const optionsRef = useRef({ listTitle, token, onItemsChanged, onClosed });
  optionsRef.current = { listTitle, token, onItemsChanged, onClosed };
  const initialFormRef = useRef<ItemFormDraft>({ ...EMPTY_FORM });
  const busyRef = useRef(false);
  const recoveryRequiredRef = useRef(false);
  const pendingRefreshRef = useRef<PendingRefresh | null>(null);
  const autoCommitAttemptRef = useRef<{
    sessionId: string;
    revision: number;
  } | null>(null);

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
    autoCommitAttemptRef.current = null;
    pendingRefreshRef.current = null;
    recoveryRequiredRef.current = false;
    initialFormRef.current = { ...EMPTY_FORM };
    replaceWorkspace({ ...EMPTY_WORKSPACE, form: { ...EMPTY_FORM } });
    optionsRef.current.onClosed();
  }, [replaceWorkspace]);
  const performPendingRefresh = useCallback(async () => {
    const pending = pendingRefreshRef.current;
    if (!pending) return false;
    try {
      await optionsRef.current.onItemsChanged(pending.item);
      pendingRefreshRef.current = null;
      updateWorkspace({ error: null });
      if (pending.closeAfter) closeWorkspace();
      return true;
    } catch {
      if (pending.closeOnRefreshFailure) {
        closeWorkspace();
        return false;
      }
      updateWorkspace({ error: REFRESH_ERROR });
      return false;
    }
  }, [closeWorkspace, updateWorkspace]);
  const reconcileSession = useCallback(
    async (session: ComparisonSession) => {
      const currentToken = optionsRef.current.token;
      if (!currentToken) return null;
      const result = await reconcileComparisonSession(session, currentToken);
      recoveryRequiredRef.current = result.kind === 'unavailable';
      if (result.kind === 'found') {
        if (result.session.status === 'completed') {
          updateWorkspace({
            session: result.session,
            item: result.session.item,
            error: null,
          });
          pendingRefreshRef.current = {
            item: result.session.item,
            closeAfter: true,
          };
        } else if (result.session.status === 'cancelled') {
          updateWorkspace({
            session: result.session,
            item: result.session.item,
            error: null,
          });
          pendingRefreshRef.current = {
            closeAfter: true,
            closeOnRefreshFailure: true,
          };
        } else {
          const attempted = autoCommitAttemptRef.current;
          const retryRequired =
            result.session.status === 'ready_to_commit' &&
            !result.session.is_stale &&
            result.session.preview !== null &&
            attempted?.sessionId === result.session.session_id &&
            attempted.revision === result.session.revision;
          updateWorkspace({
            session: result.session,
            item: result.session.item,
            error: retryRequired ? 'Unable to save ranking. Try again.' : null,
          });
          return result.session;
        }
      } else if (result.kind === 'completed')
        pendingRefreshRef.current = { item: result.item, closeAfter: true };
      else if (result.kind === 'missing' || result.kind === 'session-missing') {
        pendingRefreshRef.current = {
          closeAfter: true,
          closeOnRefreshFailure: true,
        };
      } else {
        updateWorkspace({ error: RECOVERY_ERROR });
        return null;
      }
      await performPendingRefresh();
      return null;
    },
    [performPendingRefresh, updateWorkspace]
  );
  const reloadSession = useCallback(async () => {
    const current = workspaceRef.current;
    if (busyRef.current || current.mode !== 'ranking' || !current.session)
      return;
    if (!optionsRef.current.token) {
      updateWorkspace({ error: 'Authentication required' });
      return;
    }
    if (!beginBusy()) return;
    try {
      await reconcileSession(current.session);
    } finally {
      setBusy(false);
    }
  }, [beginBusy, reconcileSession, setBusy, updateWorkspace]);
  const closeMissingItem = useCallback(
    (itemId: string) => {
      const current = workspaceRef.current;
      if (
        current.mode === 'closed' ||
        current.item?.item_id !== itemId ||
        busyRef.current
      )
        return false;
      pendingRefreshRef.current = null;
      recoveryRequiredRef.current = false;
      closeWorkspace();
      return true;
    },
    [closeWorkspace]
  );
  const cancelSession = useCallback(
    async (session: ComparisonSession) => {
      const currentToken = optionsRef.current.token;
      if (!currentToken) return { kind: 'unknown' as const };
      const result = await cancelComparisonSession(
        session,
        currentToken,
        recoveryRequiredRef.current
      );
      recoveryRequiredRef.current = result.kind === 'unknown';
      if (result.kind === 'active')
        updateWorkspace({
          session: result.session,
          item: result.session.item,
          error: null,
        });
      return result;
    },
    [updateWorkspace]
  );
  const openAdd = useCallback(() => {
    if (busyRef.current) return;
    initialFormRef.current = { ...EMPTY_FORM };
    pendingRefreshRef.current = null;
    recoveryRequiredRef.current = false;
    autoCommitAttemptRef.current = null;
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
        tierSet: item.tier_set,
      };
      initialFormRef.current = form;
      pendingRefreshRef.current = null;
      autoCommitAttemptRef.current = null;
      recoveryRequiredRef.current = false;
      replaceWorkspace({ ...EMPTY_WORKSPACE, mode: 'edit', item, form });
    },
    [replaceWorkspace]
  );
  const openRange = useCallback(
    (item: Item) => {
      if (busyRef.current) return;
      const form = {
        name: item.name,
        description: item.description ?? '',
        tierSet: item.tier_set,
      };
      initialFormRef.current = form;
      pendingRefreshRef.current = null;
      autoCommitAttemptRef.current = null;
      recoveryRequiredRef.current = false;
      replaceWorkspace({ ...EMPTY_WORKSPACE, mode: 'range', item, form });
    },
    [replaceWorkspace]
  );
  const resume = useCallback(
    (session: ComparisonSession) => {
      if (busyRef.current) return;
      pendingRefreshRef.current = null;
      autoCommitAttemptRef.current = null;
      recoveryRequiredRef.current = false;
      replaceWorkspace({
        ...EMPTY_WORKSPACE,
        mode: 'ranking',
        item: session.item,
        session,
        form: {
          name: session.item.name,
          description: session.item.description ?? '',
          tierSet: session.tier_set,
        },
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
      if ('tierSet' in patch) delete fieldErrors.range;
      updateWorkspace({
        form: { ...current.form, ...patch },
        fieldErrors,
        error: null,
      });
    },
    [updateWorkspace]
  );
  const submitMetadata = useCallback(async () => {
    if (busyRef.current) return;
    if (pendingRefreshRef.current) {
      if (!beginBusy()) return;
      try {
        await performPendingRefresh();
      } finally {
        setBusy(false);
      }
      return;
    }
    const current = workspaceRef.current;
    if (current.mode !== 'add' && current.mode !== 'edit') return;
    const name = current.form.name.trim();
    const fieldErrors: ItemWorkspaceState['fieldErrors'] = {};
    if (!name) fieldErrors.name = 'Name is required';
    else if (Array.from(name).length > 100)
      fieldErrors.name = 'Name must be 100 characters or less';
    if (current.mode === 'add' && !current.form.tierSet)
      fieldErrors.range = 'Please pick a range';
    if (Object.keys(fieldErrors).length) {
      updateWorkspace({ fieldErrors, error: null });
      return;
    }
    const currentToken = optionsRef.current.token;
    if (!currentToken) {
      updateWorkspace({ error: 'Authentication required' });
      return;
    }
    if (!beginBusy()) return;
    try {
      let response: CreateItemResponse;
      try {
        response = await saveItemMetadata(
          current.mode,
          current.item,
          optionsRef.current.listTitle,
          name,
          current.form.description,
          current.form.tierSet as TierSet,
          currentToken
        );
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 404 &&
          current.mode === 'edit' &&
          current.item
        ) {
          pendingRefreshRef.current = {
            closeAfter: true,
            closeOnRefreshFailure: true,
          };
          await performPendingRefresh();
        } else if (error instanceof ApiError && error.status === 409) {
          updateWorkspace({
            fieldErrors: {
              name: getApiErrorMessage(
                error,
                'An item with this name already exists in this list'
              ),
            },
            error: null,
          });
        } else
          updateWorkspace({
            error: getApiErrorMessage(
              error,
              current.mode === 'edit'
                ? 'Unable to save item. Try again.'
                : 'Unable to add item. Try again.'
            ),
          });
        return;
      }
      if (current.mode === 'edit') {
        const updated = response as Item;
        updateWorkspace({ item: updated, fieldErrors: {}, error: null });
        pendingRefreshRef.current = { item: updated, closeAfter: true };
      } else if (isComparisonSession(response)) {
        updateWorkspace({
          mode: 'ranking',
          item: response.item,
          session: response,
          fieldErrors: {},
          error: null,
        });
        pendingRefreshRef.current = { closeAfter: false };
      } else {
        updateWorkspace({ item: response, fieldErrors: {}, error: null });
        pendingRefreshRef.current = { item: response, closeAfter: true };
      }
      await performPendingRefresh();
    } finally {
      setBusy(false);
    }
  }, [beginBusy, performPendingRefresh, setBusy, updateWorkspace]);

  const startRanking = useCallback(async () => {
    const current = workspaceRef.current;
    if (busyRef.current || current.mode !== 'range' || !current.item) return;
    const tierSet = current.form.tierSet;
    if (!tierSet) {
      updateWorkspace({ fieldErrors: { range: 'Please pick a range' } });
      return;
    }
    const currentToken = optionsRef.current.token;
    if (!currentToken) {
      updateWorkspace({ error: 'Authentication required' });
      return;
    }
    if (!beginBusy()) return;
    const recoveryRequired = recoveryRequiredRef.current;
    try {
      const result = await startItemRanking(
        current.item.item_id,
        tierSet,
        currentToken,
        recoveryRequired
      );
      if (result.kind === 'session') {
        recoveryRequiredRef.current = false;
        updateWorkspace({
          mode: 'ranking',
          item: result.session.item,
          session: result.session,
          error: null,
          ...(!recoveryRequired ? { fieldErrors: {} } : {}),
        });
      } else if (result.kind === 'not-started') {
        recoveryRequiredRef.current = false;
        updateWorkspace({ error: 'Ranking was not started. Try again.' });
      } else if (result.kind === 'failed') {
        recoveryRequiredRef.current = false;
        updateWorkspace({
          error: getApiErrorMessage(
            result.error,
            result.error instanceof ApiError && result.error.status === 409
              ? 'Finish or cancel the current ranking first.'
              : 'Unable to start ranking. Try again.'
          ),
        });
      } else if (result.kind === 'missing') {
        pendingRefreshRef.current = {
          closeAfter: true,
          closeOnRefreshFailure: true,
        };
        await performPendingRefresh();
      } else {
        recoveryRequiredRef.current = true;
        updateWorkspace({ error: START_RECOVERY_ERROR });
      }
    } finally {
      setBusy(false);
    }
  }, [beginBusy, performPendingRefresh, setBusy, updateWorkspace]);

  const performAction = useCallback(
    async (
      action: 'answer' | 'undo' | 'commit' | 'restart',
      answer?: 'better' | 'worse'
    ) => {
      const current = workspaceRef.current;
      const session = current.session;
      if (busyRef.current || current.mode !== 'ranking' || !session) return;
      if (pendingRefreshRef.current) {
        if (!beginBusy()) return;
        try {
          await performPendingRefresh();
        } finally {
          setBusy(false);
        }
        return;
      }
      if (
        action === 'answer' &&
        (session.status !== 'active' ||
          session.is_stale ||
          !session.current_comparison)
      )
        return;
      if (
        action === 'undo' &&
        (!session.can_undo ||
          !['active', 'ready_to_commit'].includes(session.status))
      )
        return;
      if (
        action === 'commit' &&
        (session.status !== 'ready_to_commit' ||
          session.is_stale ||
          !session.preview)
      )
        return;
      const currentToken = optionsRef.current.token;
      if (!currentToken || !beginBusy()) return;
      try {
        if (recoveryRequiredRef.current) {
          await reconcileSession(session);
          return;
        }
        const result = await performComparisonAction(
          session,
          currentToken,
          action,
          answer
        );
        recoveryRequiredRef.current = result.kind === 'unavailable';
        if (
          (result.kind === 'saved' || result.kind === 'reconciled') &&
          result.session.status === 'completed'
        ) {
          updateWorkspace({
            session: result.session,
            item: result.session.item,
            error: null,
          });
          pendingRefreshRef.current = {
            item: result.session.item,
            closeAfter: true,
          };
          await performPendingRefresh();
        } else if (result.kind === 'saved' || result.kind === 'reconciled') {
          updateWorkspace({
            session: result.session,
            item: result.session.item,
            error: null,
          });
        } else if (result.kind === 'completed') {
          if (result.session)
            updateWorkspace({
              session: result.session,
              item: result.session.item,
              error: null,
            });
          pendingRefreshRef.current = { item: result.item, closeAfter: true };
          await performPendingRefresh();
        } else if (
          result.kind === 'item-missing' ||
          result.kind === 'session-missing'
        ) {
          pendingRefreshRef.current = {
            closeAfter: true,
            closeOnRefreshFailure: true,
          };
          await performPendingRefresh();
        } else if (result.kind === 'failed') {
          updateWorkspace({
            session: result.session,
            item: result.session.item,
            error: getApiErrorMessage(
              result.error,
              action === 'commit'
                ? 'Unable to save ranking. Try again.'
                : 'Ranking changed. Reload the current question.'
            ),
          });
        } else updateWorkspace({ error: RECOVERY_ERROR });
      } finally {
        setBusy(false);
      }
    },
    [
      beginBusy,
      performPendingRefresh,
      reconcileSession,
      setBusy,
      updateWorkspace,
    ]
  );
  const answer = useCallback(
    (result: 'better' | 'worse') => performAction('answer', result),
    [performAction]
  );
  const undo = useCallback(() => performAction('undo'), [performAction]);
  const commit = useCallback(() => performAction('commit'), [performAction]);

  useEffect(() => {
    const session = workspace.session;
    if (
      !session ||
      !shouldAutoCommitRanking(
        session,
        workspace.mode !== 'ranking' ||
          !token ||
          workspace.isBusy ||
          workspace.error !== null ||
          recoveryRequiredRef.current,
        autoCommitAttemptRef.current
      )
    )
      return;
    autoCommitAttemptRef.current = {
      sessionId: session.session_id,
      revision: session.revision,
    };
    void commit();
  }, [
    workspace.mode,
    workspace.session,
    workspace.isBusy,
    workspace.error,
    token,
    commit,
  ]);
  const restart = useCallback(() => performAction('restart'), [performAction]);

  const retryRefresh = useCallback(async () => {
    if (!pendingRefreshRef.current || !beginBusy()) return;
    try {
      await performPendingRefresh();
    } finally {
      setBusy(false);
    }
  }, [beginBusy, performPendingRefresh, setBusy]);
  const deleteItem = useCallback(
    async (item: Item) => {
      if (busyRef.current) return;
      if (pendingRefreshRef.current) {
        if (!beginBusy()) return;
        try {
          await performPendingRefresh();
        } finally {
          setBusy(false);
        }
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
        const currentToken = optionsRef.current.token;
        if (!currentToken) {
          updateWorkspace({ error: 'Authentication required' });
          return;
        }
        const result = await deleteItemWithDraft(
          item,
          currentToken,
          recoveryRequiredRef.current
        );
        if (result.kind === 'cancel-failed') {
          recoveryRequiredRef.current = true;
          updateWorkspace({
            error: result.discard ? CANCEL_NEW_ERROR : CANCEL_EXISTING_ERROR,
          });
          return;
        }
        if (result.kind === 'missing') {
          recoveryRequiredRef.current = false;
          pendingRefreshRef.current = {
            closeAfter: true,
            closeOnRefreshFailure: true,
          };
          await performPendingRefresh();
          return;
        }
        recoveryRequiredRef.current = false;
        pendingRefreshRef.current = { closeAfter: true };
        await performPendingRefresh();
      } catch (error) {
        updateWorkspace({
          error: getApiErrorMessage(
            error,
            'Unable to delete this item. Try again.'
          ),
        });
      } finally {
        setBusy(false);
      }
    },
    [beginBusy, performPendingRefresh, setBusy, updateWorkspace]
  );

  const pauseRanking = useCallback(() => {
    if (busyRef.current) return false;
    closeWorkspace();
    return true;
  }, [closeWorkspace]);

  const requestClose = useCallback(async () => {
    if (busyRef.current) return false;
    let current = workspaceRef.current;
    const liveSession =
      current.mode === 'ranking' &&
      current.session &&
      ['active', 'ready_to_commit'].includes(current.session.status)
        ? current.session
        : null;
    if (
      current.mode === 'ranking' &&
      current.session?.status === 'completed' &&
      !pendingRefreshRef.current
    ) {
      pendingRefreshRef.current = {
        item: current.session.item,
        closeAfter: true,
      };
    }
    if (pendingRefreshRef.current && !liveSession) {
      if (!beginBusy()) return false;
      try {
        const closeAfter = pendingRefreshRef.current.closeAfter;
        if (!(await performPendingRefresh())) return false;
        if (closeAfter) return true;
      } finally {
        setBusy(false);
      }
    }
    current = workspaceRef.current;
    if (current.mode === 'closed') return true;
    const session = current.session;
    if (
      current.mode === 'ranking' &&
      session &&
      ['active', 'ready_to_commit'].includes(session.status)
    ) {
      if (!beginBusy()) return false;
      try {
        const result = await cancelSession(session);
        if (result.kind === 'aborted') return false;
        if (result.kind === 'active' || result.kind === 'unknown') {
          const cancelError = session.discard_on_cancel
            ? CANCEL_NEW_ERROR
            : CANCEL_EXISTING_ERROR;
          updateWorkspace({
            error: result.kind === 'unknown' ? cancelError : RECOVERY_ERROR,
          });
          return false;
        }
        if (result.kind === 'missing')
          pendingRefreshRef.current = {
            closeAfter: true,
            closeOnRefreshFailure: true,
          };
        else if (result.kind === 'completed')
          pendingRefreshRef.current = { item: result.item, closeAfter: true };
        else pendingRefreshRef.current = { closeAfter: true };
        return await performPendingRefresh();
      } finally {
        setBusy(false);
      }
    }
    if (current.mode === 'add' || current.mode === 'edit') {
      const dirty =
        current.form.name !== initialFormRef.current.name ||
        current.form.description !== initialFormRef.current.description ||
        current.form.tierSet !== initialFormRef.current.tierSet;
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
    }
    closeWorkspace();
    return true;
  }, [
    beginBusy,
    cancelSession,
    closeWorkspace,
    performPendingRefresh,
    setBusy,
    updateWorkspace,
  ]);

  return {
    ...workspace,
    recoveryRequired: recoveryRequiredRef.current,
    openAdd,
    openEdit,
    openRange,
    resume,
    setForm,
    submitMetadata,
    startRanking,
    answer,
    undo,
    retryCommit: commit,
    restart,
    deleteItem,
    retryRefresh,
    requestClose,
    pauseRanking,
    reloadSession,
    closeMissingItem,
  };
}
