import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Input } from '../design-system/components';
import type { ListColor } from '../design-system/tokens/colors';
import { useAuth } from '../providers/AuthContext';
import { ApiError, getApiErrorMessage } from '../services/apiError';
import {
  type CoverDraft,
  type CoverSearchResult,
  type ListPhoto,
  pickLocalCover,
  searchCoverPhotos,
} from '../services/listCoversService';
import { ListPhotoCover, PhotoAttribution } from './ListPhotoCover';

export function releaseCoverDraft(draft: CoverDraft) {
  if (draft.kind === 'local' && draft.uri.startsWith('blob:')) {
    URL.revokeObjectURL(draft.uri);
  }
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
  const [searchView, setSearchView] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CoverSearchResult[]>([]);
  const [resultsQuery, setResultsQuery] = useState<string | null>(null);
  const [emptyQuery, setEmptyQuery] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
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

  const invalidateSearch = () => {
    searchRequestRef.current += 1;
    setSearching(false);
  };

  const search = async (nextPage: number) => {
    const term = nextPage === 1 ? query.trim() : resultsQuery;
    if (!term) return;
    if (!token) {
      setError('Sign in to search photos.');
      return;
    }
    const request = ++searchRequestRef.current;
    setSearching(true);
    setError(null);
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
        setError(searchErrorMessage(err));
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
    setError(null);
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
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'Unable to choose a photo. Please try again.'
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
  const options = [
    {
      label: 'None',
      selected: value.kind === 'none',
      onPress: () => {
        setError(null);
        onChange({ kind: 'none' });
      },
    },
    {
      label: 'Landscape',
      selected: value.kind === 'landscape',
      onPress: () => {
        setError(null);
        onChange({ kind: 'landscape' });
      },
    },
    {
      label: 'Search photos',
      selected: previewPhoto?.source === 'unsplash',
      onPress: () => {
        setError(null);
        setSearchView(true);
      },
    },
    {
      label: 'Choose from device',
      selected: value.kind === 'local' || previewPhoto?.source === 'upload',
      onPress: () => void chooseLocal(),
    },
  ];
  const showResults =
    resultsQuery !== null &&
    (resultsQuery === query.trim() || error !== null || emptyQuery !== null);
  const previousResults = resultsQuery !== query.trim() || emptyQuery !== null;

  return (
    <View className="gap-3">
      {searchView ? (
        <>
          <Input
            label="Search photos"
            placeholder="Search by subject"
            maxLength={100}
            value={query}
            onChangeText={(text) => {
              invalidateSearch();
              setQuery(text);
              setError(null);
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
                setError(null);
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
          {error ? (
            <Text
              accessibilityRole="alert"
              className="text-body-small text-danger-text dark:text-danger-text-dark"
            >
              {error}
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
                        setError(null);
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
            {options.map((option) => (
              <Pressable
                key={option.label}
                accessibilityRole="button"
                accessibilityLabel={`Cover ${option.label}`}
                accessibilityState={{
                  selected: option.selected,
                  disabled: inactive,
                }}
                disabled={inactive}
                onPress={option.onPress}
                className={[
                  'min-w-[44%] flex-1 min-h-11 flex-row items-center justify-center rounded-[10px] border px-3 py-2',
                  option.selected
                    ? 'border-accent dark:border-accent-dark bg-accent-tint dark:bg-accent-tint-dark'
                    : 'border-control dark:border-control-dark bg-surface dark:bg-surface-dark',
                ].join(' ')}
              >
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
            ))}
          </View>
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
          {error ? (
            <Text
              accessibilityRole="alert"
              className="text-body-small text-danger-text dark:text-danger-text-dark"
            >
              {error}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}
