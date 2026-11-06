import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyAnswer,
  bounds,
  comparisonLimit,
  createRankingSession,
  gap,
  insertIndexBestFirst,
  isDecided,
  isDraftCurrent,
  preview,
  scoreForRank,
  targetPeerId,
  undoAnswer,
} from './rankingEngine.ts';

const peers = ['best', 'second', 'third', 'worst'];

const decide = (...answers: ('better' | 'worse')[]) =>
  answers.reduce(
    (session, answer) => applyAnswer(session, answer),
    createRankingSession('item', 'list', peers)
  );

test('two better answers place the item at the top with a 10 score', () => {
  const session = decide('better', 'better');
  assert.equal(isDecided(session), true);
  assert.equal(gap(session), 4);
  assert.equal(insertIndexBestFirst(session), 0);
  assert.deepEqual(preview(session), { score: 10, rank: 1, rankedCount: 5 });
});

test('three worse answers place the item last with a 0 score', () => {
  const session = decide('worse', 'worse', 'worse');
  assert.equal(isDecided(session), true);
  assert.equal(gap(session), 0);
  assert.equal(insertIndexBestFirst(session), 4);
  assert.deepEqual(preview(session), { score: 0, rank: 5, rankedCount: 5 });
});

test('the binary search narrows one question at a time', () => {
  const session = createRankingSession('item', 'list', peers);
  assert.deepEqual(bounds(session), { low: 0, high: 4 });
  assert.equal(targetPeerId(session), 'second');

  const afterBetter = applyAnswer(session, 'better');
  assert.deepEqual(bounds(afterBetter), { low: 3, high: 4 });
  assert.equal(targetPeerId(afterBetter), 'best');

  const afterWorse = applyAnswer(afterBetter, 'worse');
  assert.equal(isDecided(afterWorse), true);
  assert.equal(gap(afterWorse), 3);
});

test('undo restores the previous question', () => {
  const session = applyAnswer(
    createRankingSession('item', 'list', peers),
    'worse'
  );
  const undone = undoAnswer(session);
  assert.deepEqual(undone.answers, []);
  assert.equal(
    targetPeerId(undone),
    targetPeerId(createRankingSession('item', 'list', peers))
  );
  assert.deepEqual(undoAnswer(undone), undone);
});

test('comparison limits match the server bit-length rule', () => {
  assert.equal(comparisonLimit(0), 0);
  assert.equal(comparisonLimit(1), 1);
  assert.equal(comparisonLimit(4), 3);
  assert.equal(comparisonLimit(7), 3);
  assert.equal(comparisonLimit(8), 4);
});

test('scores round half-even like Python round(x, 1)', () => {
  assert.equal(scoreForRank(4, 9), 6.2);
  assert.equal(scoreForRank(1, 5), 10);
  assert.equal(scoreForRank(5, 5), 0);
  assert.equal(scoreForRank(1, 1), 10);
  assert.equal(scoreForRank(2, 7), 8.3);
  assert.equal(scoreForRank(3, 7), 6.7);
});

test('drafts are only current while the ranked peers are unchanged', () => {
  const session = createRankingSession('item', 'list', peers);
  assert.equal(isDraftCurrent(session, 'item', 'list', peers), true);
  assert.equal(isDraftCurrent(session, 'other', 'list', peers), false);
  assert.equal(isDraftCurrent(session, 'item', 'other', peers), false);
  assert.equal(
    isDraftCurrent(session, 'item', 'list', [...peers, 'new']),
    false
  );
  assert.equal(
    isDraftCurrent(session, 'item', 'list', [
      'best',
      'second',
      'worst',
      'third',
    ]),
    false
  );
});
