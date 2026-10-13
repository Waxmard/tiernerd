import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ComparisonSession, Item } from './itemsService';
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
