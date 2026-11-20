import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { useRef } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
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
import { ScreenTopBar } from './ImmersiveBoard';
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
  onSuggest: () => void;
  suggestDisabled: boolean;
  suggestLoading: boolean;
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
  onSuggest,
  suggestDisabled,
  suggestLoading,
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
  const emoji = listIconEmoji(icon);
  const { height: windowHeight } = useWindowDimensions();
  const titleLength = Array.from(title).length;
  const titleClass =
    titleLength <= 28
      ? 'text-headline-small py-1.5'
      : titleLength <= 56
        ? 'text-title-medium py-2.5'
        : 'text-title-small py-2.5';
  return (
    <ScreenTopBar>
      <ScrollView
        style={{ flexGrow: 0, maxHeight: windowHeight * 0.5 }}
        alwaysBounceVertical={false}
        nestedScrollEnabled
        showsVerticalScrollIndicator
        indicatorStyle="white"
      >
        <View className="w-full max-w-[1280px] self-center px-2 pt-3 pb-2">
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
                color={colors['on-bar']}
                accessible={false}
              />
            </TouchableOpacity>
            {!emoji ? null : addLoading ? (
              <View accessible={false} className="w-6 h-11 mr-2" />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`List emoji: ${emoji}`}
                accessibilityHint="Opens the emoji picker"
                accessibilityState={{ disabled: optionsDisabled }}
                disabled={optionsDisabled}
                className="w-6 h-11 mr-2 items-center justify-center"
                hitSlop={10}
                onPress={() => optionsRef.current?.open('icon')}
                style={({ pressed }) =>
                  pressed && !optionsDisabled ? { opacity: 0.7 } : undefined
                }
              >
                <Emoji symbol={emoji} size={24} />
              </Pressable>
            )}
            <Pressable
              accessibilityRole="header"
              accessibilityLabel={title}
              accessibilityHint={
                optionsDisabled ? undefined : 'Edit list title'
              }
              onPress={
                optionsDisabled
                  ? undefined
                  : () => optionsRef.current?.open('title')
              }
              className="flex-1 min-w-0 min-h-11"
              style={({ pressed }) =>
                pressed && !optionsDisabled ? { opacity: 0.7 } : undefined
              }
            >
              <Text
                className={`${titleClass} text-on-bar dark:text-on-bar-dark text-left`}
              >
                {title}
              </Text>
            </Pressable>
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
              className="max-h-[66px]"
              nestedScrollEnabled
              showsVerticalScrollIndicator
              indicatorStyle="white"
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
                className={`${emoji ? 'pl-[76px]' : 'pl-11'} pr-2 min-h-11 justify-center`}
                hitSlop={10}
                style={({ pressed }) =>
                  pressed && !optionsDisabled ? { opacity: 0.7 } : undefined
                }
              >
                <Text className="text-prose-medium text-on-bar-muted dark:text-on-bar-muted-dark">
                  {description}
                </Text>
              </Pressable>
            </ScrollView>
          ) : null}
          {addLoading ? (
            <Text
              accessibilityLiveRegion="polite"
              className="text-body-small text-on-bar-muted dark:text-on-bar-muted-dark pl-11 pr-2 pb-1"
            >
              Loading list…
            </Text>
          ) : null}
          <View className="flex-row justify-between gap-2">
            <Button
              icon={<Emoji symbol="✨" size={18} />}
              title="Suggest next"
              onPress={onSuggest}
              disabled={suggestDisabled}
              loading={suggestLoading}
              variant="on-bar-text"
              size="small"
              className="shrink"
            />
            <Button
              title="Add item"
              onPress={onAdd}
              disabled={addDisabled}
              loading={addLoading}
              variant="on-bar-text"
              size="small"
              className="shrink"
              icon={
                addLoading ? undefined : (
                  <Ionicons
                    name="add"
                    size={20}
                    color={colors['on-bar']}
                    accessible={false}
                  />
                )
              }
            />
          </View>
        </View>
      </ScrollView>
    </ScreenTopBar>
  );
};
