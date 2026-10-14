import { Ionicons } from '@expo/vector-icons';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Modal, Pressable, Text, type TextInput, View } from 'react-native';
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

export const CreateListContent = forwardRef<
  CreateListContentHandle,
  CreateListContentProps
>(function CreateListContent({ onClose, onSuccess }, ref) {
  const { token } = useAuth();
  const { scheme } = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<ListColor | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<TextInput>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (fieldError) titleRef.current?.focus();
  }, [fieldError]);

  const clearForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setColor(null);
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
      title="Create New List"
      error={error}
      isLoading={isLoading}
      submitText="Create"
      onClose={() => {
        void requestClose();
      }}
      onSubmit={handleCreate}
    >
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
        autoFocus
      />
      <Input
        label="Description (optional)"
        placeholder="Add a description"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
        editable={!isLoading}
        inputClassName="min-h-20 text-[16px]"
        style={MULTILINE_INPUT_STYLE}
      />
      <View className="mb-4">
        <Text className="text-label-medium text-ink dark:text-ink-dark mb-1">
          Color
        </Text>
        <View className="flex-row gap-3">
          {LIST_COLORS.map((hue) => {
            const selected = color === hue;
            return (
              <Pressable
                key={hue}
                accessibilityRole="button"
                accessibilityLabel={'Color ' + hue}
                accessibilityState={{ selected }}
                aria-pressed={selected}
                testID={'color-' + hue}
                disabled={isLoading}
                onPress={() => setColor(selected ? null : hue)}
                className={[
                  'w-10 h-10 rounded-full items-center justify-center',
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
      </View>
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
