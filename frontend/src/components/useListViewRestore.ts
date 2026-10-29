import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

interface ViewRestoreState {
  identity: string;
  view: RestoredView | null;
  selectionCancelled: boolean;
  offsetCancelled: boolean;
  restoreOffset: number | null;
  offset: number;
  selectedId: string | null;
  active: boolean;
  loaded: boolean;
  saveTimer: ReturnType<typeof setTimeout> | null;
}

interface UseListViewRestoreParams {
  identity: string;
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
  identity,
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
  const stateRef = useRef<ViewRestoreState | null>(null);
  const persistedSelectedId =
    !isDesktop &&
    selectedItemId !== null &&
    dismissedDetailsItemId === selectedItemId
      ? null
      : selectedItemId;
  if (!stateRef.current || stateRef.current.identity !== identity) {
    stateRef.current = {
      identity,
      view: null,
      selectionCancelled: false,
      offsetCancelled: false,
      restoreOffset: null,
      offset: 0,
      selectedId: null,
      active: true,
      loaded: false,
      saveTimer: null,
    };
  } else {
    stateRef.current.selectedId = persistedSelectedId;
  }
  const state = stateRef.current;
  if (skipRestore) {
    state.selectionCancelled = true;
    state.offsetCancelled = true;
    state.view = null;
    state.restoreOffset = null;
  }
  const [loadedState, setLoadedState] = useState<ViewRestoreState | null>(null);
  const viewLoaded = loadedState === state;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    AsyncStorage.getItem(restoreViewKey(userId))
      .catch(() => null)
      .then((raw) => {
        if (cancelled || stateRef.current !== state) return;
        const result = parseListView(raw, listId, Date.now());
        if (result) {
          if (!state.selectionCancelled && result.selectedItemId !== null)
            state.view = result;
          if (!state.offsetCancelled) {
            state.restoreOffset = result.offset > 0 ? result.offset : null;
            state.offset = result.offset;
          }
        }
        state.loaded = true;
        setLoadedState(state);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, listId, state]);

  useEffect(() => {
    if (
      stateRef.current !== state ||
      !viewLoaded ||
      !itemsLoaded ||
      !state.view
    )
      return;
    const id = state.view.selectedItemId;
    if (
      id !== null &&
      items.some((item) => item.item_id === id) &&
      selectedItemId !== id
    ) {
      setSelectedItemId(id);
      return;
    }
    state.view = null;
  }, [
    viewLoaded,
    itemsLoaded,
    items,
    selectedItemId,
    setSelectedItemId,
    state,
  ]);

  const saveView = useCallback(
    (selected: string | null) => {
      if (
        !userId ||
        !state.active ||
        stateRef.current !== state ||
        !state.loaded ||
        state.view
      )
        return;
      AsyncStorage.setItem(
        restoreViewKey(userId),
        buildListView(
          { listId, selectedItemId: selected, offset: state.offset },
          Date.now()
        )
      ).catch(() => {});
    },
    [userId, listId, state]
  );

  useEffect(() => {
    if (viewLoaded && (itemsLoaded || skipRestore || !state.view))
      saveView(persistedSelectedId);
  }, [
    viewLoaded,
    persistedSelectedId,
    itemsLoaded,
    skipRestore,
    state,
    saveView,
  ]);

  useEffect(() => {
    state.active = true;
    return () => {
      if (state.saveTimer !== null) {
        clearTimeout(state.saveTimer);
        state.saveTimer = null;
        saveView(state.selectedId);
      }
      state.active = false;
    };
  }, [saveView, state]);

  const clearRestoredSelection = useCallback(() => {
    if (!state.active || stateRef.current !== state) return false;
    state.selectionCancelled = true;
    state.view = null;
    return true;
  }, [state]);

  const clearRestoredOffset = useCallback(() => {
    if (!state.active || stateRef.current !== state) return;
    state.offsetCancelled = true;
    state.restoreOffset = null;
  }, [state]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (
        !state.active ||
        stateRef.current !== state ||
        state.restoreOffset !== null
      )
        return;
      state.offset = event.nativeEvent.contentOffset.y;
      clearTimeout(state.saveTimer ?? undefined);
      state.saveTimer = setTimeout(() => {
        state.saveTimer = null;
        saveView(state.selectedId);
      }, 500);
    },
    [saveView, state]
  );

  const onScrollBeginDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      clearRestoredOffset();
      onScroll(event);
    },
    [clearRestoredOffset, onScroll]
  );

  useEffect(() => {
    if (stateRef.current !== state || !viewLoaded || !itemsLoaded) return;
    const offset = state.restoreOffset;
    if (offset === null) return;
    state.restoreOffset = null;
    scrollToOffset(offset);
  }, [viewLoaded, itemsLoaded, scrollToOffset, state]);

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      if (!state.active || stateRef.current !== state) return;
      const offset = state.restoreOffset;
      if (offset === null) return;
      scrollToOffset(offset);
      if (height > offset) state.restoreOffset = null;
    },
    [scrollToOffset, state]
  );

  return useMemo(
    () => ({
      clearRestoredSelection,
      clearRestoredOffset,
      onScrollBeginDrag,
      onScroll,
      onContentSizeChange,
    }),
    [
      clearRestoredSelection,
      clearRestoredOffset,
      onScrollBeginDrag,
      onScroll,
      onContentSizeChange,
    ]
  );
}
