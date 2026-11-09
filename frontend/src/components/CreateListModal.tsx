import { Ionicons } from '@expo/vector-icons';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Pressable, Text, type TextInputInstance, View } from 'react-native';
import {
  BaseModalContent,
  Emoji,
  Input,
  SectionLabel,
} from '../design-system/components';
import {
  type ListColor,
  type ListIcon,
  palette,
} from '../design-system/tokens/colors';
import { useAuth } from '../providers/AuthContext';
import { useNotifyWhenOnline, useSync } from '../providers/SyncProvider';
import { useTheme } from '../providers/ThemeProvider';
import { getApiErrorMessage } from '../services/apiError';
import { coverSelectionFromDraft } from '../services/coverDraft';
import type { CoverDraft } from '../services/listCoversService';
import {
  COVER_NEEDS_CONNECTION,
  type ListCreatePayload,
  type ListRankingMode,
  type ListSimple,
  listsService,
} from '../services/listsService';
import { localLibrary } from '../services/localLibrary';
import { newId } from '../utils/id';
import {
  LIST_ICON_LABELS,
  ListColorPicker,
  ListIconPicker,
  SWATCH_CLASS,
} from './ImmersiveBoard';
import { ListCoverPicker, releaseCoverDraft } from './ListCoverPicker';
import { RankingModeSelector } from './ListRankingOptions';

export interface CreatedList {
  listId: string;
  title: string;
}

export interface CreateListContentHandle {
  requestClose: () => Promise<boolean>;
}

interface CreateListContentProps {
  onClose: () => void;
  onSuccess: (list: ListSimple) => void;
}

const MAX_TITLE_LENGTH = 100;

const MULTILINE_INPUT_STYLE = { textAlignVertical: 'top' } as const;

type CreateListView = 'overview' | 'description' | 'color' | 'ranking-mode';

export const CreateListContent = forwardRef<
  CreateListContentHandle,
  CreateListContentProps
