import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { useRef } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button, Emoji } from '../design-system/components';
import type { ListColor, ListIcon } from '../design-system/tokens/colors';
import { useTheme } from '../providers/ThemeProvider';
import { listIconEmoji } from '../services/emojiCatalog';
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
  color: ListColor | null;
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
  onBack: () => void;
  onDelete: () => void;
}

export const ListDetailHeader: React.FC<ListDetailHeaderProps> = ({
  title,
  icon,
  color,
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
          {addLoading ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`List icon: ${listIconEmoji(icon)}`}
              accessibilityHint="Opens the emoji picker"
              accessibilityState={{ disabled: optionsDisabled }}
              disabled={optionsDisabled}
              hitSlop={10}
              onPress={() => optionsRef.current?.open('icon')}
              style={({ pressed }) =>
                pressed && !optionsDisabled ? { opacity: 0.7 } : undefined
              }
            >
              <Emoji symbol={listIconEmoji(icon)} size={24} />
            </Pressable>
          )}
          <Text
            accessibilityRole="header"
            accessibilityLabel={title}
            accessibilityHint={optionsDisabled ? undefined : 'Edit list title'}
            onPress={
              optionsDisabled
                ? undefined
                : () => optionsRef.current?.open('title')
            }
            className={`flex-1 min-w-0 ${
              Array.from(title).length <= 28
                ? 'text-headline-small'
                : Array.from(title).length <= 56
                  ? 'text-title-medium'
                  : 'text-title-small'
            } text-ink dark:text-ink-dark text-left`}
          >
            {title}
          </Text>
        </View>
        <ListRankingOptions
          ref={optionsRef}
          key={optionsKey}
          title={title}
          description={description}
          rankingMode={rankingMode}
          color={color}
          icon={icon}
          disabled={optionsDisabled}
          onSave={onSaveOptions}
          onVisibilityChange={onOptionsVisibilityChange}
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
          className="max-h-[72px]"
          role={Platform.OS === 'web' ? 'region' : undefined}
          accessibilityLabel={
            Platform.OS === 'web' ? 'List description' : undefined
          }
          tabIndex={Platform.OS === 'web' ? 0 : undefined}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          <Text
            accessibilityHint={
              optionsDisabled ? undefined : 'Edit list description'
            }
            onPress={
              optionsDisabled
                ? undefined
                : () => optionsRef.current?.open('description')
            }
            className="text-body-medium text-ink-muted dark:text-ink-muted-dark"
          >
            {description}
          </Text>
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
      role={Platform.OS === 'web' ? 'region' : undefined}
      accessibilityLabel={Platform.OS === 'web' ? 'List details' : undefined}
      tabIndex={Platform.OS === 'web' ? 0 : undefined}
      style={{ flexGrow: 0, minHeight: 0, maxHeight: '50%' }}
      alwaysBounceVertical={false}
      nestedScrollEnabled
      showsVerticalScrollIndicator
    >
      {header}
    </ScrollView>
  );
};
