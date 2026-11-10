import type { ListColor, ListIcon } from '../design-system/tokens/colors';
import { api } from './api';
import type { Item } from './itemsService';

export type ListRankingMode = 'rank' | 'score';

export interface ListSimple {
  list_id: string;
  title: string;
  description: string | null;
  color: ListColor | null;
  icon: ListIcon | null;
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
}

export type ListMetadataPatch = Partial<
  Pick<
    ListCreatePayload,
    'title' | 'description' | 'color' | 'icon' | 'ranking_mode'
  >
>;

export interface ListOptionsInput {
  title: string;
  ranking_mode: ListRankingMode;
  color: ListColor | null;
  icon: ListIcon | null;
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

const metadataForm = (metadata: object): FormData => {
  const form = new FormData();
  form.append('metadata', JSON.stringify(metadata));
  return form;
};

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
    token: string
  ): Promise<ListMetadata> =>
    api
      .post<ListMetadata>('/api/lists/', metadataForm(payload), token)
      .then((list) => requireRankingMode(list)),
  updateListMetadata: (
    listId: string,
    metadata: ListMetadataPatch,
    token: string
  ): Promise<ListMetadata> =>
    api
      .put<ListMetadata>(`/api/lists/${listId}`, metadataForm(metadata), token)
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
