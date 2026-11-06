import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coverDraftMatchesSaved } from './coverDraft.ts';
import type { CoverSearchResult, ListPhoto } from './listCoversService.ts';

const upload: ListPhoto = { source: 'upload', id: 'shared-id' };
const unsplash: ListPhoto = {
  source: 'unsplash',
  id: 'shared-id',
  url: 'https://images.example/photo',
  photographer_name: 'Photographer',
  photographer_url: 'https://example.com/photographer',
  photo_url: 'https://example.com/photo',
};
const searchResult: CoverSearchResult = {
  id: 'shared-id',
  url: 'https://images.example/new-photo',
  thumbnail_url: 'https://images.example/thumbnail',
  photographer_name: 'Other name',
  photographer_url: 'https://example.com/other',
  photo_url: 'https://example.com/other-photo',
};

test('empty and landscape drafts match only their saved cover without a photo', () => {
  assert.equal(coverDraftMatchesSaved({ kind: 'none' }, null, null), true);
  assert.equal(
    coverDraftMatchesSaved({ kind: 'none' }, 'landscape', null),
    false
  );
  assert.equal(coverDraftMatchesSaved({ kind: 'none' }, null, upload), false);
  assert.equal(
    coverDraftMatchesSaved({ kind: 'landscape' }, 'landscape', null),
    true
  );
  assert.equal(
    coverDraftMatchesSaved({ kind: 'landscape' }, null, null),
    false
  );
  assert.equal(
    coverDraftMatchesSaved({ kind: 'landscape' }, 'landscape', upload),
    false
  );
});

test('persisted drafts match photo source and id, not metadata', () => {
  const draft = { kind: 'persisted', photo: upload } as const;
  assert.equal(coverDraftMatchesSaved(draft, null, upload), true);
  assert.equal(coverDraftMatchesSaved(draft, null, null), false);
  assert.equal(coverDraftMatchesSaved(draft, null, unsplash), false);
  assert.equal(
    coverDraftMatchesSaved(draft, null, { ...upload, id: 'other' }),
    false
  );
  assert.equal(
    coverDraftMatchesSaved({ kind: 'persisted', photo: unsplash }, null, {
      ...unsplash,
      photographer_name: 'Changed',
    }),
    true
  );
});

test('Unsplash search drafts match only saved Unsplash photos with the same id', () => {
  const draft = { kind: 'unsplash', photo: searchResult } as const;
  assert.equal(coverDraftMatchesSaved(draft, null, unsplash), true);
  assert.equal(coverDraftMatchesSaved(draft, null, null), false);
  assert.equal(coverDraftMatchesSaved(draft, null, upload), false);
  assert.equal(
    coverDraftMatchesSaved(draft, null, { ...unsplash, id: 'other' }),
    false
  );
});

test('local drafts never match a saved cover', () => {
  const draft = { kind: 'local', uri: 'file:///photo.jpg' } as const;
  assert.equal(coverDraftMatchesSaved(draft, null, null), false);
  assert.equal(coverDraftMatchesSaved(draft, 'landscape', null), false);
  assert.equal(coverDraftMatchesSaved(draft, null, upload), false);
});
