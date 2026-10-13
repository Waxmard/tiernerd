import { ApiError } from './apiError';
import {
  type ComparisonSession,
  type CreateItemResponse,
  type Item,
  itemsService,
  type TierSet,
  type UpdateItemRequest,
} from './itemsService';
import { listsService } from './listsService';
import { hasSavedRankChanged } from './rankSnapshot';

export type ReconciledSession =
  | { kind: 'found'; session: ComparisonSession }
  | { kind: 'completed'; item: Item }
  | { kind: 'session-missing'; item: Item }
  | { kind: 'missing' }
  | { kind: 'unavailable' };
export type DraftCancellation =
  | { kind: 'cancelled' }
  | { kind: 'active'; session: ComparisonSession }
  | { kind: 'completed'; item: Item }
  | { kind: 'missing' }
  | { kind: 'unknown' };

async function findSessionAfterMissing(
  session: ComparisonSession,
  token: string
): Promise<ReconciledSession> {
  try {
    const active = await itemsService.getComparison(session.item_id, token);
    if (active) return { kind: 'found', session: active };
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404))
      return { kind: 'unavailable' };
  }
  try {
    const items = await listsService.getListItems(session.list_id, token);
    const candidate = items.find((item) => item.item_id === session.item_id);
    if (!candidate) return { kind: 'missing' };
    return hasSavedRankChanged(session, candidate)
      ? { kind: 'completed', item: candidate }
      : { kind: 'session-missing', item: candidate };
  } catch (error) {
    return error instanceof ApiError && error.status === 404
      ? { kind: 'missing' }
      : { kind: 'unavailable' };
  }
}

export async function reconcileComparisonSession(
  session: ComparisonSession,
  token: string
): Promise<ReconciledSession> {
  try {
    return {
      kind: 'found',
      session: await itemsService.getComparisonStatus(
        session.session_id,
        token
      ),
    };
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404))
      return { kind: 'unavailable' };
  }
  return findSessionAfterMissing(session, token);
}

async function resolveMissingSession(
  session: ComparisonSession,
  token: string
): Promise<DraftCancellation> {
  const result = await findSessionAfterMissing(session, token);
  if (result.kind === 'found')
    return { kind: 'active', session: result.session };
  if (result.kind === 'unavailable') return { kind: 'unknown' };
  if (result.kind === 'completed') return result;
  if (result.kind === 'missing') return { kind: 'missing' };
  return session.discard_on_cancel
    ? { kind: 'unknown' }
    : { kind: 'cancelled' };
}

export async function cancelComparisonSession(
  session: ComparisonSession,
  token: string,
  recoveryRequired: boolean
): Promise<DraftCancellation> {
  if (session.status === 'cancelled') return { kind: 'cancelled' };
  if (session.status === 'completed')
    return { kind: 'completed', item: session.item };
  let current = session;
  if (recoveryRequired) {
    try {
      current = await itemsService.getComparisonStatus(
        session.session_id,
        token
      );
    } catch (error) {
      return error instanceof ApiError && error.status === 404
        ? resolveMissingSession(session, token)
        : { kind: 'unknown' };
    }
    if (current.status === 'cancelled') return { kind: 'cancelled' };
    if (current.status === 'completed')
      return { kind: 'completed', item: current.item };
  }
  try {
    await itemsService.cancelComparison(current.session_id, token);
    return { kind: 'cancelled' };
  } catch {
    try {
      const latest = await itemsService.getComparisonStatus(
        current.session_id,
        token
      );
      if (latest.status === 'cancelled') return { kind: 'cancelled' };
      if (latest.status === 'completed')
        return { kind: 'completed', item: latest.item };
      return { kind: 'active', session: latest };
    } catch (error) {
      return error instanceof ApiError && error.status === 404
        ? resolveMissingSession(current, token)
        : { kind: 'unknown' };
    }
  }
}

export type RankingStartResult =
  | { kind: 'session'; session: ComparisonSession }
  | { kind: 'not-started' }
  | { kind: 'missing' }
  | { kind: 'failed'; error: unknown }
  | { kind: 'unavailable' };

export async function startItemRanking(
  itemId: string,
  tierSet: TierSet,
  token: string,
  recoveryRequired: boolean
): Promise<RankingStartResult> {
  let startError: unknown;
  if (!recoveryRequired) {
    try {
      return {
        kind: 'session',
        session: await itemsService.startComparison(
          itemId,
          tierSet,
          false,
          null,
          token
        ),
      };
    } catch (error) {
      if (error instanceof ApiError && error.status === 409)
        return { kind: 'failed', error };
      startError = error;
    }
  }
  try {
    const session = await itemsService.getComparison(itemId, token);
    if (session) return { kind: 'session', session };
    return recoveryRequired
      ? { kind: 'not-started' }
      : { kind: 'failed', error: startError };
  } catch (error) {
    return error instanceof ApiError && error.status === 404
      ? { kind: 'missing' }
      : { kind: 'unavailable' };
  }
}

