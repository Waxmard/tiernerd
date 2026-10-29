import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { Item } from '../services/itemsService';
import {
  buildListView,
  parseListView,
  restoreViewKey,
} from '../services/sessionRestore';

interface RestoredView {
  selectedItemId: string | null;
  offset: number;
}

interface UseListViewRestoreParams {
  userId: string | null;
  listId: string;
  items: Item[];
  itemsLoaded: boolean;
  selectedItemId: string | null;
  dismissedDetailsItemId: string | null;
  isDesktop: boolean;
  skipRestore: boolean;
  setSelectedItemId: (id: string | null) => void;
  scrollToOffset: (offset: number) => void;
}

export function useListViewRestore({
  userId,
  listId,
  items,
  itemsLoaded,
  selectedItemId,
  dismissedDetailsItemId,
  isDesktop,
  skipRestore,
  setSelectedItemId,
  scrollToOffset,
}: UseListViewRestoreParams) {
  const viewRestoreRef = useRef<RestoredView | null>(null);
  const [viewLoaded, setViewLoaded] = useState(false);
  const restoreOffsetRef = useRef<number | null>(null);
  const offsetRef = useRef(0);
  const viewSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistedSelectedId =
    !isDesktop &&
    selectedItemId !== null &&
    dismissedDetailsItemId === selectedItemId
      ? null
      : selectedItemId;
  const persistedSelectedIdRef = useRef(persistedSelectedId);
  persistedSelectedIdRef.current = persistedSelectedId;
  const skipRestoreRef = useRef(skipRestore);
  skipRestoreRef.current = skipRestore;

  useEffect(() => {
    setViewLoaded(false);
    viewRestoreRef.current = null;
    restoreOffsetRef.current = null;
    offsetRef.current = 0;
    if (!userId) return;
    let cancelled = false;
    AsyncStorage.getItem(restoreViewKey(userId))
      .catch(() => null)
      .then((raw) => {
        if (cancelled) return;
        const result = parseListView(raw, listId, Date.now());
        if (result && !skipRestoreRef.current) {
          viewRestoreRef.current = result;
          restoreOffsetRef.current = result.offset > 0 ? result.offset : null;
          offsetRef.current = result.offset;
        }
        setViewLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, listId]);

  useEffect(() => {
    if (!viewLoaded || !itemsLoaded || !viewRestoreRef.current) return;
    const id = viewRestoreRef.current.selectedItemId;
    viewRestoreRef.current = null;
    if (id !== null && items.some((item) => item.item_id === id))
      setSelectedItemId(id);
  }, [viewLoaded, itemsLoaded, items, setSelectedItemId]);

  const saveView = useCallback(
    (selected: string | null) => {
      if (!userId) return;
      AsyncStorage.setItem(
        restoreViewKey(userId),
        buildListView(
          { listId, selectedItemId: selected, offset: offsetRef.current },
          Date.now()
        )
      ).catch(() => {});
    },
    [userId, listId]
  );

  useEffect(() => {
    if (viewLoaded && !viewRestoreRef.current) saveView(persistedSelectedId);
  }, [viewLoaded, persistedSelectedId, saveView]);

  useEffect(
    () => () => {
      if (viewSaveTimerRef.current === null) return;
      clearTimeout(viewSaveTimerRef.current);
      saveView(persistedSelectedIdRef.current);
    },
    [saveView]
  );

  const clearRestoredOffset = useCallback(() => {
    restoreOffsetRef.current = null;
  }, []);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (restoreOffsetRef.current !== null) return;
      offsetRef.current = event.nativeEvent.contentOffset.y;
      clearTimeout(viewSaveTimerRef.current ?? undefined);
      viewSaveTimerRef.current = setTimeout(
        () => saveView(persistedSelectedIdRef.current),
        500
      );
    },
    [saveView]
  );

  useEffect(() => {
    if (!viewLoaded || !itemsLoaded) return;
    const offset = restoreOffsetRef.current;
    if (offset === null) return;
    restoreOffsetRef.current = null;
    scrollToOffset(offset);
  }, [viewLoaded, itemsLoaded, scrollToOffset]);

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      const offset = restoreOffsetRef.current;
      if (offset === null) return;
      scrollToOffset(offset);
      if (height > offset) restoreOffsetRef.current = null;
    },
    [scrollToOffset]
  );

  return { clearRestoredOffset, onScroll, onContentSizeChange };
}
