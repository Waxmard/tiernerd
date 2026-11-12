import { api } from './api';

export interface Item {
  item_id: string;
  list_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  icon: string | null;
  rating: number | null;
  manual_rating: number | null;
  position: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateItemRequest {
  name: string;
  description?: string;
  image_url?: string;
  icon?: string;
}

export interface UpdateItemRequest {
  name?: string;
  description?: string | null;
  manual_rating?: number | null;
  icon?: string | null;
}

export const itemsService = {
  createItem: (
    listId: string,
    itemData: CreateItemRequest & { item_id: string },
    token: string
  ): Promise<Item> =>
    api.post<Item>(
      `/api/items/?list_id=${encodeURIComponent(listId)}`,
      itemData,
      token
    ),

  updateItem: (
    itemId: string,
    itemData: UpdateItemRequest,
    token: string
  ): Promise<Item> =>
    api.put<Item>(`/api/items/items/${itemId}`, itemData, token),

  deleteItem: (itemId: string, token: string): Promise<void> =>
    api.delete<void>(`/api/items/items/${itemId}`, token),
};
