import { Ionicons } from '@expo/vector-icons';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Pressable, Text, type TextInput, View } from 'react-native';
import { BaseModalContent, Input } from '../design-system/components';
import {
  type ListColor,
  type ListCover,
  type ListIcon,
  palette,
} from '../design-system/tokens/colors';
import { useAuth } from '../providers/AuthContext';
import { useTheme } from '../providers/ThemeProvider';
import { ApiError, getApiErrorMessage } from '../services/apiError';
import { type ListRankingMode, listsService } from '../services/listsService';
import {
  LIST_ICON_LABELS,
  ListColorPicker,
  ListCoverPicker,
  ListIconPicker,
  SWATCH_CLASS,
} from './ImmersiveBoard';
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
  onSuccess: (list: CreatedList) => void;
}

const MAX_TITLE_LENGTH = 100;

const MULTILINE_INPUT_STYLE = { textAlignVertical: 'top' } as const;

type CreateListView = 'overview' | 'description' | 'color' | 'ranking-mode';

export const CreateListContent = forwardRef<
  CreateListContentHandle,
  CreateListContentProps
>(function CreateListContent({ onClose, onSuccess }, ref) {
  const { token } = useAuth();
  const { scheme } = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<ListColor | null>(null);
  const [icon, setIcon] = useState<ListIcon | null>(null);
  const [cover, setCover] = useState<ListCover | null>(null);
  const [rankingMode, setRankingMode] = useState<ListRankingMode>('score');
  const [view, setView] = useState<CreateListView>('overview');
  const [isLoading, setIsLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<TextInput>(null);
  const hasVisitedOptionalFieldRef = useRef(false);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (fieldError) titleRef.current?.focus();
  }, [fieldError]);

  const clearForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setColor(null);
    setIcon(null);
    setCover(null);
    setRankingMode('score');
    setView('overview');
    setFieldError(null);
    setError(null);
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

  const openColor = () => {
    hasVisitedOptionalFieldRef.current = true;
    setView('color');
  };

  const returnToOverview = () => {
    setView('overview');
  };

  const handleCreate = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFieldError('Title is required');
      setError(null);
      return;
    }
    if (Array.from(trimmedTitle).length > MAX_TITLE_LENGTH) {
      setFieldError('Title must be 100 characters or less');
      setError(null);
      return;
    }
    if (!token) {
      setError('Authentication required');
      return;
    }

    loadingRef.current = true;
    setIsLoading(true);
    setFieldError(null);
    setError(null);
    try {
      const createdList = await listsService.createList(
        trimmedTitle,
        description.trim(),
        color,
        rankingMode,
        token,
        icon,
        cover
      );
      clearForm();
      onSuccess({ listId: createdList.list_id, title: createdList.title });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFieldError(
          getApiErrorMessage(error, 'A list with this title already exists')
        );
      } else {
        setError(
          getApiErrorMessage(error, 'Failed to create list. Please try again.')
        );
      }
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <BaseModalContent
      title={
        view === 'overview'
          ? 'Create New List'
          : view === 'description'
            ? 'Description'
            : view === 'color'
              ? 'List appearance'
              : 'Ranking mode'
      }
      error={error}
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
            ref={titleRef}
            label="Title"
            placeholder="Enter list title"
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              setFieldError(null);
              setError(null);
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
            accessibilityLabel={`Appearance (optional): ${color ?? 'No color'}, ${icon ? LIST_ICON_LABELS[icon] : 'default icon'}, ${cover ? 'landscape cover' : 'no cover'}`}
            accessibilityHint="Choose list color, icon, and cover"
            accessibilityState={{ disabled: isLoading }}
            disabled={isLoading}
            onPress={openColor}
            className="flex-row min-h-11 items-center gap-3 border border-control dark:border-control-dark rounded-[10px] px-3 py-2 mb-4"
          >
            <View className="flex-1 min-w-0">
              <Text className="text-body-medium font-semibold text-ink dark:text-ink-dark">
                Appearance (optional)
              </Text>
              <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
                {[
                  color ?? 'No color',
                  icon ? LIST_ICON_LABELS[icon] : 'Default icon',
                  cover ? 'Landscape cover' : 'No cover',
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
          <Text className="text-body-medium font-semibold text-ink dark:text-ink-dark">
            Color
          </Text>
          <ListColorPicker
            value={color}
            onChange={setColor}
            disabled={isLoading}
          />
          <Text className="text-body-medium font-semibold text-ink dark:text-ink-dark">
            Icon
          </Text>
          <ListIconPicker
            value={icon}
            onChange={setIcon}
            disabled={isLoading}
          />
          <Text className="text-body-medium font-semibold text-ink dark:text-ink-dark">
            Cover
          </Text>
          <ListCoverPicker
            value={cover}
            onChange={setCover}
            disabled={isLoading}
          />
        </View>
      )}
    </BaseModalContent>
  );
});
