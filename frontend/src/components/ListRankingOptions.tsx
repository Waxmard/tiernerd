import { Ionicons } from '@expo/vector-icons';
import { type Ref, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  BaseModalContent,
  Button,
  Emoji,
  Input,
  SectionLabel,
  SheetModal,
} from '../design-system/components';
import type { ListColor, ListIcon } from '../design-system/tokens/colors';
import { useNotifyWhenOnline } from '../providers/SyncProvider';
import { useThemeColors } from '../providers/ThemeProvider';
import { listIconEmoji } from '../services/listIcon';
import type {
  ListOptionsInput,
  ListRankingMode,
} from '../services/listsService';
import { EmojiPickerField, EmojiPickerModal } from './EmojiPicker';
import { ListColorPicker } from './ImmersiveBoard';

const MAX_TITLE_LENGTH = 100;

const choices: {
  value: ListRankingMode;
  title: string;
  description: string;
  emoji: string;
}[] = [
  {
    value: 'rank',
    title: 'Ranked positions',
    description: '1, 2, 3 — best first.',
    emoji: '🏆',
  },
  {
    value: 'score',
    title: 'Scores out of 10',
    description: 'Based on list order, with optional manual scores.',
    emoji: '🎯',
  },
];

export function RankingModeSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: ListRankingMode;
  onChange: (value: ListRankingMode) => void;
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Ranking mode"
      className="gap-3"
    >
      {choices.map((choice) => {
        const selected = value === choice.value;
        return (
          <Pressable
            key={choice.value}
            accessibilityRole="radio"
            accessibilityLabel={`${choice.title}. ${choice.description}`}
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(choice.value)}
            style={({ pressed }) =>
              pressed && !disabled
                ? { transform: [{ scale: 0.98 }] }
                : undefined
            }
            className={[
              'flex-row min-h-11 items-center gap-3 border rounded-[10px] px-3 py-3',
              selected
                ? 'border-accent dark:border-accent-dark bg-accent-tint dark:bg-accent-tint-dark'
                : 'border-control dark:border-control-dark',
            ].join(' ')}
          >
            <Ionicons
              name={
                value === choice.value ? 'radio-button-on' : 'radio-button-off'
              }
              size={22}
              color={
                colors[
                  disabled
                    ? 'ink-disabled'
                    : value === choice.value
                      ? 'accent-text'
                      : 'ink-muted'
                ]
              }
              accessible={false}
            />
            <Emoji symbol={choice.emoji} size={20} dimmed={disabled} />
            <View className="flex-1 min-w-0">
              <Text className="text-body-medium font-semibold text-ink dark:text-ink-dark">
                {choice.title}
              </Text>
              <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
                {choice.description}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export interface ListOptionsHandle {
  open: (target?: 'title' | 'description' | 'icon') => void;
}

export function ListRankingOptions({
  title,
  description,
  rankingMode,
  color,
  icon,
  disabled,
  onSave,
  onVisibilityChange,
  ref,
}: {
  title: string;
  description: string | null;
  rankingMode: ListRankingMode;
  color: ListColor | null;
  icon: ListIcon | null;
  disabled: boolean;
  onSave: (options: ListOptionsInput) => Promise<void>;
  onVisibilityChange: (open: boolean) => void;
  ref?: Ref<ListOptionsHandle>;
}) {
  const notify = useNotifyWhenOnline();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(rankingMode);
  const [draftTitle, setDraftTitle] = useState(title);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [draftColor, setDraftColor] = useState(color);
  const [draftIcon, setDraftIcon] = useState(icon);
  const [draftDescription, setDraftDescription] = useState(description ?? '');
  const [focusField, setFocusField] = useState<'title' | 'description' | null>(
    null
  );
  const [pickingIcon, setPickingIcon] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const changed =
    draftTitle.trim() !== title ||
    draftDescription.trim() !== (description ?? '').trim() ||
    draft !== rankingMode ||
    draftColor !== color ||
    draftIcon !== icon;
  const openOptions = (target?: 'title' | 'description' | 'icon') => {
    if (disabled || savingRef.current) return;
    onVisibilityChange(true);
    if (target === 'icon') {
      setPickingIcon(true);
      return;
    }
    setDraft(rankingMode);
    setDraftTitle(title);
    setDraftDescription(description ?? '');
    setTitleError(null);
    setDraftColor(color);
    setDraftIcon(icon);
    setFocusField(target ?? null);
    setOpen(true);
  };
  useImperativeHandle(ref, () => ({ open: openOptions }));
  const close = () => {
    if (savingRef.current) return;
    onVisibilityChange(false);
    setTitleError(null);
    setOpen(false);
  };
  const save = async () => {
    if (savingRef.current || !changed) return;
    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle) {
      setTitleError('Title is required');
      return;
    }
    if (Array.from(trimmedTitle).length > MAX_TITLE_LENGTH) {
      setTitleError('Title must be 100 characters or less');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await onSave({
        title: trimmedTitle,
        ranking_mode: draft,
        color: draftColor,
        icon: draftIcon,
        description: draftDescription.trim() || null,
      });
      onVisibilityChange(false);
      setOpen(false);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Unable to save list options.'
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const closePicker = () => {
    setPickingIcon(false);
    onVisibilityChange(false);
  };
  const pickIcon = async (emoji: string) => {
    closePicker();
    if (savingRef.current || emoji === (icon ? listIconEmoji(icon) : null))
      return;
    savingRef.current = true;
    try {
      await onSave({
        title,
        description,
        ranking_mode: rankingMode,
        color,
        icon: emoji,
      });
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Unable to save list options.'
      );
    } finally {
      savingRef.current = false;
    }
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="List options"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => openOptions()}
        style={({ pressed }) =>
          pressed && !disabled ? { opacity: 0.7 } : undefined
        }
        className="w-11 h-11 items-center justify-center shrink-0"
      >
        <Emoji symbol="⚙️" size={22} dimmed={disabled} />
      </Pressable>
      <SheetModal
        visible={open}
        accessibilityLabel="List options"
        onRequestClose={close}
      >
        <BaseModalContent
          title="List options"
          emoji="⚙️"
          color={draftColor}
          onClose={close}
          footer={
            <View className="flex-row flex-wrap items-center justify-end gap-2">
              <Button
                title="Cancel"
                variant="text"
                onPress={close}
                disabled={saving}
                className="min-w-20 max-w-full shrink"
              />
              <Button
                title="Save"
                size="large"
                onPress={() => void save()}
                loading={saving}
                disabled={saving || !changed}
                className="min-w-[100px] max-w-full shrink"
              />
            </View>
          }
        >
          <View className="gap-4">
            <Input
              emoji="🏷️"
              label="Title"
              placeholder="Enter list title"
              value={draftTitle}
              onChangeText={(value) => {
                setDraftTitle(value);
                setTitleError(null);
              }}
              error={titleError ?? undefined}
              maxLength={MAX_TITLE_LENGTH}
              editable={!saving}
              autoFocus={focusField === 'title'}
            />
            <Input
              emoji="📝"
              label="Description (optional)"
              placeholder="Add a description"
              value={draftDescription}
              onChangeText={setDraftDescription}
              multiline
              numberOfLines={3}
              editable={!saving}
              autoFocus={focusField === 'description'}
              inputClassName="!min-h-[96px] text-[16px]"
              style={{ textAlignVertical: 'top' }}
            />
            <SectionLabel emoji="😀" label="List icon" />
            <EmojiPickerField
              label="List icon"
              value={draftIcon ? listIconEmoji(draftIcon) : null}
              onChange={setDraftIcon}
              disabled={saving}
            />
            <SectionLabel emoji="🎨" label="Accent color" />
            <ListColorPicker
              value={draftColor}
              onChange={setDraftColor}
              disabled={saving}
            />
            <SectionLabel emoji="🏆" label="Ranking mode" />
            <RankingModeSelector
              value={draft}
              onChange={setDraft}
              disabled={saving}
            />
          </View>
        </BaseModalContent>
      </SheetModal>
      <EmojiPickerModal
        visible={pickingIcon}
        value={icon ? listIconEmoji(icon) : null}
        onSelect={(emoji) => void pickIcon(emoji)}
        onClose={closePicker}
      />
    </>
  );
}
