import { useEffect, useRef } from 'react';
import { Pressable, Text, type TextInputInstance, View } from 'react-native';
import { BaseModalContent, Input } from '../design-system/components';
import type { ListColor } from '../design-system/tokens/colors';
import { useListHue } from '../providers/ThemeProvider';
import {
  formatScore,
  type ManualRatingBounds,
} from '../services/rankingEngine';
import type { ItemFormDraft } from './itemWorkspaceTypes';

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
  presentation: 'modal' | 'panel';
  introText?: string;
  canEditScore?: boolean;
  autoScore?: number | null;
  scoreBounds?: ManualRatingBounds;
  color?: ListColor | null;
}

const MAX_NAME_LENGTH = 100;

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
  presentation,
  introText,
  canEditScore = false,
  autoScore = null,
  scoreBounds,
  color = null,
}: AddItemContentProps) {
  const nameRef = useRef<TextInputInstance>(null);
  const scoreRef = useRef<TextInputInstance>(null);
  const hue = useListHue(color);
  const isEdit = mode === 'edit';

  useEffect(() => {
    if (fieldErrors.name) nameRef.current?.focus();
    else if (fieldErrors.manualRating) scoreRef.current?.focus();
  }, [fieldErrors.name, fieldErrors.manualRating]);

  return (
    <BaseModalContent
      title={isEdit ? 'Edit item' : 'Add item'}
      emoji={isEdit ? '✏️' : '🌱'}
      color={color}
      isLoading={isBusy}
      submitText={isEdit ? 'Save' : 'Add item'}
      presentation={presentation}
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
            editable={!isBusy}
            autoFocus
            containerClassName=""
            inputClassName="text-[20px] font-semibold min-h-12 min-w-0"
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
        <View
          className={`${PANEL_CLASS} flex-1 min-h-[160px]`}
          style={hue.cardStyle}
        >
          <Input
            emoji="📝"
            label="Description (optional)"
            placeholder="Add a description"
            value={form.description}
            onChangeText={(description) => onFormChange({ description })}
            multiline
            editable={!isBusy}
            fill
            containerClassName=""
            inputClassName="text-[16px]"
            style={MULTILINE_INPUT_STYLE}
          />
        </View>
      </View>
    </BaseModalContent>
  );
}
