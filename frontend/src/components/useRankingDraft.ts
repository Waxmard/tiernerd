import { useEffect, useRef } from 'react';
import type { Item } from '../services/itemsService';
import { loadDraft } from '../services/rankingDraftStore';
import { isDraftCurrent, type RankingSession } from '../services/rankingEngine';

export function useRankingDraft({
  userId,
  listId,
  items,
  enabled,
  onResume,
}: {
  userId: string | null;
  listId: string;
  items: Item[];
  enabled: boolean;
  onResume: (session: RankingSession) => void;
}): void {
  const resumedRef = useRef<string | null>(null);
  const onResumeRef = useRef(onResume);
  onResumeRef.current = onResume;

  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    void loadDraft(userId).then((draft) => {
      if (cancelled || !draft || draft.listId !== listId) return;
      const rankedBestFirst = items
        .filter(
          (item) => item.position !== null && item.item_id !== draft.itemId
        )
        .map((item) => item.item_id);
      if (
        !items.some((item) => item.item_id === draft.itemId) ||
        !isDraftCurrent(draft, draft.itemId, listId, rankedBestFirst)
      )
        return;
      const key = `${listId}:${draft.itemId}`;
      if (resumedRef.current === key) return;
      resumedRef.current = key;
      onResumeRef.current(draft);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, items, listId, userId]);
}
