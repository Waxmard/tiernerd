import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { useRef } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button, Emoji } from '../design-system/components';
import type { ListIcon } from '../design-system/tokens/colors';
import { useTheme } from '../providers/ThemeProvider';
import { listIconEmoji } from '../services/listIcon';
import type {
  ListOptionsInput,
  ListRankingMode,
} from '../services/listsService';
import {
  type ListOptionsHandle,
  ListRankingOptions,
} from './ListRankingOptions';

interface ListDetailHeaderProps {
  title: string;
  icon: ListIcon | null;
  addDisabled: boolean;
  addLoading: boolean;
  onAdd: () => void;
  description: string | null;
  deleteDisabled: boolean;
  optionsKey: string;
  rankingMode: ListRankingMode;
  optionsDisabled: boolean;
  onSaveOptions: (options: ListOptionsInput) => Promise<void>;
  onOptionsVisibilityChange: (open: boolean) => void;
  missingEmojiCount: number;
  onFillEmojis: () => Promise<void>;
  onBack: () => void;
  onDelete: () => void;
}

export const ListDetailHeader: React.FC<ListDetailHeaderProps> = ({
  title,
  icon,
  addDisabled,
  addLoading,
  onAdd,
  description,
  deleteDisabled,
  optionsKey,
  rankingMode,
  optionsDisabled,
  onSaveOptions,
  onOptionsVisibilityChange,
  missingEmojiCount,
  onFillEmojis,
  onBack,
  onDelete,
}) => {
  const { colors } = useTheme();
  const optionsRef = useRef<ListOptionsHandle>(null);
  const header = (
    <View className="gap-2 p-3 mt-2 mb-2 rounded-2xl bg-surface dark:bg-surface-dark shrink-0">
      <View className="flex-row items-start">
        <TouchableOpacity
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="w-11 h-11 items-center justify-center shrink-0"
          activeOpacity={0.7}
        >
          <Ionicons
            name="chevron-back"
            size={28}
            color={colors.ink}
            accessible={false}
          />
        </TouchableOpacity>
        <View className="flex-1 min-w-0 min-h-11 flex-row items-center gap-2 px-2">
          {addLoading ? (
            <View accessible={false} className="w-6 h-6" />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`List emoji: ${listIconEmoji(icon)}`}
              accessibilityHint="Opens the emoji picker"
              accessibilityState={{ disabled: optionsDisabled }}
              disabled={optionsDisabled}
              className="w-6 items-center"
              hitSlop={10}
              onPress={() => optionsRef.current?.open('icon')}
              style={({ pressed }) =>
                pressed && !optionsDisabled ? { opacity: 0.7 } : undefined
              }
            >
              <Emoji symbol={listIconEmoji(icon)} size={24} />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="header"
            accessibilityLabel={title}
            accessibilityHint={optionsDisabled ? undefined : 'Edit list title'}
            onPress={
              optionsDisabled
                ? undefined
                : () => optionsRef.current?.open('title')
            }
            className="flex-1 min-w-0 min-h-11 justify-center"
            style={({ pressed }) =>
              pressed && !optionsDisabled ? { opacity: 0.7 } : undefined
            }
          >
            <Text
              className={`${
                Array.from(title).length <= 28
                  ? 'text-headline-small'
                  : Array.from(title).length <= 56
                    ? 'text-title-medium'
                    : 'text-title-small'
              } text-ink dark:text-ink-dark text-left`}
            >
              {title}
            </Text>
          </Pressable>
        </View>
        <ListRankingOptions
          ref={optionsRef}
          key={optionsKey}
          title={title}
          description={description}
          rankingMode={rankingMode}
          icon={icon}
          disabled={optionsDisabled}
          onSave={onSaveOptions}
          onVisibilityChange={onOptionsVisibilityChange}
          missingEmojiCount={missingEmojiCount}
          onFillEmojis={onFillEmojis}
        />
        <TouchableOpacity
          onPress={onDelete}
          disabled={deleteDisabled}
          accessibilityRole="button"
          accessibilityLabel="Delete list"
          accessibilityState={{ disabled: deleteDisabled }}
          className="w-11 h-11 items-center justify-center shrink-0"
          activeOpacity={0.7}
        >
          <Emoji symbol="🗑️" size={22} dimmed={deleteDisabled} />
        </TouchableOpacity>
      </View>
      {description?.trim() ? (
        <ScrollView
          className="max-h-[66px] -mt-1"
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          <Pressable
            accessibilityRole={optionsDisabled ? undefined : 'button'}
            accessibilityHint={
              optionsDisabled ? undefined : 'Edit list description'
            }
            onPress={
              optionsDisabled
                ? undefined
                : () => optionsRef.current?.open('description')
            }
            className="pl-[84px] min-h-11 justify-center"
            hitSlop={10}
            style={({ pressed }) =>
              pressed && !optionsDisabled ? { opacity: 0.7 } : undefined
            }
          >
            <Text className="text-prose-medium text-ink-muted dark:text-ink-muted-dark">
              {description}
            </Text>
          </Pressable>
        </ScrollView>
      ) : null}
      {addLoading ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-body-small text-ink-muted dark:text-ink-muted-dark"
        >
          Loading list…
        </Text>
      ) : null}
      <View className="flex-row justify-end">
        <Button
          title="Add item"
          onPress={onAdd}
          disabled={addDisabled}
          loading={addLoading}
          variant="text"
          size="small"
          className="shrink"
          icon={
            addLoading ? undefined : (
              <Ionicons
                name="add"
                size={20}
                color={colors['accent-text']}
                accessible={false}
              />
            )
          }
        />
      </View>
    </View>
  );
  return (
    <ScrollView
      style={{ flexGrow: 0, minHeight: 0, maxHeight: '50%' }}
      alwaysBounceVertical={false}
      nestedScrollEnabled
      showsVerticalScrollIndicator
    >
      {header}
    </ScrollView>
  );
};
