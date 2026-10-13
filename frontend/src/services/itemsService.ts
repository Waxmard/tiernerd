import { api } from './api';

export type TierSet = 'good' | 'mid' | 'bad';
export type ComparisonStatus =
  | 'active'
  | 'ready_to_commit'
  | 'completed'
  | 'cancelled';

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
  status: ComparisonStatus;
  tier_set: TierSet;
  revision: number;
  comparisons_answered: number;
  comparison_limit: number;
  can_undo: boolean;
  discard_on_cancel: boolean;
  is_stale: boolean;
  item: Item;
  current_comparison: {
    reference_item: Item;
    target_item: Item;
  } | null;
  preview: {
    score: number;
    rank: number;
    ranked_count: number;
    tier_set: TierSet;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface CreateItemRequest {
  name: string;
  tier_set: TierSet;
  description?: string;
  image_url?: string;
}

export interface UpdateItemRequest {
  name?: string;
  description?: string | null;
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

  getComparison: (
    itemId: string,
    token: string
  ): Promise<ComparisonSession | null> =>
    api.get<ComparisonSession | null>(
      `/api/items/items/${itemId}/comparison-session`,
      token
    ),

  startComparison: (
    itemId: string,
    tierSet: TierSet,
    restart: boolean,
    revision: number | null,
    token: string
  ): Promise<ComparisonSession> =>
    api.post<ComparisonSession>(
      `/api/items/items/${itemId}/comparison-session`,
      { tier_set: tierSet, restart, revision },
      token
    ),

  getComparisonStatus: (
    sessionId: string,
    token: string
  ): Promise<ComparisonSession> =>
    api.get<ComparisonSession>(
      `/api/items/comparison/${sessionId}/status`,
      token
    ),

  submitComparison: (
    sessionId: string,
    result: 'better' | 'worse',
    revision: number,
    token: string
  ): Promise<ComparisonSession> =>
    api.post<ComparisonSession>(
      `/api/items/comparison/result?session_id=${encodeURIComponent(sessionId)}`,
      { result, revision },
      token
    ),

  undoComparison: (
    sessionId: string,
    revision: number,
    token: string
  ): Promise<ComparisonSession> =>
    api.post<ComparisonSession>(
      `/api/items/comparison/${sessionId}/undo`,
      { revision },
      token
    ),

  commitComparison: (
    sessionId: string,
    revision: number,
    token: string
  ): Promise<ComparisonSession> =>
    api.post<ComparisonSession>(
      `/api/items/comparison/${sessionId}/commit`,
      { revision },
      token
    ),

  cancelComparison: (sessionId: string, token: string): Promise<void> =>
    api.delete<void>(`/api/items/comparison/${sessionId}`, token),

  deleteItem: (itemId: string, token: string): Promise<void> =>
    api.delete<void>(`/api/items/items/${itemId}`, token),
};
