import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIST_COLORS } from '../design-system/tokens/colors.ts';
import {
  DEFAULT_WORKSPACE_APPEARANCE,
  parseThemePreference,
  parseWorkspaceAppearance,
} from './themePreference.ts';

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

test('parseWorkspaceAppearance defaults missing or malformed values', () => {
  assert.deepEqual(
    parseWorkspaceAppearance(null),
    DEFAULT_WORKSPACE_APPEARANCE
  );
  assert.deepEqual(parseWorkspaceAppearance(''), DEFAULT_WORKSPACE_APPEARANCE);
  assert.deepEqual(
    parseWorkspaceAppearance('not-json'),
    DEFAULT_WORKSPACE_APPEARANCE
  );
  assert.deepEqual(
    parseWorkspaceAppearance(
      JSON.stringify({ accent: 'chartreuse', background: 'photo' })
    ),
    DEFAULT_WORKSPACE_APPEARANCE
  );
});

test('parseWorkspaceAppearance round-trips all six swatches and background modes', () => {
  for (const accent of LIST_COLORS) {
    for (const background of ['landscape', 'none'] as const) {
      assert.deepEqual(
        parseWorkspaceAppearance(JSON.stringify({ accent, background })),
        { accent, background }
      );
    }
  }
});
