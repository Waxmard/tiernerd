import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Emoji, Input } from '../design-system/components';
import type { ListColor } from '../design-system/tokens/colors';
import { useAuth } from '../providers/AuthContext';
import { useNotifyWhenOnline, useSync } from '../providers/SyncProvider';
import { ApiError, getApiErrorMessage } from '../services/apiError';
import {
  type CoverDraft,
  type CoverSearchResult,
  getCoverSearchAvailability,
  type ListPhoto,
  pickLocalCover,
  searchCoverPhotos,
} from '../services/listCoversService';
import { ListPhotoCover, PhotoAttribution } from './ListPhotoCover';

export function releaseCoverDraft(draft: CoverDraft) {
  if (draft.kind !== 'local') return;
  if (draft.uri.startsWith('blob:')) URL.revokeObjectURL(draft.uri);
  const blob = draft.blob as (Blob & { close?: () => void }) | undefined;
  blob?.close?.();
}

function searchErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 429) {
    return 'Too many photo searches. Please wait and try again.';
  }
  if (error instanceof ApiError && error.status === 503) {
    return 'Photo search is unavailable right now. Please try again later.';
  }
  return getApiErrorMessage(error, 'Unable to load photos. Please try again.');
}

export function ListCoverPicker({
  value,
  onChange,
  color,
  listId,
  disabled = false,
  onBusyChange,
}: {
  value: CoverDraft;
  onChange: (value: CoverDraft) => void;
  color: ListColor | null;
  listId?: string;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const { token } = useAuth();
  const { isOffline } = useSync();
  const notify = useNotifyWhenOnline();
  const [searchView, setSearchView] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CoverSearchResult[]>([]);
  const [resultsQuery, setResultsQuery] = useState<string | null>(null);
  const [emptyQuery, setEmptyQuery] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchAvailable, setSearchAvailable] = useState(false);
  const [picking, setPicking] = useState(false);
  const mountedRef = useRef(true);
  const availabilityRequestRef = useRef(0);
  const searchRequestRef = useRef(0);
  const pickerRequestRef = useRef(0);
  const pickingRef = useRef(false);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      searchRequestRef.current += 1;
      pickerRequestRef.current += 1;
    };
  }, []);

  const checkAvailability = useCallback(async () => {
    const request = ++availabilityRequestRef.current;
    if (!token) {
      setSearchAvailable(false);
      return;
    }
    setSearchAvailable(false);
    try {
      const enabled = await getCoverSearchAvailability(token);
      if (request === availabilityRequestRef.current)
        setSearchAvailable(enabled);
    } catch {
      if (request === availabilityRequestRef.current)
        notify('Unable to check photo search availability.');
    }
  }, [notify, token]);

  useEffect(() => {
    void checkAvailability();
    return () => {
      availabilityRequestRef.current += 1;
    };
  }, [checkAvailability]);

  const invalidateSearch = () => {
    searchRequestRef.current += 1;
    setSearching(false);
  };

  const search = async (nextPage: number) => {
    const term = nextPage === 1 ? query.trim() : resultsQuery;
    if (!term) return;
    if (!token) {
      notify('Sign in to search photos.');
      return;
    }
    const request = ++searchRequestRef.current;
    setSearching(true);
    setEmptyQuery(null);
    try {
      const response = await searchCoverPhotos(term, nextPage, token);
      if (!mountedRef.current || request !== searchRequestRef.current) return;
      if (nextPage === 1 && response.results.length === 0) {
        setEmptyQuery(term);
      } else {
        setResults((previous) =>
          nextPage === 1 ? response.results : [...previous, ...response.results]
        );
        setResultsQuery(term);
        setPage(nextPage);
        setHasMore(response.has_more);
      }
    } catch (err) {
      if (mountedRef.current && request === searchRequestRef.current) {
        notify(searchErrorMessage(err));
      }
    } finally {
      if (mountedRef.current && request === searchRequestRef.current) {
        setSearching(false);
      }
    }
  };

  const chooseLocal = async () => {
    if (disabled || pickingRef.current) return;
    pickingRef.current = true;
    const request = ++pickerRequestRef.current;
    onBusyChange(true);
    setPicking(true);
    try {
      const picked = await pickLocalCover();
      if (!picked) return;
      if (
        !mountedRef.current ||
        request !== pickerRequestRef.current ||
        disabledRef.current
      ) {
        releaseCoverDraft(picked);
        return;
      }
      onChange(picked);
    } catch (err) {
      if (mountedRef.current && request === pickerRequestRef.current) {
        notify(
          err instanceof Error && err.message
            ? err.message
            : 'Unable to choose a photo.'
        );
      }
    } finally {
      if (mountedRef.current && request === pickerRequestRef.current) {
        pickingRef.current = false;
        setPicking(false);
        onBusyChange(false);
      }
    }
  };

  const previewPhoto: ListPhoto | null =
    value.kind === 'persisted'
      ? value.photo
      : value.kind === 'unsplash'
        ? { ...value.photo, source: 'unsplash' }
        : null;
  const attribution = previewPhoto?.source === 'unsplash' ? previewPhoto : null;
  const description =
    value.kind === 'none'
      ? 'No cover selected'
      : value.kind === 'landscape'
        ? 'Landscape cover selected'
        : value.kind === 'local'
          ? 'Device photo selected'
          : previewPhoto?.source === 'upload'
            ? 'Uploaded photo selected'
            : 'Photo selected';
  const inactive = disabled || picking;
  const photoTabsDisabled = inactive || isOffline;
  const options: {
    label: string;
    emoji: string;
    selected: boolean;
    disabled?: boolean;
    onPress: () => void;
  }[] = [
    {
      label: 'None',
      emoji: '🚫',
      selected: value.kind === 'none',
      onPress: () => {
        onChange({ kind: 'none' });
      },
    },
    {
      label: 'Landscape',
      emoji: '🏞️',
      selected: value.kind === 'landscape',
      onPress: () => {
        onChange({ kind: 'landscape' });
      },
    },
    ...(searchAvailable
      ? [
          {
            label: 'Search photos',
            emoji: '🔍',
            selected: previewPhoto?.source === 'unsplash',
            disabled: photoTabsDisabled,
            onPress: () => {
              setSearchView(true);
            },
          },
        ]
      : []),
    {
      label: 'Choose from device',
      emoji: '📷',
      selected: value.kind === 'local' || previewPhoto?.source === 'upload',
      disabled: photoTabsDisabled,
      onPress: () => void chooseLocal(),
    },
  ];
  const showResults = resultsQuery !== null;
  const previousResults = resultsQuery !== query.trim() || emptyQuery !== null;

  return (
    <View className="gap-3">
      {searchView ? (
        <>
          <Input
            emoji="🔍"
            label="Search photos"
            placeholder="Search by subject"
            maxLength={100}
            value={query}
            onChangeText={(text) => {
              invalidateSearch();
              setQuery(text);
              setEmptyQuery(null);
            }}
            editable={!inactive}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          <View className="flex-row flex-wrap gap-2">
            <Button
              title="Search"
              onPress={() => void search(1)}
              disabled={inactive || !query.trim()}
            />
            <Button
              title="Back to cover"
              variant="text"
              disabled={inactive}
              onPress={() => {
                invalidateSearch();
                setSearchView(false);
              }}
            />
          </View>
          {searching ? (
            <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
              Searching photos…
            </Text>
          ) : null}
          {emptyQuery ? (
            <Text
              accessibilityLiveRegion="polite"
              className="text-body-small text-ink-muted dark:text-ink-muted-dark"
            >
              No photos found for “{emptyQuery}”. Try another search.
            </Text>
          ) : null}
          {showResults ? (
            <>
              <Text
                accessibilityLiveRegion="polite"
                className="text-body-small text-ink-muted dark:text-ink-muted-dark"
              >
                {previousResults ? 'Previous results for' : 'Results for'} “
                {resultsQuery}”: {results.length}{' '}
                {results.length === 1 ? 'photo' : 'photos'}
              </Text>
              <View className="flex-row flex-wrap justify-between gap-y-4">
                {results.map((photo, index) => (
                  <View
                    key={photo.id}
                    style={{ width: '48%' }}
                    className="gap-1"
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Select photo ${index + 1} by ${photo.photographer_name}`}
                      accessibilityState={{ disabled: inactive }}
                      disabled={inactive}
                      onPress={() => {
                        invalidateSearch();
                        onChange({ kind: 'unsplash', photo });
                        setSearchView(false);
                      }}
                    >
                      <ListPhotoCover
                        photo={{
                          ...photo,
                          source: 'unsplash',
                          url: photo.thumbnail_url,
                        }}
                        className="w-full h-24 rounded-[10px] overflow-hidden"
                      />
                    </Pressable>
                    <PhotoAttribution photo={photo} disabled={disabled} />
                  </View>
                ))}
              </View>
              {hasMore && resultsQuery === query.trim() && !emptyQuery ? (
                <Button
                  title="Load more"
                  variant="secondary"
                  onPress={() => void search(page + 1)}
                  disabled={inactive || searching}
                />
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        <>
          <View className="flex-row flex-wrap gap-2">
            {options.map((option) => {
              const blocked = inactive || option.disabled === true;
              return (
                <Pressable
                  key={option.label}
                  accessibilityRole="button"
                  accessibilityLabel={`Cover ${option.label}`}
                  accessibilityState={{
                    selected: option.selected,
                    disabled: blocked,
                  }}
                  disabled={blocked}
                  onPress={option.onPress}
                  className={[
                    'min-w-[44%] flex-1 min-h-11 flex-row items-center justify-center gap-1 rounded-[10px] border px-3 py-2',
                    option.selected
                      ? 'border-accent dark:border-accent-dark bg-accent-tint dark:bg-accent-tint-dark'
                      : 'border-control dark:border-control-dark bg-surface dark:bg-surface-dark',
                  ].join(' ')}
                >
                  <Emoji symbol={option.emoji} size={16} dimmed={blocked} />
                  <Text
                    className={[
                      'text-body-small font-semibold text-center',
                      option.selected
                        ? 'text-accent-text dark:text-accent-text-dark'
                        : 'text-ink-muted dark:text-ink-muted-dark',
                    ].join(' ')}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {isOffline ? (
            <Text
              accessibilityLiveRegion="polite"
              className="text-body-small text-ink-muted dark:text-ink-muted-dark"
            >
              Photo covers need a connection.
            </Text>
          ) : null}
          <Text
            accessibilityLiveRegion="polite"
            className="text-body-small text-ink-muted dark:text-ink-muted-dark"
          >
            {description}
          </Text>
          {value.kind !== 'none' ? (
            <ListPhotoCover
              cover={value.kind === 'landscape' ? 'landscape' : null}
              photo={previewPhoto}
              listId={listId}
              localUri={value.kind === 'local' ? value.uri : undefined}
              color={color}
              className="h-28 rounded-xl overflow-hidden"
            />
          ) : null}
          {attribution ? (
            <PhotoAttribution photo={attribution} disabled={disabled} />
          ) : null}
          {picking ? (
            <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
              Preparing photo…
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}
