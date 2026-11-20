import { Ionicons } from '@expo/vector-icons';
import type { Ref } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Pressable, Text, View } from 'react-native';
import { Button, Emoji } from '../design-system/components';
import type { ListIcon } from '../design-system/tokens/colors';
import { useTheme } from '../providers/ThemeProvider';
import { listIconEmoji } from '../services/listIcon';
import type {
  ListOptionsInput,
  ListRankingMode,
} from '../services/listsService';
import {
  NavBackButton,
  NavBarTitle,
  NavIconButton,
  NavProfileButton,
  ScreenNavBar,
} from './ImmersiveBoard';
import {
  type ListOptionsHandle,
  ListRankingOptions,
} from './ListRankingOptions';

interface ListNavBarProps {
  title: string;
  icon: ListIcon | null;
  scrolled: boolean;
  description: string | null;
  optionsKey: string;
  rankingMode: ListRankingMode;
  optionsDisabled: boolean;
  optionsRef: Ref<ListOptionsHandle>;
  onSaveOptions: (options: ListOptionsInput) => Promise<void>;
  onOptionsVisibilityChange: (open: boolean) => void;
  missingEmojiCount: number;
  onFillEmojis: () => Promise<void>;
  addDisabled: boolean;
  onAdd: () => void;
  deleteDisabled: boolean;
  onOpenProfile: () => void;
  onBack: () => void;
  onDelete: () => void;
}

export function ListNavBar({
  title,
  icon,
  scrolled,
  description,
  optionsKey,
  rankingMode,
  optionsDisabled,
  optionsRef,
  onSaveOptions,
  onOptionsVisibilityChange,
  missingEmojiCount,
  onFillEmojis,
  addDisabled,
  onAdd,
  deleteDisabled,
  onOpenProfile,
  onBack,
  onDelete,
}: ListNavBarProps) {
  const emoji = listIconEmoji(icon);
  return (
    <ScreenNavBar scrolled={scrolled}>
      <NavBackButton label="Lists" compact={scrolled} onPress={onBack} />
      <NavBarTitle visible={scrolled}>
        {emoji ? `${emoji} ${title}` : title}
      </NavBarTitle>
      {scrolled ? (
        <NavIconButton
          name="add"
          label="Add item"
          tone="accent"
          onPress={onAdd}
          disabled={addDisabled}
        />
      ) : null}
      <ListRankingOptions
        ref={optionsRef}
        key={optionsKey}
        showTrigger={!scrolled}
        title={title}
        description={description}
        rankingMode={rankingMode}
        icon={icon}
        disabled={optionsDisabled}
        onSave={onSaveOptions}
        onVisibilityChange={onOptionsVisibilityChange}
        missingEmojiCount={missingEmojiCount}
        onFillEmojis={onFillEmojis}
        deleteDisabled={deleteDisabled}
        onDelete={onDelete}
      />
      <NavProfileButton onPress={onOpenProfile} />
    </ScreenNavBar>
  );
}

interface ListTitleBlockProps {
  title: string;
  icon: ListIcon | null;
  description: string | null;
  addDisabled: boolean;
  addLoading: boolean;
  onAdd: () => void;
  onSuggest: () => void;
  suggestDisabled: boolean;
  suggestLoading: boolean;
  optionsDisabled: boolean;
  onOpenOptions: (target: 'title' | 'description' | 'icon') => void;
  onTitleLayout: (event: LayoutChangeEvent) => void;
}

export function ListTitleBlock({
  title,
  icon,
  description,
  addDisabled,
  addLoading,
  onAdd,
  onSuggest,
  suggestDisabled,
  suggestLoading,
  optionsDisabled,
  onOpenOptions,
  onTitleLayout,
}: ListTitleBlockProps) {
  const { colors } = useTheme();
  const emoji = listIconEmoji(icon);
  const titleLength = Array.from(title).length;
  const titleClass =
    titleLength <= 24
      ? 'text-[32px] leading-[38px]'
      : titleLength <= 48
        ? 'text-[26px] leading-[32px]'
        : 'text-[22px] leading-[28px]';
  return (
    <View className="px-1 pt-1 pb-4">
      {!emoji ? null : addLoading ? (
        <View accessible={false} className="h-12" />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`List emoji: ${emoji}`}
          accessibilityHint="Opens the emoji picker"
          accessibilityState={{ disabled: optionsDisabled }}
          disabled={optionsDisabled}
          className="self-start h-12 justify-center"
          hitSlop={10}
          onPress={() => onOpenOptions('icon')}
          style={({ pressed }) =>
            pressed && !optionsDisabled ? { opacity: 0.7 } : undefined
          }
        >
          <Emoji symbol={emoji} size={40} />
        </Pressable>
      )}
      <Pressable
        onLayout={onTitleLayout}
        accessibilityRole="header"
        accessibilityLabel={title}
        accessibilityHint={optionsDisabled ? undefined : 'Edit list title'}
        onPress={optionsDisabled ? undefined : () => onOpenOptions('title')}
        className="mt-1"
        style={({ pressed }) =>
          pressed && !optionsDisabled ? { opacity: 0.7 } : undefined
        }
      >
        <Text
          className={`font-display-bold tracking-[-0.4px] text-ink dark:text-ink-dark ${titleClass}`}
        >
          {title}
        </Text>
      </Pressable>
      {description?.trim() ? (
        <Pressable
          accessibilityRole={optionsDisabled ? undefined : 'button'}
          accessibilityHint={
            optionsDisabled ? undefined : 'Edit list description'
          }
          onPress={
            optionsDisabled ? undefined : () => onOpenOptions('description')
          }
          className="mt-1.5 min-h-11 justify-center"
          hitSlop={10}
          style={({ pressed }) =>
            pressed && !optionsDisabled ? { opacity: 0.7 } : undefined
          }
        >
          <Text className="text-prose-large text-ink dark:text-ink-dark">
            {description}
          </Text>
        </Pressable>
      ) : null}
      {addLoading ? (
        <Text
          accessibilityLiveRegion="polite"
          className="mt-1 text-body-small text-ink-muted dark:text-ink-muted-dark"
        >
          Loading list…
        </Text>
      ) : null}
      <View className="mt-3 flex-row flex-wrap items-center gap-2">
        <Button
          title="Add item"
          onPress={onAdd}
          disabled={addDisabled}
          loading={addLoading}
          icon={
            addLoading ? undefined : (
              <Ionicons
                name="add"
                size={20}
                color={colors['on-accent']}
                accessible={false}
              />
            )
          }
        />
        <Button
          icon={<Emoji symbol="✨" size={18} />}
          title="Suggest next"
          onPress={onSuggest}
          disabled={suggestDisabled}
          loading={suggestLoading}
          variant="secondary"
        />
      </View>
    </View>
  );
}
