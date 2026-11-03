import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseThemePreference, preferenceBand } from './themePreference.ts';

test('defaults to system for missing or unknown values', () => {
  assert.equal(parseThemePreference(null), 'system');
  assert.equal(parseThemePreference(''), 'system');
  assert.equal(parseThemePreference('DARK'), 'system');
  assert.equal(parseThemePreference('[1]'), 'system');
});

test('accepts the three stored preferences', () => {
  assert.equal(parseThemePreference('dark'), 'dark');
  assert.equal(parseThemePreference('light'), 'light');
  assert.equal(parseThemePreference('system'), 'system');
});

test('maps relative ranks to the four preference bands', () => {
  assert.deepEqual(
    [1, 2, 3, 4].map((rank) => preferenceBand(rank, 4)),
    [1, 2, 3, 4]
  );
  assert.equal(preferenceBand(1, 1), 1);
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8].map((rank) => preferenceBand(rank, 8)),
    [1, 1, 1, 2, 2, 3, 3, 4]
  );
});

test('rejects missing, fractional and out-of-range ranks or counts', () => {
  for (const rank of [null, 0, -1, 1.5, 5, Number.NaN, Infinity]) {
    assert.equal(preferenceBand(rank, 4), null);
  }
  for (const count of [0, -1, 1.5, Number.NaN, Infinity]) {
    assert.equal(preferenceBand(1, count), null);
  }
});
