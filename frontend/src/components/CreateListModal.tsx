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
import { MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH } from '../config/limits';
import { BaseModalContent, Emoji, Input } from '../design-system/components';
import { type ListIcon, palette } from '../design-system/tokens/colors';
import { useAuth } from '../providers/AuthContext';
import { useNotifyWhenOnline, useSync } from '../providers/SyncProvider';
import { useTheme } from '../providers/ThemeProvider';
import { getApiErrorMessage } from '../services/apiError';
import type {
  ListCreatePayload,
  ListRankingMode,
  ListSimple,
} from '../services/listsService';
import { localLibrary } from '../services/localLibrary';
import { newId } from '../utils/id';
import { EmojiPickerField } from './EmojiPicker';
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

const MULTILINE_INPUT_STYLE = { textAlignVertical: 'top' } as const;

type CreateListView = 'overview' | 'description' | 'emoji' | 'ranking-mode';

export const CreateListContent = forwardRef<
  CreateListContentHandle,
  CreateListContentProps
>(function CreateListContent({ onClose, onSuccess }, ref) {
  const { user, token } = useAuth();
  const { mutate } = useSync();
  const notify = useNotifyWhenOnline();
  const { scheme } = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState<ListIcon | null>(null);
  const [rankingMode, setRankingMode] = useState<ListRankingMode>('score');
  const [view, setView] = useState<CreateListView>('overview');
  const [isLoading, setIsLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const titleRef = useRef<TextInputInstance>(null);
  const hasVisitedOptionalFieldRef = useRef(false);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (fieldError) titleRef.current?.focus();
  }, [fieldError]);

  const clearForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setIcon(null);
    setRankingMode('score');
    setView('overview');
    setFieldError(null);
  }, []);

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

  const openEmoji = () => {
    hasVisitedOptionalFieldRef.current = true;
    setView('emoji');
  };

  const returnToOverview = () => setView('overview');

  const handleCreate = async () => {
    if (loadingRef.current) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFieldError('Title is required');
      return;
    }
    if (Array.from(trimmedTitle).length > MAX_TITLE_LENGTH) {
      setFieldError(`Title must be ${MAX_TITLE_LENGTH} characters or less`);
      return;
    }
    if (!token || !user) {
      notify('Authentication required');
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
      icon,
      ranking_mode: rankingMode,
    };
    const localList: ListSimple = {
      ...payload,
      created_at: now,
      updated_at: now,
      item_count: 0,
    };
    try {
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
      emoji={
        view === 'overview'
          ? '📋'
          : view === 'description'
            ? '📝'
            : view === 'emoji'
              ? '😀'
              : '🏆'
      }
      title={
        view === 'overview'
          ? 'Create New List'
          : view === 'description'
            ? 'Description'
            : view === 'emoji'
              ? 'List emoji'
              : 'Ranking mode'
      }
      isLoading={isLoading}
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
            showCount
            editable={!isLoading}
            autoFocus={!hasVisitedOptionalFieldRef.current}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Description: ${description.trim() || 'Not set'}`}
            accessibilityHint="Edit the list description"
            accessibilityState={{ disabled: isLoading }}
            disabled={isLoading}
            onPress={openDescription}
            className="flex-row min-h-11 items-center gap-3 border border-control dark:border-control-dark rounded-[10px] px-3 py-2 mb-4"
          >
            <Emoji symbol="📝" size={20} />
            <View className="flex-1 min-w-0">
              <Text className="text-body-medium font-semibold text-ink dark:text-ink-dark">
                Description
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
            accessibilityLabel={`Emoji: ${icon ?? 'default'}`}
            accessibilityHint="Choose list emoji"
            accessibilityState={{ disabled: isLoading }}
            disabled={isLoading}
            onPress={openEmoji}
            className="flex-row min-h-11 items-center gap-3 border border-control dark:border-control-dark rounded-[10px] px-3 py-2 mb-4"
          >
            <Emoji symbol="😀" size={20} />
            <View className="flex-1 min-w-0">
              <Text className="text-body-medium font-semibold text-ink dark:text-ink-dark">
                Emoji
              </Text>
              <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
                {icon ?? 'Default emoji'}
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
          label="Description"
          maxLength={MAX_DESCRIPTION_LENGTH}
          showCount
          placeholder="Add a description"
          value={description}
          onChangeText={setDescription}
          multiline
          editable={!isLoading}
          autoFocus
          inputClassName="text-[16px]"
          style={MULTILINE_INPUT_STYLE}
        />
      ) : view === 'ranking-mode' ? (
        <RankingModeSelector
          value={rankingMode}
          onChange={setRankingMode}
          disabled={isLoading}
        />
      ) : (
        <EmojiPickerField
          label="List emoji"
          value={icon}
          onChange={setIcon}
          suggestFor={{ name: title, kind: 'list', description }}
          disabled={isLoading}
        />
      )}
    </BaseModalContent>
  );
});
