import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseThemePreference } from './themePreference.ts';

test('defaults to the system preference for missing or unknown values', () => {
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
