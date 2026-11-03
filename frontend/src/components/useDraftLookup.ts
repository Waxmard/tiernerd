import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ComparisonSession,
  type Item,
  itemsService,
} from '../services/itemsService';
import { findNextDraftSession } from '../services/itemWorkspaceActions';

interface DraftLookupOptions {
  identity: string;
  items: Item[];
  itemsLoaded: boolean;
  token: string | null;
  enabled: boolean;
  selectedItemId: string | null;
  resolvedIds: RefObject<Set<string>>;
  onFound: (session: ComparisonSession) => void;
  onFailure: (item: Item) => void;
}

export function useDraftLookup(options: DraftLookupOptions) {
  const { identity, items, itemsLoaded, token, enabled, selectedItemId } =
    options;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const versionRef = useRef(0);
  const guardRef = useRef({ identity, items, enabled, selectedItemId });
  const guard = guardRef.current;
  if (
    guard.identity !== identity ||
    guard.items !== items ||
    guard.enabled !== enabled ||
    guard.selectedItemId !== selectedItemId
  ) {
    versionRef.current++;
    guardRef.current = { identity, items, enabled, selectedItemId };
  }
  const activeRef = useRef(false);
  const retryRef = useRef<{ identity: string } | null>(null);
  const [failure, setFailure] = useState<{
    identity: string;
    itemId: string;
  } | null>(null);
  const [retryingIdentity, setRetryingIdentity] = useState<string | null>(null);
  if (retryRef.current && retryRef.current.identity !== identity) {
    retryRef.current = null;
  }
  const retrying = retryingIdentity === identity;

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      versionRef.current++;
      retryRef.current = null;
    };
  }, []);
  const currentFailure =
    failure?.identity === identity &&
    items.some(
      (item) => item.item_id === failure.itemId && item.rating === null
    )
      ? failure
      : null;
  useEffect(() => {
    if (
      failure &&
      (failure.identity !== identity || (itemsLoaded && !currentFailure))
    )
      setFailure(null);
  }, [currentFailure, failure, identity, itemsLoaded]);

  const runLookup = useCallback(
    async (
      candidates: Item[],
      lookupToken: string,
      lookupIdentity: string,
      version: number,
      cancelled: () => boolean,
      retryItemId?: string
    ) => {
      const resolved = new Set(optionsRef.current.resolvedIds.current);
      const isCurrent = () =>
        activeRef.current &&
        !cancelled() &&
        versionRef.current === version &&
        optionsRef.current.identity === lookupIdentity &&
        optionsRef.current.enabled;
      if (!isCurrent()) return;
      let result: ComparisonSession | { failedItem: Item } | null;
      try {
        result = await findNextDraftSession(
          candidates,
          resolved,
          lookupToken,
          itemsService,
          isCurrent
        );
      } catch {
        const item = candidates.find(
          (candidate) =>
            candidate.rating === null && !resolved.has(candidate.item_id)
        );
        result = item ? { failedItem: item } : null;
      }
      if (!isCurrent()) return;
      for (const id of resolved) optionsRef.current.resolvedIds.current.add(id);
      if (result && 'failedItem' in result) {
        setFailure({
          identity: lookupIdentity,
          itemId: result.failedItem.item_id,
        });
        optionsRef.current.onFailure(result.failedItem);
      } else {
        if (retryItemId && (result || resolved.has(retryItemId)))
          setFailure(null);
        if (result) optionsRef.current.onFound(result);
      }
    },
    []
  );

  useEffect(() => {
    if (
      !enabled ||
      !token ||
      currentFailure ||
      !items.some(
        (item) =>
          item.rating === null && !options.resolvedIds.current.has(item.item_id)
      )
    )
      return;
    let cancelled = false;
    void runLookup(items, token, identity, versionRef.current, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [
    currentFailure,
    enabled,
    identity,
    items,
    options.resolvedIds,
    runLookup,
    token,
  ]);

  const retry = useCallback(() => {
    const current = optionsRef.current;
    if (
      !currentFailure ||
      !current.enabled ||
      !current.token ||
      current.selectedItemId !== currentFailure.itemId ||
      retryRef.current?.identity === current.identity
    )
      return;
    const item = current.items.find(
      (candidate) => candidate.item_id === currentFailure.itemId
    );
    if (!item) return;
    const attempt = { identity: current.identity };
    retryRef.current = attempt;
    setRetryingIdentity(current.identity);
    void runLookup(
      [item],
      current.token,
      current.identity,
      versionRef.current,
      () => false,
      item.item_id
    ).finally(() => {
      if (retryRef.current !== attempt) return;
      retryRef.current = null;
      if (activeRef.current)
        setRetryingIdentity((value) =>
          value === current.identity ? null : value
        );
    });
  }, [currentFailure, runLookup]);

  return {
    failedItemId: currentFailure?.itemId ?? null,
    isRetryingDraft: retrying,
    retryDraft: retry,
  };
}
