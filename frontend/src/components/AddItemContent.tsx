import { useEffect, useRef } from 'react';
import { StyleSheet, Text, type TextInput } from 'react-native';
import { BaseModalContent, Input } from '../design-system/components';
import { AppColors, AppSpacing, AppTypography } from '../design-system/tokens';
import { RangeSelector } from './RangeSelector';
import type { ItemFormDraft } from './useItemWorkspace';

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
      {introText ? <Text style={styles.intro}>{introText}</Text> : null}
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
        inputStyle={styles.descriptionInput}
      />
    </BaseModalContent>
  );
}

const styles = StyleSheet.create({
  intro: {
    ...AppTypography.bodyMedium,
    color: AppColors.textSecondary,
    marginBottom: AppSpacing.md,
  },
  descriptionInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
