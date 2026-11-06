import assert from 'node:assert/strict';
import { test } from 'node:test';
import { duplicateItemName } from './itemNames.ts';

const items = [
  { item_id: 'a', name: 'Pikachu' },
  { item_id: 'b', name: 'Raichu' },
];

test('an exact name is a duplicate', () => {
  assert.equal(duplicateItemName(items, 'Pikachu'), true);
});

test('casing and surrounding whitespace do not matter', () => {
  assert.equal(duplicateItemName(items, '  PIKACHU '), true);
  assert.equal(duplicateItemName(items, 'pikachu'), true);
});

test('the edited item is excluded from its own check', () => {
  assert.equal(duplicateItemName(items, 'Pikachu', 'a'), false);
  assert.equal(duplicateItemName(items, 'pikachu', 'a'), false);
});

test('a unique name is accepted', () => {
  assert.equal(duplicateItemName(items, 'Bulbasaur'), false);
  assert.equal(duplicateItemName([], 'Pikachu'), false);
});
