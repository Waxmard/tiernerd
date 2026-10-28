import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, type TextInput, View } from 'react-native';
import { BaseModalContent, Input } from '../design-system/components';
import { useThemeColors } from '../providers/ThemeProvider';
import type { ItemFormDraft } from './itemWorkspaceTypes';
import { RangeSelector } from './RangeSelector';

export interface AddItemFieldErrors {
  name?: string;
  range?: string;
}

export interface AddItemContentProps {
  mode: 'add' | 'edit';
  form: ItemFormDraft;
  onFormChange: (patch: Partial<ItemFormDraft>) => void;
  fieldErrors: AddItemFieldErrors;
  isBusy: boolean;
  error: string | null;
  onSubmit: () => void;
  onRetryRefresh?: () => void;
  onClose: () => void;
  presentation: 'modal' | 'panel';
  introText?: string;
}

const REFRESH_ERROR = 'Unable to refresh items. Try again.';
const MAX_NAME_LENGTH = 100;

const MULTILINE_INPUT_STYLE = { textAlignVertical: 'top' } as const;

type AddItemView = 'overview' | 'description';

export function AddItemContent({
  mode,
  form,
  onFormChange,
  fieldErrors,
  isBusy,
  error,
  onSubmit,
  onRetryRefresh,
  onClose,
  presentation,
  introText,
}: AddItemContentProps) {
  const nameRef = useRef<TextInput>(null);
  const [view, setView] = useState<AddItemView>('overview');
  const hasVisitedDescriptionRef = useRef(false);
  const previousModeRef = useRef(mode);
  const colors = useThemeColors();
  const isEdit = mode === 'edit';

  useEffect(() => {
    if (fieldErrors.name) nameRef.current?.focus();
  }, [fieldErrors.name]);
  useEffect(() => {
    if (previousModeRef.current !== mode) {
      previousModeRef.current = mode;
      hasVisitedDescriptionRef.current = false;
      setView('overview');
    }
  }, [mode]);

  const returnToOverview = () => {
    setView('overview');
  };

  return (
    <BaseModalContent
      title={
        view === 'overview'
          ? isEdit
            ? 'Edit item'
            : 'Add item'
          : 'Description'
      }
      error={error}
      isLoading={isBusy}
      submitText={
        view === 'overview'
          ? error === REFRESH_ERROR
            ? 'Retry refresh'
            : isEdit
              ? 'Save'
              : 'Add item'
          : 'Done'
      }
      closeText={view === 'overview' ? 'Cancel' : 'Back'}
      presentation={presentation}
      onClose={view === 'overview' ? onClose : returnToOverview}
      onSubmit={
        view === 'overview'
          ? error === REFRESH_ERROR && onRetryRefresh
            ? onRetryRefresh
            : onSubmit
          : returnToOverview
      }
    >
      {view === 'overview' ? (
        <>
          {introText ? (
            <Text className="text-body-medium text-ink-muted dark:text-ink-muted-dark mb-4">
              {introText}
            </Text>
          ) : null}
          <Input
            ref={nameRef}
            label="Name"
            placeholder="Enter item name"
            value={form.name}
            onChangeText={(name) => onFormChange({ name })}
            error={fieldErrors.name}
            maxLength={MAX_NAME_LENGTH}
            editable={!isBusy}
            autoFocus={!hasVisitedDescriptionRef.current}
            inputClassName="text-[16px] font-semibold min-h-12 min-w-0"
            leftIcon={
              <Ionicons
                name="sparkles-outline"
                size={20}
                color={colors['accent-text']}
              />
            }
          />
          {!isEdit ? (
            <RangeSelector
              value={form.tierSet}
              onChange={(tierSet) => onFormChange({ tierSet })}
              error={fieldErrors.range}
              disabled={isBusy}
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Description (optional): ${form.description.trim() || 'Not set'}`}
            accessibilityHint="Edit the item description"
            accessibilityState={{ disabled: isBusy }}
            disabled={isBusy}
            onPress={() => {
              hasVisitedDescriptionRef.current = true;
              setView('description');
            }}
            className={[
              'flex-row min-h-11 items-center gap-3 border border-control dark:border-control-dark rounded-[10px] px-3 py-2 mb-4',
              !isEdit ? 'mt-4' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <View className="flex-1 min-w-0">
              <Text className="text-body-medium font-semibold text-ink dark:text-ink-dark">
                Description (optional)
              </Text>
              <Text
                numberOfLines={2}
                className="text-body-small text-ink-muted dark:text-ink-muted-dark"
              >
                {form.description.trim() || 'Not set'}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors['ink-muted']}
              accessible={false}
            />
          </Pressable>
        </>
      ) : (
        <Input
          label="Description (optional)"
          placeholder="Add a description"
          value={form.description}
          onChangeText={(description) => onFormChange({ description })}
          multiline
          numberOfLines={5}
          editable={!isBusy}
          autoFocus
          inputClassName="!min-h-[120px] text-[16px]"
          style={MULTILINE_INPUT_STYLE}
        />
      )}
    </BaseModalContent>
  );
}