export type ComparisonAction = 'answer' | 'undo' | 'commit' | 'restart';
export type ComparisonActionResult =
  | { kind: 'saved'; session: ComparisonSession }
  | { kind: 'reconciled'; session: ComparisonSession }
  | { kind: 'completed'; item: Item; session?: ComparisonSession }
  | { kind: 'item-missing' }
  | { kind: 'session-missing' }
  | { kind: 'failed'; session: ComparisonSession; error: unknown }
  | { kind: 'unavailable' };

export async function performComparisonAction(
  session: ComparisonSession,
  token: string,
  action: ComparisonAction,
  answer?: 'better' | 'worse'
): Promise<ComparisonActionResult> {
  try {
    if (action === 'answer') {
      if (!answer) throw new Error('A comparison choice is required');
      return {
        kind: 'saved',
        session: await itemsService.submitComparison(
          session.session_id,
          answer,
          session.revision,
          token
        ),
      };
    }
    const result =
      action === 'undo'
        ? await itemsService.undoComparison(
            session.session_id,
            session.revision,
            token
          )
        : action === 'commit'
          ? await itemsService.commitComparison(
              session.session_id,
              session.revision,
              token
            )
          : await itemsService.startComparison(
              session.item_id,
              session.tier_set,
              true,
              session.revision,
              token
            );
    return { kind: 'saved', session: result };
  } catch (error) {
    const current = await reconcileComparisonSession(session, token);
    if (current.kind === 'found') {
      if (current.session.status === 'completed')
        return {
          kind: 'completed',
          item: current.session.item,
          session: current.session,
        };
      return current.session.revision > session.revision
        ? { kind: 'reconciled', session: current.session }
        : { kind: 'failed', session: current.session, error };
    }
    if (current.kind === 'completed') return current;
    if (current.kind === 'missing') return { kind: 'item-missing' };
    if (current.kind === 'session-missing') return { kind: 'session-missing' };
    return { kind: 'unavailable' };
  }
}

export async function saveItemMetadata(
  mode: 'add' | 'edit',
  item: Item | null,
  listTitle: string,
  name: string,
  description: string,
  tierSet: TierSet,
  token: string
): Promise<CreateItemResponse> {
  if (mode === 'edit') {
    if (!item) throw new Error('An item is required to edit its metadata');
    const request: UpdateItemRequest = {
      name,
      description: description.trim() || null,
    };
    return itemsService.updateItem(item.item_id, request, token);
  }
  return itemsService.createItem(
    listTitle,
    {
      name,
      tier_set: tierSet,
      ...(description.trim() ? { description: description.trim() } : {}),
    },
    token
  );
}

export type DeleteItemResult =
  | { kind: 'deleted' }
  | { kind: 'missing' }
  | { kind: 'cancel-failed'; discard: boolean };
async function listItemExists(
  item: Item,
  token: string
): Promise<boolean | null> {
  try {
    return (await listsService.getListItems(item.list_id, token)).some(
      (candidate) => candidate.item_id === item.item_id
    );
  } catch (error) {
    return error instanceof ApiError && error.status === 404 ? false : null;
  }
}
export async function deleteItemWithDraft(
  item: Item,
  token: string,
  recoveryRequired: boolean
): Promise<DeleteItemResult> {
  let active: ComparisonSession | null;
  try {
    active = await itemsService.getComparison(item.item_id, token);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
    const exists = await listItemExists(item, token);
    if (exists === null) throw error;
    if (!exists) return { kind: 'missing' };
    throw error;
  }
  if (active) {
    const cancelled = await cancelComparisonSession(
      active,
      token,
      recoveryRequired
    );
    if (cancelled.kind === 'missing') return { kind: 'missing' };
    if (cancelled.kind === 'active' || cancelled.kind === 'unknown')
      return { kind: 'cancel-failed', discard: active.discard_on_cancel };
    if (cancelled.kind === 'cancelled' && active.discard_on_cancel)
      return { kind: 'deleted' };
  }
  try {
    await itemsService.deleteItem(item.item_id, token);
  } catch (error) {
    const exists = await listItemExists(item, token);
    if (exists === null || exists) throw error;
    return { kind: 'missing' };
  }
  return { kind: 'deleted' };
}
