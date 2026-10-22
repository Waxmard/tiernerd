import { Ionicons } from '@expo/vector-icons';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Modal,
  Platform,
  Pressable,
  Text,
  type TextInput,
  View,
} from 'react-native';
import { BaseModalContent, Input } from '../design-system/components';
import {
  LIST_COLORS,
  type ListColor,
  palette,
} from '../design-system/tokens/colors';
import { useAuth } from '../providers/AuthContext';
import { useTheme } from '../providers/ThemeProvider';
import { ApiError, getApiErrorMessage } from '../services/apiError';
import { listsService } from '../services/listsService';

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

interface CreateListModalProps extends CreateListContentProps {
  visible: boolean;
}

const MAX_TITLE_LENGTH = 100;

const SWATCH_CLASS: Record<ListColor, string> = {
  blue: 'bg-list-blue-solid dark:bg-list-blue-solid-dark',
  teal: 'bg-list-teal-solid dark:bg-list-teal-solid-dark',
  amber: 'bg-list-amber-solid dark:bg-list-amber-solid-dark',
  pink: 'bg-list-pink-solid dark:bg-list-pink-solid-dark',
};

const MULTILINE_INPUT_STYLE = { textAlignVertical: 'top' } as const;

type FocusTarget = { focus?: () => void };
type CreateListView = 'overview' | 'description' | 'color';

export const CreateListContent = forwardRef<
  CreateListContentHandle,
  CreateListContentProps
>(function CreateListContent({ onClose, onSuccess }, ref) {
  const { token } = useAuth();
  const { scheme } = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<ListColor | null>(null);
  const [view, setView] = useState<CreateListView>('overview');
  const [isLoading, setIsLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);
  const descriptionSummaryRef = useRef<FocusTarget | null>(null);
  const colorSummaryRef = useRef<FocusTarget | null>(null);
  const colorRef = useRef<FocusTarget | null>(null);
  const returnFocusRef = useRef<'description' | 'color'>('description');
  const hasVisitedOptionalFieldRef = useRef(false);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (fieldError) titleRef.current?.focus();
  }, [fieldError]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (view === 'description') {
      requestAnimationFrame(() => descriptionRef.current?.focus());
    } else if (view === 'color') {
      requestAnimationFrame(() => colorRef.current?.focus?.());
    }
  }, [view]);

  const clearForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setColor(null);
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
    returnFocusRef.current = 'description';
    setView('description');
  };

  const openColor = () => {
    hasVisitedOptionalFieldRef.current = true;
    returnFocusRef.current = 'color';
    setView('color');
  };

  const returnToOverview = () => {
    setView('overview');
    if (Platform.OS === 'web') {
      requestAnimationFrame(() => {
        const target =
          returnFocusRef.current === 'description'
            ? descriptionSummaryRef.current
            : colorSummaryRef.current;
        target?.focus?.();
      });
    }
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
        token
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
            : 'List color'
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
            ref={(element) => {
              descriptionSummaryRef.current =
                element as unknown as FocusTarget | null;
            }}
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
            ref={(element) => {
              colorSummaryRef.current =
                element as unknown as FocusTarget | null;
            }}
            accessibilityRole="button"
            accessibilityLabel={`Color (optional): ${color ?? 'None'}`}
            accessibilityHint="Choose a list color"
            accessibilityState={{ disabled: isLoading }}
            disabled={isLoading}
            onPress={openColor}
            className="flex-row min-h-11 items-center gap-3 border border-control dark:border-control-dark rounded-[10px] px-3 py-2 mb-4"
          >
            <View className="flex-1 min-w-0">
              <Text className="text-body-medium font-semibold text-ink dark:text-ink-dark">
                Color (optional)
              </Text>
              <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
                {color ?? 'None'}
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
        </>
      ) : view === 'description' ? (
        <Input
          ref={descriptionRef}
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
      ) : (
        <View className="flex-row flex-wrap gap-3">
          {LIST_COLORS.map((hue) => {
            const selected = color === hue;
            return (
              <Pressable
                key={hue}
                ref={
                  hue === (color ?? LIST_COLORS[0])
                    ? (element) => {
                        colorRef.current =
                          element as unknown as FocusTarget | null;
                      }
                    : undefined
                }
                accessibilityRole="button"
                accessibilityLabel={`Color ${hue}`}
                accessibilityState={{ selected }}
                aria-pressed={selected}
                testID={`color-${hue}`}
                disabled={isLoading}
                onPress={() => setColor(selected ? null : hue)}
                className={[
                  'w-11 h-11 rounded-full items-center justify-center',
                  SWATCH_CLASS[hue],
                ].join(' ')}
              >
                {selected ? (
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={palette.list[hue][scheme]['on-solid']}
                    accessible={false}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </BaseModalContent>
  );
});

export const CreateListModal = ({
  visible,
  onClose,
  onSuccess,
}: CreateListModalProps) => {
  const contentRef = useRef<CreateListContentHandle>(null);
  const requestClose = () => {
    void contentRef.current?.requestClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={requestClose}
    >
      <CreateListContent
        ref={contentRef}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    </Modal>
  );
};
