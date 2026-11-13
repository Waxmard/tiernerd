import { useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import {
  BaseModalContent,
  Button,
  Emoji,
  Input,
  SheetModal,
} from '../design-system/components';
import { useAuth } from '../providers/AuthContext';
import { aiService, type EmojiSuggestionTarget } from '../services/aiService';
import { getApiErrorMessage } from '../services/apiError';
import {
  EMOJI_GROUPS,
  type EmojiEntry,
  searchEmoji,
} from '../services/emojiCatalog';

const COLUMNS = 7;
const CELL_STYLE = { width: `${100 / COLUMNS}%` } as const;

function EmojiPickerContent({
  value,
  onSelect,
  onRemove,
  onClose,
  suggestFor,
}: {
  value: string | null;
  onSelect: (emoji: string) => void;
  onRemove?: () => void;
  onClose: () => void;
  suggestFor?: EmojiSuggestionTarget;
}) {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [groupIndex, setGroupIndex] = useState(0);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const searching = query.trim() !== '';
  const emojis: EmojiEntry[] = searching
    ? searchEmoji(query)
    : (EMOJI_GROUPS[groupIndex]?.emojis ?? []);

  const suggest = async (target: EmojiSuggestionTarget, authToken: string) => {
    if (suggesting) return;
    setSuggesting(true);
    setSuggestError(null);
    try {
      setSuggestions(await aiService.suggestEmojis(target, authToken));
    } catch (err) {
      setSuggestError(
        getApiErrorMessage(err, "Couldn't suggest an emoji. Pick one below.")
      );
    } finally {
      setSuggesting(false);
    }
  };
  return (
    <BaseModalContent
      title="Choose emoji"
      emoji="😀"
      onClose={onClose}
      scrollable={false}
      footer={
        onRemove && value !== null ? (
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Button title="Remove emoji" variant="text" onPress={onRemove} />
            <Button title="Cancel" variant="text" onPress={onClose} />
          </View>
        ) : undefined
      }
    >
      <View className="flex-row items-center gap-2 mb-2">
        <Input
          accessibilityLabel="Search emoji"
          placeholder="Search emoji"
          value={query}
          onChangeText={setQuery}
          maxLength={40}
          autoCapitalize="none"
          autoCorrect={false}
          containerClassName="flex-1"
        />
        {suggestFor && token ? (
          <Button
            title="✨ Suggest"
            variant="secondary"
            size="large"
            loading={suggesting}
            disabled={suggestFor.name.trim() === ''}
            onPress={() => void suggest(suggestFor, token)}
          />
        ) : null}
      </View>
      {suggestError ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-body-small text-ink-muted dark:text-ink-muted-dark mb-2"
        >
          {suggestError}
        </Text>
      ) : null}
      {suggestions ? (
        <View className="flex-row items-center gap-2 mb-2">
          <Emoji symbol="✨" size={18} />
          {suggestions.map((emoji) => (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              accessibilityLabel={`Suggested emoji ${emoji}`}
              accessibilityState={{ selected: emoji === value }}
              onPress={() => onSelect(emoji)}
              className={[
                'w-12 h-12 items-center justify-center rounded-[10px] border border-control dark:border-control-dark',
                emoji === value
                  ? 'bg-accent-tint dark:bg-accent-tint-dark'
                  : 'bg-surface dark:bg-surface-dark',
              ].join(' ')}
            >
              <Emoji symbol={emoji} size={28} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {searching ? null : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          className="grow-0 shrink-0 mb-2"
          contentContainerClassName="gap-2"
        >
          {EMOJI_GROUPS.map((group, index) => (
            <Pressable
              key={group.slug}
              accessibilityRole="button"
              accessibilityLabel={group.name}
              accessibilityState={{ selected: index === groupIndex }}
              onPress={() => setGroupIndex(index)}
              className={[
                'w-11 h-11 items-center justify-center rounded-[10px] border',
                index === groupIndex
                  ? 'border-accent dark:border-accent-dark bg-accent-tint dark:bg-accent-tint-dark'
                  : 'border-control dark:border-control-dark bg-surface dark:bg-surface-dark',
              ].join(' ')}
            >
              <Emoji symbol={group.emojis[0]?.emoji ?? ''} size={22} />
            </Pressable>
          ))}
        </ScrollView>
      )}
      <FlatList
        className="flex-1 min-h-0"
        automaticallyAdjustKeyboardInsets
        data={emojis}
        numColumns={COLUMNS}
        keyExtractor={(entry) => entry.emoji}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: entry }) => {
          const selected = entry.emoji === value;
          return (
            <Pressable
              style={CELL_STYLE}
              accessibilityRole="button"
              accessibilityLabel={entry.name}
              accessibilityState={{ selected }}
              onPress={() => onSelect(entry.emoji)}
              className={[
                'h-12 items-center justify-center rounded-[10px]',
                selected ? 'bg-accent-tint dark:bg-accent-tint-dark' : '',
              ].join(' ')}
            >
              <Emoji symbol={entry.emoji} size={28} />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text
            accessibilityLiveRegion="polite"
            className="text-body-small text-ink-muted dark:text-ink-muted-dark"
          >
            No emoji found for “{query.trim()}”.
          </Text>
        }
      />
    </BaseModalContent>
  );
}

export function EmojiPickerField({
  label,
  value,
  onChange,
  disabled = false,
  suggestFor,
}: {
  label: string;
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  suggestFor?: EmojiSuggestionTarget;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}: ${value}` : `Choose ${label}`}
        accessibilityHint="Opens the emoji picker"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className="min-h-11 flex-row items-center gap-2 rounded-[10px] border px-3 py-2 border-control dark:border-control-dark bg-surface dark:bg-surface-dark"
      >
        <Emoji
          symbol={value ?? '😀'}
          size={22}
          dimmed={disabled || value === null}
        />
        <Text className="text-body-small font-semibold text-ink dark:text-ink-dark">
          {value ? 'Change emoji' : 'Choose emoji'}
        </Text>
      </Pressable>
      {value ? (
        <Button
          title="Remove"
          variant="text"
          size="small"
          disabled={disabled}
          onPress={() => onChange(null)}
        />
      ) : null}
      <EmojiPickerModal
        visible={open}
        value={value}
        onSelect={(emoji) => {
          onChange(emoji);
          close();
        }}
        onClose={close}
        suggestFor={suggestFor}
      />
    </View>
  );
}

export function EmojiPickerModal({
  visible,
  value,
  onSelect,
  onRemove,
  onClose,
  suggestFor,
}: {
  visible: boolean;
  value: string | null;
  onSelect: (emoji: string) => void;
  onRemove?: () => void;
  onClose: () => void;
  suggestFor?: EmojiSuggestionTarget;
}) {
  return (
    <SheetModal
      visible={visible}
      accessibilityLabel="Choose emoji"
      onRequestClose={onClose}
    >
      {visible ? (
        <EmojiPickerContent
          value={value}
          onSelect={onSelect}
          onRemove={onRemove}
          onClose={onClose}
          suggestFor={suggestFor}
        />
      ) : null}
    </SheetModal>
  );
}
