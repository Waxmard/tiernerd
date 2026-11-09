import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyAnswer,
  autoScoreWithoutPin,
  bounds,
  comparisonLimit,
  computeScores,
  createRankingSession,
  formatScore,
  gap,
  halfEven1,
  insertIndexBestFirst,
  isDecided,
  isDraftCurrent,
  manualRatingBounds,
  manualRatingBoundsError,
  parseManualRatingInput,
  scoreForRank,
  splitScoreParts,
  targetPeerId,
  undoAnswer,
} from './rankingEngine.ts';

const peers = ['best', 'second', 'third', 'worst'];

const decide = (...answers: ('better' | 'worse')[]) =>
  answers.reduce(
    (session, answer) => applyAnswer(session, answer),
    createRankingSession('item', 'list', peers)
  );

test('two better answers place the item at the top', () => {
  const session = decide('better', 'better');
  assert.equal(isDecided(session), true);
  assert.equal(gap(session), 4);
  assert.equal(insertIndexBestFirst(session), 0);
});

test('three worse answers place the item last', () => {
  const session = decide('worse', 'worse', 'worse');
  assert.equal(isDecided(session), true);
  assert.equal(gap(session), 0);
  assert.equal(insertIndexBestFirst(session), 4);
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

test('undo walks back every answer, one question at a time', () => {
  const start = createRankingSession('item', 'list', peers);
  const once = applyAnswer(start, 'worse');
  const twice = applyAnswer(once, 'worse');
  assert.equal(isDecided(twice), false);
  assert.equal(targetPeerId(start), 'second');
  assert.equal(targetPeerId(once), 'third');
  assert.equal(targetPeerId(twice), 'worst');
  assert.equal(targetPeerId(undoAnswer(twice)), 'third');
  assert.equal(targetPeerId(undoAnswer(undoAnswer(twice))), 'second');
  assert.deepEqual(undoAnswer(undoAnswer(undoAnswer(twice))).answers, []);
});

test('comparison limits match the server bit-length rule', () => {
  assert.equal(comparisonLimit(0), 0);
  assert.equal(comparisonLimit(1), 1);
  assert.equal(comparisonLimit(4), 3);
  assert.equal(comparisonLimit(7), 3);
  assert.equal(comparisonLimit(8), 4);
});

test('scores follow log-odds order-statistic curve and round half-even', () => {
  assert.equal(halfEven1(6.25), 6.2);
  assert.equal(halfEven1(6.35), 6.4);
  assert.equal(scoreForRank(1, 1), 6.5);
  assert.deepEqual(computeScores([null, null]), [7.5, 5.3]);
  assert.deepEqual(computeScores([null, null, null]), [8.0, 6.5, 4.6]);
  assert.deepEqual(
    computeScores([null, null, null, null]),
    [8.3, 7.1, 5.8, 4.1]
  );
  assert.deepEqual(
    computeScores([null, null, null, null, null]),
    [8.5, 7.5, 6.5, 5.3, 3.8]
  );
  assert.deepEqual(
    computeScores([null, null, null, null, null, null]),
    [8.7, 7.8, 6.9, 6.0, 4.9, 3.5]
  );
  assert.deepEqual(
    computeScores([null, null, null, null, null, null, null]),
    [8.8, 8.0, 7.3, 6.5, 5.6, 4.6, 3.2]
  );
});

test('pinned anchors rescale unpinned neighbors and autoScoreWithoutPin previews unpinned score', () => {
  assert.deepEqual(
    computeScores([null, null, null, null, 7.2]),
    [9.1, 8.6, 8.1, 7.7, 7.2]
  );
  const items = [
    { item_id: 'a', name: 'Spot A', manual_rating: null },
    { item_id: 'b', name: 'Spot B', manual_rating: 8.0 },
    { item_id: 'c', name: 'Spot C', manual_rating: null },
    { item_id: 'd', name: 'Spot D', manual_rating: null },
    { item_id: 'e', name: 'Spot E', manual_rating: 7.2 },
  ];
  assert.equal(autoScoreWithoutPin(items, 'e'), 4.0);
  assert.equal(autoScoreWithoutPin(items, 'b'), 8.6);
  assert.equal(autoScoreWithoutPin(items, 'missing'), null);
});

test('manualRatingBounds and manualRatingBoundsError enforce neighbor pins', () => {
  const items = [
    { item_id: 'a', name: 'Spot A', manual_rating: null },
    { item_id: 'b', name: 'Spot B', manual_rating: 8.0 },
    { item_id: 'c', name: 'Spot C', manual_rating: null },
    { item_id: 'd', name: 'Spot D', manual_rating: null },
    { item_id: 'e', name: 'Spot E', manual_rating: 7.2 },
  ];
  assert.deepEqual(manualRatingBounds(items, 'c'), {
    upper: { name: 'Spot B', rating: 8.0 },
    lower: { name: 'Spot E', rating: 7.2 },
  });
  assert.equal(manualRatingBoundsError(items, 'c', 7.6), null);
  assert.equal(
    manualRatingBoundsError(items, 'c', 8.5),
    'Score must be between 7.2 (Spot E) and 8 (Spot B), or re-rank this item.'
  );
  assert.equal(
    manualRatingBoundsError(items, 'a', 7.5),
    'Score must be 8 or higher (Spot B is pinned below it), or re-rank this item.'
  );
  const onlyUpper = [
    { item_id: 'b', name: 'Spot B', manual_rating: 8.0 },
    { item_id: 'c', name: 'Spot C', manual_rating: null },
  ];
  assert.equal(
    manualRatingBoundsError(onlyUpper, 'c', 8.5),
    'Score must be 8 or lower (Spot B is pinned above it), or re-rank this item.'
  );
});

test('formatScore drops a trailing .0 and keeps one decimal otherwise', () => {
  assert.equal(formatScore(8), '8');
  assert.equal(formatScore(8.0), '8');
  assert.equal(formatScore(10), '10');
  assert.equal(formatScore(0), '0');
  assert.equal(formatScore(8.5), '8.5');
  assert.equal(formatScore(9.9), '9.9');
  assert.deepEqual(splitScoreParts(10), { whole: '10', decimal: null });
  assert.deepEqual(splitScoreParts(8.0), { whole: '8', decimal: null });
  assert.deepEqual(splitScoreParts(0), { whole: '0', decimal: null });
  assert.deepEqual(splitScoreParts(8.5), { whole: '8', decimal: '.5' });
  assert.deepEqual(splitScoreParts(9.9), { whole: '9', decimal: '.9' });
});

test('parseManualRatingInput validates blank, decimal precision, and range', () => {
  assert.deepEqual(parseManualRatingInput('  '), { value: null });
  assert.deepEqual(parseManualRatingInput('7.5'), { value: 7.5 });
  assert.deepEqual(parseManualRatingInput('10'), { value: 10 });
  assert.deepEqual(parseManualRatingInput('0.0'), { value: 0 });
  assert.deepEqual(parseManualRatingInput('7.55'), {
    error: 'Use at most one decimal place (for example, 7.5).',
  });
  assert.deepEqual(parseManualRatingInput('10.1'), {
    error: 'Score must be between 0.0 and 10.0.',
  });
  assert.deepEqual(parseManualRatingInput('abc'), {
    error: 'Score must be between 0.0 and 10.0.',
  });
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
