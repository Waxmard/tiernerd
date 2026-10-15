import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseThemePreference, preferenceColor } from './themePreference.ts';

test('defaults to dark for missing or unknown values', () => {
  assert.equal(parseThemePreference(null), 'dark');
  assert.equal(parseThemePreference(''), 'dark');
  assert.equal(parseThemePreference('DARK'), 'dark');
  assert.equal(parseThemePreference('[1]'), 'dark');
});

test('accepts the three stored preferences', () => {
  assert.equal(parseThemePreference('dark'), 'dark');
  assert.equal(parseThemePreference('light'), 'light');
  assert.equal(parseThemePreference('system'), 'system');
});

test('maps relative ranks to the four preference greens', () => {
  assert.deepEqual(
    [1, 2, 3, 4].map((rank) => preferenceColor(rank, 4)),
    ['#2e7d50', '#69a77c', '#a1c9ac', '#d8eadd']
  );
  assert.equal(preferenceColor(1, 1), '#2e7d50');
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8].map((rank) => preferenceColor(rank, 8)),
    [
      '#2e7d50',
      '#2e7d50',
      '#2e7d50',
      '#69a77c',
      '#69a77c',
      '#a1c9ac',
      '#a1c9ac',
      '#d8eadd',
    ]
  );
});

test('rejects missing, fractional and out-of-range ranks or counts', () => {
  for (const rank of [null, 0, -1, 1.5, 5, Number.NaN, Infinity]) {
    assert.equal(preferenceColor(rank, 4), null);
  }
  for (const count of [0, -1, 1.5, Number.NaN, Infinity]) {
    assert.equal(preferenceColor(1, count), null);
  }
});
