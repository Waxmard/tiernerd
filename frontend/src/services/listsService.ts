import type {
  ListColor,
  ListCover,
  ListIcon,
} from '../design-system/tokens/colors';
import { api } from './api';
import {
  type CoverPhotoSelection,
  coverSelectionFromDraft,
  listFormData,
} from './coverDraft';
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

export interface ListCreatePayload {
  list_id: string;
  title: string;
  description: string | null;
  color: ListColor | null;
  icon: ListIcon | null;
  ranking_mode: ListRankingMode;
  cover: ListCover | null;
  cover_photo: CoverPhotoSelection | null;
}

export type ListMetadataPatch = Partial<
  Pick<
    ListCreatePayload,
    | 'title'
    | 'description'
    | 'color'
    | 'icon'
    | 'cover'
    | 'cover_photo'
    | 'ranking_mode'
  >
>;

export type ListSummaryPatch = Omit<ListMetadataPatch, 'cover_photo'> & {
  cover_photo?: ListPhoto | null;
};

export interface ListOptionsInput {
  title: string;
  ranking_mode: ListRankingMode;
  color: ListColor | null;
  icon: ListIcon | null;
  coverDraft: CoverDraft;
}

export const INVALID_RANKING_MODE =
  'This API does not support list ranking modes. Update the backend.';

export const COVER_NEEDS_CONNECTION =
  'Cover uploads need a connection. Choose a color or icon instead.';

const requireRankingMode = <T extends ListMetadata>(list: T): T => {
  if (
    !list ||
    (list.ranking_mode !== 'rank' && list.ranking_mode !== 'score')
  ) {
    throw new Error(INVALID_RANKING_MODE);
  }
  return list;
};

export function listOptionsPayload(options: ListOptionsInput): {
  metadata: ListMetadataPatch;
  coverPhoto: ListPhoto | null;
} {
  const draft = options.coverDraft;
  return {
    metadata: {
      title: options.title,
      ranking_mode: options.ranking_mode,
      color: options.color,
      icon: options.icon,
      ...coverSelectionFromDraft(draft),
    },
    coverPhoto:
      draft.kind === 'persisted'
        ? draft.photo
        : draft.kind === 'unsplash'
          ? { ...draft.photo, source: 'unsplash' }
          : null,
  };
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
    payload: ListCreatePayload,
    token: string,
    draft?: CoverDraft
  ): Promise<ListMetadata> =>
    api
      .post<ListMetadata>('/api/lists/', listFormData(payload, draft), token)
      .then((list) => requireRankingMode(list)),
  updateListOptions: (
    listId: string,
    metadata: ListMetadataPatch,
    token: string,
    draft?: CoverDraft
  ): Promise<ListMetadata> =>
    api
      .put<ListMetadata>(
        `/api/lists/${listId}`,
        listFormData(metadata, draft),
        token
      )
      .then((list) => requireRankingMode(list)),
  updateListMetadata: (
    listId: string,
    metadata: ListMetadataPatch,
    token: string
  ): Promise<ListMetadata> =>
    api
      .put<ListMetadata>(`/api/lists/${listId}`, listFormData(metadata), token)
      .then((list) => requireRankingMode(list)),
  setRanking: (
    listId: string,
    itemId: string,
    gap: number,
    token: string
  ): Promise<Item[]> =>
    api.put<Item[]>(
      `/api/lists/${listId}/ranking`,
      { item_id: itemId, gap },
      token
    ),
  deleteList: (listId: string, token: string) =>
    api.delete<void>(`/api/lists/${listId}`, token),
};
