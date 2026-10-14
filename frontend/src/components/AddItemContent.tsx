import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Text, type TextInput } from 'react-native';
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
  const colors = useThemeColors();
  const isEdit = mode === 'edit';

  useEffect(() => {
    if (fieldErrors.name) nameRef.current?.focus();
  }, [fieldErrors.name]);

  return (
    <BaseModalContent
      title={isEdit ? 'Edit item' : 'Add item'}
      error={error}
      isLoading={isBusy}
      submitText={
        error === REFRESH_ERROR ? 'Retry refresh' : isEdit ? 'Save' : 'Add item'
      }
      closeText="Cancel"
      presentation={presentation}
      onClose={onClose}
      onSubmit={
        error === REFRESH_ERROR && onRetryRefresh ? onRetryRefresh : onSubmit
      }
    >
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
        autoFocus
        inputClassName="text-headline-small font-semibold min-h-12 min-w-0"
        leftIcon={
          <Ionicons
            name="sparkles-outline"
            size={24}
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
      <Input
        label="Description (optional)"
        placeholder="Add a description"
        value={form.description}
        onChangeText={(description) => onFormChange({ description })}
        multiline
        numberOfLines={3}
        editable={!isBusy}
        inputClassName="min-h-20 text-[16px]"
        style={MULTILINE_INPUT_STYLE}
        containerClassName={!isEdit ? 'mt-4' : undefined}
      />
    </BaseModalContent>
  );
}
