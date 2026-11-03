import type { ListColor } from '../design-system/tokens/colors';
import { api } from './api';
import type { Item } from './itemsService';

export type ListRankingMode = 'rank' | 'score';

export interface ListSimple {
  list_id: string;
  title: string;
  description: string | null;
  color: ListColor | null;
  ranking_mode: ListRankingMode;
  created_at: string;
  updated_at: string;
  item_count: number;
}

export type ListMetadata = Omit<ListSimple, 'item_count'>;

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
    token: string
  ): Promise<ListMetadata> =>
    api
      .post<ListMetadata>(
        `/api/lists/?name=${encodeURIComponent(name)}&description=${encodeURIComponent(description)}${color ? `&color=${color}` : ''}&ranking_mode=${rankingMode}`,
        undefined,
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
        { ranking_mode: rankingMode },
        token
      )
      .then((list) => requireRankingMode(list)),
  deleteList: (listId: string, token: string) =>
    api.delete<void>(`/api/lists/${listId}`, token),
};
