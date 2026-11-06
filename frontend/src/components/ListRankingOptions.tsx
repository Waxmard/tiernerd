import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { BaseModalContent, Button, Input } from '../design-system/components';
import type {
  ListColor,
  ListCover,
  ListIcon,
} from '../design-system/tokens/colors';
import { useThemeColors } from '../providers/ThemeProvider';
import { coverDraftMatchesSaved } from '../services/coverDraft';
import {
  type CoverDraft,
  coverDraftFromSaved,
  type ListPhoto,
} from '../services/listCoversService';
import type {
  ListOptionsInput,
  ListRankingMode,
} from '../services/listsService';
import { ListColorPicker, ListIconPicker } from './ImmersiveBoard';
import { ListCoverPicker, releaseCoverDraft } from './ListCoverPicker';

const MAX_TITLE_LENGTH = 100;

const choices: {
  value: ListRankingMode;
  title: string;
  description: string;
}[] = [
  {
    value: 'rank',
    title: 'Ranked positions',
    description: '1, 2, 3 — best first.',
  },
  {
    value: 'score',
    title: 'Scores out of 10',
    description: '10.0 to 0.0, based on list order.',
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

export function ListRankingOptions({
  title,
  rankingMode,
  color,
  icon,
  cover,
  coverPhoto,
  listId,
  disabled,
  onSave,
  onVisibilityChange,
}: {
  title: string;
  rankingMode: ListRankingMode;
  color: ListColor | null;
  icon: ListIcon | null;
  cover: ListCover | null;
  coverPhoto: ListPhoto | null;
  listId: string;
  disabled: boolean;
  onSave: (options: ListOptionsInput) => Promise<void>;
  onVisibilityChange: (open: boolean) => void;
}) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(rankingMode);
  const [draftTitle, setDraftTitle] = useState(title);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [draftColor, setDraftColor] = useState(color);
  const [draftIcon, setDraftIcon] = useState(icon);
  const [draftCover, setDraftCover] = useState<CoverDraft>(() =>
    coverDraftFromSaved(cover, coverPhoto)
  );
  const [saving, setSaving] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const coverBusyRef = useRef(false);
  const coverDraftRef = useRef(draftCover);
  const coverSessionRef = useRef(0);
  const coverSession = coverSessionRef.current;
  const handleCoverBusyChange = useCallback((busy: boolean) => {
    coverBusyRef.current = busy;
    setCoverBusy(busy);
  }, []);

  const changeCoverDraft = useCallback((next: CoverDraft) => {
    if (coverDraftRef.current !== next) {
      releaseCoverDraft(coverDraftRef.current);
    }
    coverDraftRef.current = next;
    setDraftCover(next);
  }, []);

  useEffect(() => () => releaseCoverDraft(coverDraftRef.current), []);

  const changed =
    draftTitle.trim() !== title ||
    draft !== rankingMode ||
    draftColor !== color ||
    draftIcon !== icon ||
    !coverDraftMatchesSaved(draftCover, cover, coverPhoto);
  const close = () => {
    if (savingRef.current) return;
    coverSessionRef.current += 1;
    onVisibilityChange(false);
    handleCoverBusyChange(false);
    changeCoverDraft({ kind: 'none' });
    setError(null);
    setTitleError(null);
    setOpen(false);
  };
  const save = async () => {
    if (savingRef.current || coverBusyRef.current || !changed) return;
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
    setError(null);
    try {
      await onSave({
        title: trimmedTitle,
        ranking_mode: draft,
        color: draftColor,
        icon: draftIcon,
        coverDraft: coverDraftRef.current,
      });
      coverSessionRef.current += 1;
      onVisibilityChange(false);
      changeCoverDraft({ kind: 'none' });
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save list options. Try again.'
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="List options"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => {
          if (disabled) return;
          setDraft(rankingMode);
          setDraftTitle(title);
          setTitleError(null);
          setDraftColor(color);
          setDraftIcon(icon);
          changeCoverDraft(coverDraftFromSaved(cover, coverPhoto));
          setError(null);
          onVisibilityChange(true);
          setOpen(true);
        }}
        style={({ pressed }) =>
          pressed && !disabled ? { opacity: 0.7 } : undefined
        }
        className="w-11 h-11 items-center justify-center shrink-0"
      >
        <Ionicons
          name="options-outline"
          size={24}
          color={colors[disabled ? 'ink-disabled' : 'ink']}
          accessible={false}
        />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="none"
        accessibilityLabel="List options"
        onRequestClose={close}
      >
        <BaseModalContent
          title="List options"
          error={error}
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
                disabled={saving || coverBusy || !changed}
                className="min-w-[100px] max-w-full shrink"
              />
            </View>
          }
        >
          <View className="gap-4">
            <Input
              label="Title"
              placeholder="Enter list title"
              value={draftTitle}
              onChangeText={(value) => {
                setDraftTitle(value);
                setTitleError(null);
                setError(null);
              }}
              error={titleError ?? undefined}
              maxLength={MAX_TITLE_LENGTH}
              editable={!saving}
            />
            <Text className="text-body-medium font-semibold text-ink dark:text-ink-dark">
              List icon
            </Text>
            <ListIconPicker
              value={draftIcon}
              onChange={setDraftIcon}
              disabled={saving}
            />
            <Text className="text-body-medium font-semibold text-ink dark:text-ink-dark">
              Accent color
            </Text>
            <ListColorPicker
              value={draftColor}
              onChange={setDraftColor}
              disabled={saving}
            />
            <Text className="text-body-medium font-semibold text-ink dark:text-ink-dark">
              Cover
            </Text>
            {open ? (
              <ListCoverPicker
                key={coverSession}
                value={draftCover}
                onChange={(next) => {
                  if (coverSessionRef.current === coverSession) {
                    changeCoverDraft(next);
                  } else {
                    releaseCoverDraft(next);
                  }
                }}
                color={draftColor}
                listId={listId}
                disabled={saving}
                onBusyChange={(busy) => {
                  if (coverSessionRef.current === coverSession) {
                    handleCoverBusyChange(busy);
                  }
                }}
              />
            ) : null}
            <Text className="text-body-medium font-semibold text-ink dark:text-ink-dark">
              Ranking mode
            </Text>
            <RankingModeSelector
              value={draft}
              onChange={setDraft}
              disabled={saving}
            />
          </View>
        </BaseModalContent>
      </Modal>
    </>
  );
}
