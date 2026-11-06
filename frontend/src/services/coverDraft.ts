import type { ListCover } from '../design-system/tokens/colors';
import type { CoverDraft, ListPhoto } from './listCoversService';

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
