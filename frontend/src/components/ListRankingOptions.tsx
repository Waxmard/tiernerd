import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { BaseModalContent, Button } from '../design-system/components';
import { useThemeColors } from '../providers/ThemeProvider';
import type { ListRankingMode } from '../services/listsService';

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
    <View accessibilityRole="radiogroup" className="gap-3">
      {choices.map((choice) => (
        <Pressable
          key={choice.value}
          accessibilityRole="radio"
          accessibilityLabel={`${choice.title}. ${choice.description}`}
          accessibilityState={{ checked: value === choice.value, disabled }}
          disabled={disabled}
          onPress={() => onChange(choice.value)}
          className="flex-row min-h-11 items-center gap-3 border border-control dark:border-control-dark rounded-[10px] px-3 py-3"
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
      ))}
    </View>
  );
}

export function ListRankingOptions({
  rankingMode,
  disabled,
  onSave,
  onVisibilityChange,
}: {
  rankingMode: ListRankingMode;
  disabled: boolean;
  onSave: (mode: ListRankingMode) => Promise<void>;
  onVisibilityChange: (open: boolean) => void;
}) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(rankingMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const close = () => {
    if (savingRef.current) return;
    onVisibilityChange(false);
    setOpen(false);
  };
  const save = async () => {
    if (savingRef.current || draft === rankingMode) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      onVisibilityChange(false);
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save ranking mode. Try again.'
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
          setError(null);
          onVisibilityChange(true);
          setOpen(true);
        }}
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
                disabled={saving || draft === rankingMode}
                className="min-w-[100px] max-w-full shrink"
              />
            </View>
          }
        >
          <Text className="text-body-medium font-semibold text-ink dark:text-ink-dark mb-3">
            Ranking mode
          </Text>
          <RankingModeSelector
            value={draft}
            onChange={setDraft}
            disabled={saving}
          />
        </BaseModalContent>
      </Modal>
    </>
  );
}
