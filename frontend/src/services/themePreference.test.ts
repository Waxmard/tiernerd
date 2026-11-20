import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseThemePreference,
  parseWorkspaceAppearance,
  WORKSPACE_SCENES,
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
  const expected = { background: 'landscape', backgroundOpacity: 0.4 };
  assert.deepEqual(parseWorkspaceAppearance(null), expected);
  assert.deepEqual(parseWorkspaceAppearance(''), expected);
  assert.deepEqual(parseWorkspaceAppearance('not-json'), expected);
  assert.deepEqual(
    parseWorkspaceAppearance(
      JSON.stringify({ accent: 'chartreuse', background: 'photo' })
    ),
    expected
  );
});

test('parseWorkspaceAppearance round-trips every background', () => {
  for (const background of [...WORKSPACE_SCENES, 'none'] as const) {
    assert.deepEqual(parseWorkspaceAppearance(JSON.stringify({ background })), {
      background,
      backgroundOpacity: 0.4,
    });
  }
  assert.deepEqual(
    parseWorkspaceAppearance(
      JSON.stringify({ accent: 'teal', background: 'none' })
    ),
    { background: 'none', backgroundOpacity: 0.4 }
  );
});

test('parseWorkspaceAppearance keeps an opacity from 0 to 1 and defaults the rest', () => {
  const parse = (backgroundOpacity: unknown) =>
    parseWorkspaceAppearance(
      JSON.stringify({ background: 'dusk', backgroundOpacity })
    ).backgroundOpacity;
  for (const value of [0, 0.75, 1]) assert.equal(parse(value), value);
  for (const value of [-0.1, 1.5, '0.5', null]) assert.equal(parse(value), 0.4);
});
