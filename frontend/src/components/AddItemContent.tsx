import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, type TextInputInstance, View } from 'react-native';
import { BaseModalContent, Input } from '../design-system/components';
import { useThemeColors } from '../providers/ThemeProvider';
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
}

const MAX_NAME_LENGTH = 100;

const MULTILINE_INPUT_STYLE = { textAlignVertical: 'top' } as const;

type AddItemView = 'overview' | 'description';

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
}: AddItemContentProps) {
  const nameRef = useRef<TextInputInstance>(null);
  const scoreRef = useRef<TextInputInstance>(null);
  const [view, setView] = useState<AddItemView>('overview');
  const hasVisitedDescriptionRef = useRef(false);
  const previousModeRef = useRef(mode);
  const colors = useThemeColors();
  const isEdit = mode === 'edit';

  useEffect(() => {
    if (fieldErrors.name) nameRef.current?.focus();
    else if (fieldErrors.manualRating) scoreRef.current?.focus();
  }, [fieldErrors.name, fieldErrors.manualRating]);
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
      isLoading={isBusy}
      submitText={view === 'overview' ? (isEdit ? 'Save' : 'Add item') : 'Done'}
      closeText={view === 'overview' ? 'Cancel' : 'Back'}
      presentation={presentation}
      onClose={view === 'overview' ? onClose : returnToOverview}
      onSubmit={view === 'overview' ? onSubmit : returnToOverview}
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
          {isEdit && canEditScore ? (
            <>
              <Input
                ref={scoreRef}
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
                inputClassName="text-[16px] font-semibold min-h-12 min-w-0"
              />
              <View className="-mt-2 mb-4 flex-row items-center justify-between gap-2">
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
            </>
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
