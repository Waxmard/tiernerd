import { api } from './api';
import type { Item } from './itemsService';

export interface ListSimple {
  list_id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  item_count: number;
}

export const listsService = {
  getLists: (token: string) => api.get<ListSimple[]>('/api/lists/', token),
  getListItems: (listId: string, token: string) =>
    api.get<Item[]>(`/api/lists/${listId}/items`, token),
  createList: (name: string, description: string, token: string) =>
    api.post<ListSimple>(
      `/api/lists/?name=${encodeURIComponent(
        name
      )}&description=${encodeURIComponent(description)}`,
      undefined,
      token
    ),
  deleteList: (listId: string, token: string) =>
    api.delete<void>(`/api/lists/${listId}`, token),
};
