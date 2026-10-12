import { api } from './api';

export type TierSet = 'good' | 'mid' | 'bad';

export interface Item {
  item_id: string;
  list_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  rating: number | null;
  position: string | null;
  tier_set: TierSet | null;
  created_at: string;
  updated_at: string;
}

export interface ComparisonSession {
  session_id: string;
  list_id: string;
  item_id: string;
  current_comparison: {
    reference_item: Item;
    target_item: Item;
  } | null;
  is_complete: boolean;
}

export interface CreateItemRequest {
  name: string;
  tier_set: TierSet;
  description?: string;
  image_url?: string;
}

export interface UpdateItemRequest {
  name?: string;
  description?: string;
}

export type CreateItemResponse = Item | ComparisonSession;

export const isComparisonSession = (
  response: CreateItemResponse
): response is ComparisonSession => 'session_id' in response;

export const itemsService = {
  createItem: (
    listTitle: string,
    itemData: CreateItemRequest,
    token: string
  ): Promise<CreateItemResponse> =>
    api.post<CreateItemResponse>(
      `/api/items/?list_title=${encodeURIComponent(listTitle)}`,
      itemData,
      token
    ),

  updateItem: (
    itemId: string,
    itemData: UpdateItemRequest,
    token: string
  ): Promise<Item> =>
    api.put<Item>(`/api/items/items/${itemId}`, itemData, token),

  submitComparison: (
    sessionId: string,
    result: 'better' | 'worse',
    token: string
  ): Promise<ComparisonSession | null> =>
    api.post<ComparisonSession | null>(
      `/api/items/comparison/result?session_id=${encodeURIComponent(sessionId)}`,
      { result },
      token
    ),

  deleteItem: (itemId: string, token: string): Promise<void> =>
    api.delete<void>(`/api/items/items/${itemId}`, token),
};
