import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ComparisonSession, Item } from './itemsService.ts';
import {
  findNextDraftSession,
  shouldAutoCommitRanking,
} from './itemWorkspaceActions.ts';
import { hasSavedRankChanged } from './rankSnapshot.ts';

const candidate: Item = {
  item_id: 'item-1',
  list_id: 'list-1',
  name: 'Original',
  description: null,
  image_url: null,
  rating: null,
  position: null,
  tier_set: null,
  created_at: '',
  updated_at: '',
};
const session: ComparisonSession = {
  session_id: 'session-1',
  list_id: 'list-1',
  item_id: candidate.item_id,
  status: 'active',
  tier_set: 'good',
  revision: 0,
  comparisons_answered: 0,
  comparison_limit: 0,
  can_undo: false,
  discard_on_cancel: false,
  is_stale: false,
  item: candidate,
  current_comparison: null,
  preview: null,
  created_at: '',
  updated_at: '',
};
const readySession: ComparisonSession = {
  ...session,
  status: 'ready_to_commit',
  preview: { score: 5, rank: 1, ranked_count: 1, tier_set: 'good' },
};

test('auto-commits each fresh ready revision only once', () => {
  assert.equal(shouldAutoCommitRanking(readySession, false, null), true);
  assert.equal(shouldAutoCommitRanking(session, false, null), false);
  assert.equal(
    shouldAutoCommitRanking({ ...readySession, is_stale: true }, false, null),
    false
  );
  assert.equal(
    shouldAutoCommitRanking({ ...readySession, preview: null }, false, null),
    false
  );
  assert.equal(shouldAutoCommitRanking(null, false, null), false);
  assert.equal(shouldAutoCommitRanking(readySession, true, null), false);
  assert.equal(
    shouldAutoCommitRanking(readySession, false, {
      sessionId: readySession.session_id,
      revision: readySession.revision,
    }),
    false
  );
  assert.equal(
    shouldAutoCommitRanking(readySession, false, {
      sessionId: readySession.session_id,
      revision: readySession.revision - 1,
    }),
    true
  );
});

test('detects saved-rank changes but ignores metadata edits', () => {
  assert.equal(
    hasSavedRankChanged(session, {
      ...candidate,
      name: 'Renamed',
      description: 'Updated',
    }),
    false
  );
  assert.equal(
    hasSavedRankChanged(session, { ...candidate, rating: 8.5 }),
    true
  );
  assert.equal(
    hasSavedRankChanged(session, { ...candidate, position: 'a0' }),
    true
  );
  assert.equal(
    hasSavedRankChanged(session, { ...candidate, tier_set: 'bad' }),
    true
  );
});

test('findNextDraftSession catches restart failure and identifies failed item', async () => {
  const staleSession: ComparisonSession = {
    ...session,
    is_stale: true,
    comparisons_answered: 0,
  };
  const service = {
    getComparison: async () => staleSession,
    startComparison: async () => {
      throw new Error('network down');
    },
  };
  const resolved = new Set<string>();
  const result = await findNextDraftSession(
    [candidate],
    resolved,
    'token-1',
    service,
    () => true
  );
  assert.deepEqual(result, { failedItem: candidate });
  assert.equal(resolved.has(candidate.item_id), false);
});

test('findNextDraftSession returns restarted session when restart succeeds', async () => {
  const staleSession: ComparisonSession = {
    ...session,
    is_stale: true,
    comparisons_answered: 0,
  };
  const restartedSession: ComparisonSession = {
    ...session,
    session_id: 'session-restarted',
    is_stale: false,
  };
  const service = {
    getComparison: async () => staleSession,
    startComparison: async () => restartedSession,
  };
  const resolved = new Set<string>();
  const result = await findNextDraftSession(
    [candidate],
    resolved,
    'token-1',
    service,
    () => true
  );
  assert.deepEqual(result, restartedSession);
});

test('findNextDraftSession aborts when isCurrent becomes false', async () => {
  const service = {
    getComparison: async () => session,
    startComparison: async () => session,
  };
  const resolved = new Set<string>();
  const result = await findNextDraftSession(
    [candidate],
    resolved,
    'token-1',
    service,
    () => false
  );
  assert.equal(result, null);
});
