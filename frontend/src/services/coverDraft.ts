import type { ListCover } from '../design-system/tokens/colors';
import type { CoverDraft, ListPhoto } from './listCoversService';

export type CoverPhotoSelection =
  | { source: 'unsplash'; id: string }
  | { source: 'upload'; id?: string };

export function coverSelectionFromDraft(draft: CoverDraft): {
  cover: ListCover | null;
  cover_photo: CoverPhotoSelection | null;
} {
  if (draft.kind === 'landscape')
    return { cover: 'landscape', cover_photo: null };
  if (draft.kind === 'unsplash') {
    return {
      cover: null,
      cover_photo: { source: 'unsplash', id: draft.photo.id },
    };
  }
  if (draft.kind === 'persisted') {
    return {
      cover: null,
      cover_photo: { source: draft.photo.source, id: draft.photo.id },
    };
  }
  if (draft.kind === 'local') {
    return { cover: null, cover_photo: { source: 'upload' } };
  }
  return { cover: null, cover_photo: null };
}

export function listFormData(metadata: object, draft?: CoverDraft): FormData {
  const form = new FormData();
  form.append('metadata', JSON.stringify(metadata));
  if (draft?.kind === 'local') {
    if (!draft.blob) {
      throw new Error('The selected photo is unavailable. Choose it again.');
    }
    form.append('file', draft.blob, 'cover.jpg');
  }
  return form;
}

export function coverDraftMatchesSaved(
  draft: CoverDraft,
  cover: ListCover | null,
  photo: ListPhoto | null
): boolean {
  switch (draft.kind) {
    case 'none':
      return !cover && !photo;
    case 'landscape':
      return cover === 'landscape' && !photo;
    case 'persisted':
      return (
        photo !== null &&
        photo.source === draft.photo.source &&
        photo.id === draft.photo.id
      );
    case 'unsplash':
      return photo?.source === 'unsplash' && photo.id === draft.photo.id;
    case 'local':
      return false;
  }
}
