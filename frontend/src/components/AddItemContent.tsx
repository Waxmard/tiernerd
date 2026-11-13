import { useEffect, useRef } from 'react';
import { Pressable, Text, type TextInputInstance, View } from 'react-native';
import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from '../config/limits';
import {
  BaseModalContent,
  Button,
  Emoji,
  Input,
  SectionLabel,
} from '../design-system/components';
import { useListHue } from '../providers/ThemeProvider';
import {
  formatScore,
  type ManualRatingBounds,
} from '../services/rankingEngine';
import { EmojiPickerField } from './EmojiPicker';
import type { ItemFormDraft, ItemFormField } from './itemWorkspaceTypes';

export interface AddItemFieldErrors {
  name?: string;
  manualRating?: string;
}

export interface AddItemContentProps {
  mode: 'add' | 'edit';
  form: ItemFormDraft;
  onFormChange: (patch: Partial<ItemFormDraft>) => void;
  fieldErrors: AddItemFieldErrors;
  isBusy: boolean;
  onSubmit: () => void;
  onClose: () => void;
  introText?: string;
  canEditScore?: boolean;
  autoScore?: number | null;
  scoreBounds?: ManualRatingBounds;
  focusField?: ItemFormField | null;
  listTitle?: string;
  editActions?: {
    rankTitle: string;
    onRank: () => void;
    onDetails: () => void;
    onDelete: () => void;
  };
}

const MULTILINE_INPUT_STYLE = { textAlignVertical: 'top' } as const;

const PANEL_CLASS = 'rounded-2xl border-2 p-3';

export function AddItemContent({
  mode,
  form,
  onFormChange,
  fieldErrors,
  isBusy,
  onSubmit,
  onClose,
  introText,
  canEditScore = false,
  autoScore = null,
  scoreBounds,
  focusField = 'name',
  listTitle,
  editActions,
}: AddItemContentProps) {
  const nameRef = useRef<TextInputInstance>(null);
  const scoreRef = useRef<TextInputInstance>(null);
  const hue = useListHue();
  const isEdit = mode === 'edit';

  useEffect(() => {
    if (fieldErrors.name) nameRef.current?.focus();
    else if (fieldErrors.manualRating) scoreRef.current?.focus();
  }, [fieldErrors.name, fieldErrors.manualRating]);

  return (
    <BaseModalContent
      title={isEdit ? 'Edit item' : 'Add item'}
      emoji={isEdit ? '✏️' : '🌱'}
      isLoading={isBusy}
      submitText={isEdit ? 'Save' : 'Add item'}
      onClose={onClose}
      onSubmit={onSubmit}
    >
      {introText ? (
        <Text className="text-body-medium text-ink-muted dark:text-ink-muted-dark mb-3">
          {introText}
        </Text>
      ) : null}
      <View className="flex-1 gap-3">
        <View className={PANEL_CLASS} style={hue.cardStyle}>
          <Input
            ref={nameRef}
            emoji="🏷️"
            label="Name"
            placeholder="Enter item name"
            value={form.name}
            onChangeText={(name) => onFormChange({ name })}
            error={fieldErrors.name}
            maxLength={MAX_NAME_LENGTH}
            showCount
            editable={!isBusy}
            autoFocus={focusField === 'name'}
            containerClassName=""
            inputClassName="text-[20px] font-semibold min-h-12 min-w-0"
          />
        </View>
        <View className={`${PANEL_CLASS} gap-2`} style={hue.cardStyle}>
          <SectionLabel emoji="😀" label="Emoji" />
          <EmojiPickerField
            label="Item emoji"
            value={form.icon}
            onChange={(icon) => onFormChange({ icon })}
            suggestFor={{
              name: form.name,
              kind: 'item',
              description: form.description,
              listTitle,
            }}
            disabled={isBusy}
          />
        </View>
        {isEdit && canEditScore ? (
          <View className={`${PANEL_CLASS} gap-1`} style={hue.cardStyle}>
            <Input
              ref={scoreRef}
              emoji="🎯"
              label="Score (optional)"
              value={form.manualRating}
              onChangeText={(manualRating) => onFormChange({ manualRating })}
              placeholder={
                autoScore !== null && autoScore !== undefined
                  ? `Automatic (${formatScore(autoScore)})`
                  : 'Automatic'
              }
              error={fieldErrors.manualRating}
              keyboardType="decimal-pad"
              inputMode="decimal"
              maxLength={4}
              editable={!isBusy}
              autoFocus={focusField === 'manualRating'}
              containerClassName=""
              inputClassName="text-[16px] font-semibold min-h-12 min-w-0"
            />
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-body-small text-ink-muted dark:text-ink-muted-dark">
                {scoreBounds?.upper && scoreBounds?.lower
                  ? `Between ${formatScore(scoreBounds.lower.rating)} and ${formatScore(scoreBounds.upper.rating)} · from items with manual scores`
                  : scoreBounds?.upper
                    ? `Max ${formatScore(scoreBounds.upper.rating)} (${scoreBounds.upper.name} has a manual score above it)`
                    : scoreBounds?.lower
                      ? `Min ${formatScore(scoreBounds.lower.rating)} (${scoreBounds.lower.name} has a manual score below it)`
                      : '0.0–10.0 · Leave blank for automatic'}
              </Text>
              {form.manualRating.trim() !== '' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Reset score to automatic"
                  disabled={isBusy}
                  className="min-h-11 px-1 items-center justify-center"
                  onPress={() => onFormChange({ manualRating: '' })}
                >
                  <Text className="text-body-small text-accent-text dark:text-accent-text-dark font-semibold">
                    Reset to automatic
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
        <View className={PANEL_CLASS} style={hue.cardStyle}>
          <Input
            emoji="📝"
            autoFocus={focusField === 'description'}
            label="Description"
            maxLength={MAX_DESCRIPTION_LENGTH}
            showCount
            placeholder="Add a description"
            value={form.description}
            onChangeText={(description) => onFormChange({ description })}
            multiline
            editable={!isBusy}
            containerClassName=""
            inputClassName="text-[16px]"
            style={MULTILINE_INPUT_STYLE}
          />
        </View>
        {isEdit && editActions ? (
          <View className="gap-2">
            <Button
              title={editActions.rankTitle}
              variant="secondary"
              onPress={editActions.onRank}
              disabled={isBusy}
              fullWidth
              icon={<Emoji symbol="⚖️" size={18} />}
            />
            <View className="flex-row flex-wrap gap-2">
              <Button
                title="Details"
                variant="text"
                onPress={editActions.onDetails}
                disabled={isBusy}
                className="flex-1 min-w-[120px]"
                icon={<Emoji symbol="🔎" size={18} />}
              />
              <Button
                title="Delete Item"
                variant="text"
                onPress={editActions.onDelete}
                disabled={isBusy}
                textClassName="text-danger-text dark:text-danger-text-dark"
                icon={<Emoji symbol="🗑️" size={18} />}
                className="flex-1 min-w-[120px]"
              />
            </View>
          </View>
        ) : null}
      </View>
    </BaseModalContent>
  );
}
