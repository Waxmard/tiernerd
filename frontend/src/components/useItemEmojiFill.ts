import { useCallback, useRef } from 'react';
import { useNotify } from '../providers/NotificationProvider';
import { useSync } from '../providers/SyncProvider';
import { aiService } from '../services/aiService';
import { getApiErrorMessage } from '../services/apiError';
import type { Item } from '../services/itemsService';
import { localLibrary } from '../services/localLibrary';
import { newId } from '../utils/id';

const FILL_ERROR = "Couldn't add emoji. Try again.";

export function useItemEmojiFill({
  userId,
  token,
  listId,
  listTitle,
  items,
  refresh,
}: {
  userId: string | null;
  token: string | null;
  listId: string;
  listTitle: string;
  items: Item[];
  refresh: () => Promise<unknown>;
}) {
  const { mutate, isOffline } = useSync();
  const notify = useNotify();
  const live = useRef({ userId, listId, items });
  live.current = { userId, listId, items };

  const autoFill = useCallback(
    async (item: Item): Promise<void> => {
      if (!userId || !token || isOffline) return;
      const isCurrent = () =>
        live.current.userId === userId && live.current.listId === listId;
      const [icon] = await aiService
        .suggestEmojis(
          {
            name: item.name,
            kind: 'item',
            description: item.description,
            listTitle,
          },
          token
        )
        .catch((): string[] => []);
      if (!icon || !isCurrent()) return;
      const current = live.current.items.find(
        (entry) => entry.item_id === item.item_id
      );
      if (!current || current.icon) return;
      const now = new Date().toISOString();
      await mutate(
        {
          id: newId(),
          createdAt: now,
          kind: 'item.update',
          listId,
          itemId: item.item_id,
          icon,
        },
        {
          applyLocal: () =>
            localLibrary.applyLocalItemIcon(
              userId,
              listId,
              item.item_id,
              icon,
              now
            ),
          rollbackLocal: () =>
            localLibrary.applyLocalItemIcon(
              userId,
              listId,
              item.item_id,
              null,
              now
            ),
        }
      );
      if (isCurrent()) await refresh();
    },
    [isOffline, listId, listTitle, mutate, refresh, token, userId]
  );

  const fillMissing = useCallback(async (): Promise<void> => {
    if (!token) return;
    const isCurrent = () =>
      live.current.userId === userId && live.current.listId === listId;
    let added = 0;
    let remaining = 0;
    try {
      let updated = 0;
      do {
        ({ updated, remaining } = await aiService.fillItemEmojis(
          listId,
          token
        ));
        added += updated;
        if (!isCurrent()) return;
        await refresh().catch(() => undefined);
      } while (updated > 0 && remaining > 0);
    } catch (err) {
      const message = getApiErrorMessage(err, FILL_ERROR);
      notify(
        added > 0
          ? `Added emoji to ${added} ${added === 1 ? 'item' : 'items'}. ${message}`
          : message,
        '⚠️'
      );
      return;
    }
    if (added === 0) {
      if (remaining > 0) notify(FILL_ERROR, '⚠️');
      return;
    }
    const count = `${added} ${added === 1 ? 'item' : 'items'}`;
    notify(
      remaining > 0
        ? `Added emoji to ${count}. ${remaining} still need one.`
        : `Added emoji to ${count}.`,
      '✨'
    );
  }, [listId, notify, refresh, token, userId]);

  return { autoFill, fillMissing };
}
