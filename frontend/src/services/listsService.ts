import { Platform } from 'react-native';
import type {
  ListColor,
  ListCover,
  ListIcon,
} from '../design-system/tokens/colors';
import { api } from './api';
import type { Item } from './itemsService';
import type { CoverDraft, ListPhoto } from './listCoversService';

export type ListRankingMode = 'rank' | 'score';

export interface ListSimple {
  list_id: string;
  title: string;
  description: string | null;
  color: ListColor | null;
  icon: ListIcon | null;
  cover: ListCover | null;
  cover_photo: ListPhoto | null;
  ranking_mode: ListRankingMode;
  created_at: string;
  updated_at: string;
  item_count: number;
}

export type ListMetadata = Omit<ListSimple, 'item_count'>;

export interface ListOptionsInput {
  ranking_mode: ListRankingMode;
  color: ListColor | null;
  icon: ListIcon | null;
  coverDraft: CoverDraft;
}

export const INVALID_RANKING_MODE =
  'This API does not support list ranking modes. Update the backend.';

const requireRankingMode = <T extends ListMetadata>(list: T): T => {
  if (
    !list ||
    (list.ranking_mode !== 'rank' && list.ranking_mode !== 'score')
  ) {
    throw new Error(INVALID_RANKING_MODE);
  }
  return list;
};

function listFormData(
  metadata: Record<string, unknown>,
  draft?: CoverDraft
): FormData {
  if (draft) {
    const coverPhoto =
      draft.kind === 'local'
        ? { source: 'upload' }
        : draft.kind === 'unsplash'
          ? { source: 'unsplash', id: draft.photo.id }
          : draft.kind === 'persisted'
            ? { source: draft.photo.source, id: draft.photo.id }
            : null;
    metadata = {
      ...metadata,
      cover: draft.kind === 'landscape' ? 'landscape' : null,
      cover_photo: coverPhoto,
    };
  }
  const form = new FormData();
  form.append('metadata', JSON.stringify(metadata));
  if (draft?.kind === 'local') {
    if (Platform.OS === 'web') {
      if (!draft.blob) {
        throw new Error('The selected photo is unavailable. Choose it again.');
      }
      form.append('file', draft.blob, 'cover.jpg');
    } else {
      if (!draft.uri.startsWith('file://')) {
        throw new Error('The selected photo is unavailable. Choose it again.');
      }
      form.append('file', {
        uri: draft.uri,
        type: 'image/jpeg',
        name: 'cover.jpg',
      } as unknown as Blob);
    }
  }
  return form;
}

export const listsService = {
  getLists: (token: string): Promise<ListSimple[]> =>
    api.get<ListSimple[]>('/api/lists/', token).then((lists) => {
      if (!Array.isArray(lists)) throw new Error(INVALID_RANKING_MODE);
      return lists.map((list) => requireRankingMode(list));
    }),
  getList: (listId: string, token: string): Promise<ListMetadata> =>
    api
      .get<ListMetadata>(`/api/lists/${listId}`, token)
      .then((list) => requireRankingMode(list)),
  getListItems: (listId: string, token: string) =>
    api.get<Item[]>(`/api/lists/${listId}/items`, token),
  createList: (
    name: string,
    description: string,
    color: ListColor | null,
    rankingMode: ListRankingMode,
    token: string,
    icon: ListIcon | null = null,
    coverDraft: CoverDraft = { kind: 'none' }
  ): Promise<ListMetadata> =>
    api
      .post<ListMetadata>(
        '/api/lists/',
        listFormData(
          { title: name, description, color, icon, ranking_mode: rankingMode },
          coverDraft
        ),
        token
      )
      .then((list) => requireRankingMode(list)),
  setRankingMode: (
    listId: string,
    rankingMode: ListRankingMode,
    token: string
  ): Promise<ListMetadata> =>
    api
      .put<ListMetadata>(
        `/api/lists/${listId}`,
        listFormData({ ranking_mode: rankingMode }),
        token
      )
      .then((list) => requireRankingMode(list)),
  updateListOptions: (
    listId: string,
    options: ListOptionsInput,
    token: string
  ): Promise<ListMetadata> =>
    api
      .put<ListMetadata>(
        `/api/lists/${listId}`,
        listFormData(
          {
            ranking_mode: options.ranking_mode,
            color: options.color,
            icon: options.icon,
          },
          options.coverDraft
        ),
        token
      )
      .then((list) => requireRankingMode(list)),
  deleteList: (listId: string, token: string) =>
    api.delete<void>(`/api/lists/${listId}`, token),
};