>(function CreateListContent({ onClose, onSuccess }, ref) {
  const { user, token } = useAuth();
  const { mutate, isOffline } = useSync();
  const notify = useNotifyWhenOnline();
  const { scheme } = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<ListColor | null>(null);
  const [icon, setIcon] = useState<ListIcon | null>(null);
  const [coverDraft, setCoverDraft] = useState<CoverDraft>({ kind: 'none' });
  const [rankingMode, setRankingMode] = useState<ListRankingMode>('score');
  const [view, setView] = useState<CreateListView>('overview');
  const [isLoading, setIsLoading] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const titleRef = useRef<TextInputInstance>(null);
  const hasVisitedOptionalFieldRef = useRef(false);
  const loadingRef = useRef(false);
  const coverBusyRef = useRef(false);
  const coverDraftRef = useRef(coverDraft);
  const coverSessionRef = useRef(0);
  const coverSession = coverSessionRef.current;

  const handleCoverBusyChange = useCallback((busy: boolean) => {
    coverBusyRef.current = busy;
    setCoverBusy(busy);
  }, []);

  const changeCoverDraft = useCallback((draft: CoverDraft) => {
    if (coverDraftRef.current !== draft) {
      releaseCoverDraft(coverDraftRef.current);
    }
    coverDraftRef.current = draft;
    setCoverDraft(draft);
  }, []);

  const coverDescription =
    coverDraft.kind === 'none'
      ? 'No cover'
      : coverDraft.kind === 'landscape'
        ? 'Landscape cover'
        : coverDraft.kind === 'local'
          ? 'Device photo cover'
          : coverDraft.kind === 'persisted' &&
              coverDraft.photo.source === 'upload'
            ? 'Uploaded photo cover'
            : 'Photo cover';

  useEffect(() => () => releaseCoverDraft(coverDraftRef.current), []);

  useEffect(() => {
    if (fieldError) titleRef.current?.focus();
  }, [fieldError]);

  const clearForm = useCallback(() => {
    coverSessionRef.current += 1;
    setTitle('');
    setDescription('');
    setColor(null);
    setIcon(null);
    changeCoverDraft({ kind: 'none' });
    handleCoverBusyChange(false);
    setRankingMode('score');
    setView('overview');
    setFieldError(null);
  }, [changeCoverDraft, handleCoverBusyChange]);

  const requestClose = useCallback(async () => {
    if (loadingRef.current) return false;
    clearForm();
    onClose();
    return true;
  }, [clearForm, onClose]);

  useImperativeHandle(ref, () => ({ requestClose }), [requestClose]);

  const openDescription = () => {
    hasVisitedOptionalFieldRef.current = true;
    setView('description');
  };

  const openColor = () => {
    hasVisitedOptionalFieldRef.current = true;
    setView('color');
  };

  const returnToOverview = () => {
    if (coverBusyRef.current) return;
    coverSessionRef.current += 1;
    setView('overview');
  };

  const handleCreate = async () => {
    if (loadingRef.current || coverBusyRef.current) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFieldError('Title is required');
      return;
    }
    if (Array.from(trimmedTitle).length > MAX_TITLE_LENGTH) {
      setFieldError('Title must be 100 characters or less');
      return;
    }
    if (!token || !user) {
      notify('Authentication required');
      return;
    }
    if (isOffline && coverDraftRef.current.kind === 'local') {
      setFieldError(COVER_NEEDS_CONNECTION);
      return;
    }

    loadingRef.current = true;
    setIsLoading(true);
    setFieldError(null);
    const listId = newId();
    const now = new Date().toISOString();
    const payload: ListCreatePayload = {
      list_id: listId,
      title: trimmedTitle,
      description: description.trim(),
      color,
      icon,
      ranking_mode: rankingMode,
      ...coverSelectionFromDraft(coverDraftRef.current),
    };
    const localList: ListSimple = {
      ...payload,
      cover_photo: null,
      created_at: now,
      updated_at: now,
      item_count: 0,
    };
    try {
      if (coverDraftRef.current.kind === 'local') {
        const saved = await listsService.createList(
          payload,
          token,
          coverDraftRef.current
        );
        await localLibrary.applyLocalListCreate(user.id, {
          ...localList,
          cover: saved.cover,
          cover_photo: saved.cover_photo,
        });
        clearForm();
        onSuccess({
          ...localList,
          cover: saved.cover,
          cover_photo: saved.cover_photo,
        });
        return;
      }
      const outcome = await mutate(
        {
          id: newId(),
          createdAt: now,
          kind: 'list.create',
          listId,
          list: payload,
        },
        {
          applyLocal: () =>
            localLibrary.applyLocalListCreate(user.id, localList),
          rollbackLocal: () =>
            localLibrary.applyLocalListDelete(user.id, listId),
        }
      );
      if (outcome.status === 'rejected') {
        if (outcome.message.toLowerCase().includes('title')) {
          setFieldError(outcome.message);
        } else {
          notify(outcome.message);
        }
        return;
      }
      clearForm();
      onSuccess(localList);
    } catch (error) {
      notify(
        getApiErrorMessage(error, 'Failed to create list. Please try again.')
      );
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <BaseModalContent
      color={color}
      emoji={
        view === 'overview'
          ? '📋'
          : view === 'description'
            ? '📝'
            : view === 'color'
              ? '🎨'
              : '🏆'
      }
      title={
        view === 'overview'
          ? 'Create New List'
          : view === 'description'
            ? 'Description'
            : view === 'color'
              ? 'List appearance'
              : 'Ranking mode'
      }
      isLoading={isLoading || coverBusy}
      submitText={view === 'overview' ? 'Create' : 'Done'}
      closeText={view === 'overview' ? 'Cancel' : 'Back'}
      onClose={() => {
        if (view === 'overview') {
          void requestClose();
        } else {
          returnToOverview();
        }
      }}
      onSubmit={view === 'overview' ? handleCreate : returnToOverview}
    >
      {view === 'overview' ? (
        <>
          <Input
            emoji="🏷️"
            ref={titleRef}
            label="Title"
            placeholder="Enter list title"
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              setFieldError(null);
            }}
            error={fieldError ?? undefined}
            maxLength={MAX_TITLE_LENGTH}
            editable={!isLoading}
            autoFocus={!hasVisitedOptionalFieldRef.current}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Description (optional): ${description.trim() || 'Not set'}`}
            accessibilityHint="Edit the list description"
            accessibilityState={{ disabled: isLoading }}
            disabled={isLoading}
            onPress={openDescription}
            className="flex-row min-h-11 items-center gap-3 border border-control dark:border-control-dark rounded-[10px] px-3 py-2 mb-4"
          >
            <Emoji symbol="📝" size={20} />
            <View className="flex-1 min-w-0">
              <Text className="text-body-medium font-semibold text-ink dark:text-ink-dark">
                Description (optional)
              </Text>
              <Text
                numberOfLines={2}
                className="text-body-small text-ink-muted dark:text-ink-muted-dark"
              >
                {description.trim() || 'Not set'}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={palette[scheme]['ink-muted']}
              accessible={false}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Appearance (optional): ${color ?? 'No color'}, ${icon ? LIST_ICON_LABELS[icon] : 'default icon'}, ${coverDescription}`}
            accessibilityHint="Choose list color, icon, and cover"
            accessibilityState={{ disabled: isLoading }}
            disabled={isLoading}
            onPress={openColor}
            className="flex-row min-h-11 items-center gap-3 border border-control dark:border-control-dark rounded-[10px] px-3 py-2 mb-4"
          >
            <Emoji symbol="🎨" size={20} />
            <View className="flex-1 min-w-0">
              <Text className="text-body-medium font-semibold text-ink dark:text-ink-dark">
                Appearance (optional)
              </Text>
              <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
                {[
                  color ?? 'No color',
                  icon ? LIST_ICON_LABELS[icon] : 'Default icon',
                  coverDescription,
                ].join(' · ')}
              </Text>
            </View>
            {color ? (
              <View
                accessible={false}
                className={['w-4 h-4 rounded-full', SWATCH_CLASS[color]].join(
                  ' '
                )}
              />
            ) : null}
            <Ionicons
              name="chevron-forward"
              size={18}
              color={palette[scheme]['ink-muted']}
              accessible={false}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ranking mode: ${rankingMode === 'rank' ? 'Ranked positions' : 'Scores out of 10'}`}
            accessibilityHint="Choose ranking mode"
            accessibilityState={{ disabled: isLoading }}
            disabled={isLoading}
            onPress={() => {
              hasVisitedOptionalFieldRef.current = true;
              setView('ranking-mode');
            }}
            className="flex-row min-h-11 items-center gap-3 border border-control dark:border-control-dark rounded-[10px] px-3 py-2 mb-4"
          >
            <Emoji symbol={rankingMode === 'rank' ? '🏆' : '🎯'} size={20} />
            <View className="flex-1 min-w-0">
              <Text className="text-body-medium font-semibold text-ink dark:text-ink-dark">
                Ranking mode
              </Text>
              <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
                {rankingMode === 'rank'
                  ? 'Ranked positions'
                  : 'Scores out of 10'}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={palette[scheme]['ink-muted']}
              accessible={false}
            />
          </Pressable>
        </>
      ) : view === 'description' ? (
        <Input
          emoji="📝"
          label="Description (optional)"
          placeholder="Add a description"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={5}
          editable={!isLoading}
          autoFocus
          inputClassName="!min-h-[120px] text-[16px]"
          style={MULTILINE_INPUT_STYLE}
        />
      ) : view === 'ranking-mode' ? (
        <RankingModeSelector
          value={rankingMode}
          onChange={setRankingMode}
          disabled={isLoading}
        />
      ) : (
        <View className="gap-4">
          <SectionLabel emoji="🎨" label="Color" className="" />
          <ListColorPicker
            value={color}
            onChange={setColor}
            disabled={isLoading || coverBusy}
          />
          <SectionLabel emoji="😀" label="Icon" className="" />
          <ListIconPicker
            value={icon}
            onChange={setIcon}
            disabled={isLoading || coverBusy}
          />
          <SectionLabel emoji="🖼️" label="Cover" className="" />
          <ListCoverPicker
            key={coverSession}
            value={coverDraft}
            onChange={(draft) => {
              if (coverSessionRef.current === coverSession) {
                changeCoverDraft(draft);
              } else {
                releaseCoverDraft(draft);
              }
            }}
            color={color}
            disabled={isLoading}
            onBusyChange={(busy) => {
              if (coverSessionRef.current === coverSession) {
                handleCoverBusyChange(busy);
              }
            }}
          />
        </View>
      )}
    </BaseModalContent>
  );
});
