import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMOJI_GROUPS, searchEmoji } from './emojiCatalog.ts';
import { listIconEmoji } from './listIcon.ts';

test('search matches every term against emoji names', () => {
  assert.ok(searchEmoji('pizza').some((entry) => entry.emoji === '🍕'));
  assert.ok(searchEmoji('RED heart').some((entry) => entry.emoji === '❤️'));
  assert.deepEqual(searchEmoji('  '), []);
});

test('the catalog omits emoji newer than the oldest supported iOS', () => {
  const all = EMOJI_GROUPS.flatMap((group) => group.emojis);
  assert.ok(!all.some((entry) => entry.emoji === '🫩'));
});

test('every emoji fits the database column', () => {
  for (const group of EMOJI_GROUPS) {
    for (const entry of group.emojis) {
      assert.ok(Array.from(entry.emoji).length <= 16, entry.emoji);
    }
  }
});

test('legacy list icon keys map to emoji and emoji pass through', () => {
  assert.equal(listIconEmoji('coffee'), '☕');
  assert.equal(listIconEmoji('🚀'), '🚀');
  assert.equal(listIconEmoji(null), '🗂️');
});
