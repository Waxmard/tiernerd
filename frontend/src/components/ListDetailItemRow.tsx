import type React from 'react';
import { Pressable, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  EMOJI_SLIDE,
  Emoji,
  EmojiPop,
  useEmojiArrival,
} from '../design-system/components';
import { useTheme } from '../providers/ThemeProvider';
import type { Item } from '../services/itemsService';
import type { ListRankingMode } from '../services/listsService';
import {
  formatScore,
  rankMedal,
  splitScoreParts,
} from '../services/rankingEngine';

export const TABULAR_NUMS = { fontVariant: ['tabular-nums' as const] };

export interface ItemRankBadgeProps {
  rankingMode: ListRankingMode;
  rating: number | null;
  rank: number | null;
  size?: 'md' | 'lg';
  className?: string;
}

export const ItemRankBadge: React.FC<ItemRankBadgeProps> = ({
  rankingMode,
  rating,
  rank,
  size = 'md',
  className,
}) => {
  const { colors } = useTheme();
  if (rankingMode === 'score' ? rating === null : rank === null) {
    return null;
  }

  const tintClass = 'bg-accent-tint dark:bg-accent-tint-dark';
  const borderColor = colors['accent-line'];
  const primaryColor = colors['accent-text'];
  const secondaryColor = colors['ink-muted'];
  const sizeClass =
    size === 'lg'
      ? 'min-w-[64px] h-12 px-3.5 rounded-2xl'
      : 'min-w-[52px] h-10 px-2.5 rounded-xl';
  const primaryTextClass =
    size === 'lg'
      ? 'font-display text-[22px] leading-[28px] font-bold'
      : 'font-display text-[18px] leading-[24px] font-bold';
  const secondaryTextClass =
    size === 'lg' ? 'text-[15px] font-semibold' : 'text-[13px] font-semibold';

  const scoreParts =
    rankingMode === 'score' && rating !== null ? splitScoreParts(rating) : null;

  return (
    <View
      style={{ borderColor }}
      className={[
        sizeClass,
        'border-[1.5px] items-center justify-center shrink-0',
        tintClass,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {scoreParts ? (
        <Text
          numberOfLines={1}
          style={[TABULAR_NUMS, { color: primaryColor }]}
          className={primaryTextClass}
        >
          {scoreParts.whole}
          {scoreParts.decimal ? (
            <Text
              style={[TABULAR_NUMS, { color: secondaryColor }]}
              className={secondaryTextClass}
            >
              {scoreParts.decimal}
            </Text>
          ) : null}
        </Text>
      ) : (
        <Text
          numberOfLines={1}
          style={[TABULAR_NUMS, { color: primaryColor }]}
          className={primaryTextClass}
        >
          <Text
            style={[TABULAR_NUMS, { color: secondaryColor }]}
            className={secondaryTextClass}
          >
            #
          </Text>
          {rank}
        </Text>
      )}
    </View>
  );
};

interface ListDetailItemRowProps {
  item: Item;
  rank: number | null;
  rankingMode: ListRankingMode;
  selected: boolean;
  disabled: boolean;
  onPress: (item: Item) => void;
  onIconPress?: (item: Item) => void;
}

const ROW_CLASS =
  'flex-row items-center border-2 px-4 py-3 mb-2 min-h-16 rounded-2xl bg-surface dark:bg-surface-dark';

export const ListDetailItemRow: React.FC<ListDetailItemRowProps> = ({
  item,
  rank,
  rankingMode,
  selected,
  disabled,
  onPress,
  onIconPress,
}) => {
  const celebrateIcon = useEmojiArrival(Boolean(item.icon));
  const ranked = item.position !== null;
  const medal = ranked ? rankMedal(rank) : null;
  const score =
    ranked && item.rating !== null ? formatScore(item.rating) : null;
  const accessibleDescription = [
    item.name,
    rank !== null ? `rank ${rank}` : null,
    !ranked
      ? 'Not ranked yet'
      : rankingMode === 'score' && score !== null
        ? `${score} out of 10`
        : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibleDescription}
      accessibilityHint="Opens the item"
      accessibilityState={{ disabled, selected }}
      accessibilityActions={
        item.icon && onIconPress
          ? [{ name: 'changeIcon', label: 'Change emoji' }]
          : undefined
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'changeIcon') onIconPress?.(item);
      }}
      disabled={disabled}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View
        className={[
          ROW_CLASS,
          selected
            ? 'border-accent-text dark:border-accent-text-dark'
            : 'border-transparent',
        ].join(' ')}
      >
        {item.icon ? (
          <EmojiPop
            celebrate={celebrateIcon}
            size={28}
            style={{ flexShrink: 0, marginRight: onIconPress ? 8 : 12 }}
          >
            {onIconPress ? (
              <Pressable
                className="w-11 min-h-11 items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel={`Change emoji for ${item.name}`}
                accessibilityHint="Opens the emoji picker"
                disabled={disabled}
                onPress={() => onIconPress(item)}
              >
                <Emoji symbol={item.icon} size={28} />
              </Pressable>
            ) : (
              <View className="w-10 items-center">
                <Emoji symbol={item.icon} size={28} />
              </View>
            )}
          </EmojiPop>
        ) : null}
        <Animated.View layout={EMOJI_SLIDE} style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={2}
            className="text-title-medium font-semibold text-ink dark:text-ink-dark"
          >
            {item.name}
          </Text>
          {!ranked ? (
            <View className="flex-row items-center gap-1">
              <Emoji symbol="⏳" size={14} />
              <Text className="text-body-medium text-ink-muted dark:text-ink-muted-dark mt-0.5">
                Not ranked yet
              </Text>
            </View>
          ) : null}
        </Animated.View>
        {ranked ? (
          <View className="ml-3 flex-row items-center gap-1 shrink-0">
            {medal ? <Emoji symbol={medal} size={22} /> : null}
            <ItemRankBadge
              rankingMode={rankingMode}
              rating={item.rating}
              rank={rank}
            />
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

export const ListItemEmptyState: React.FC<{
  onAdd: () => void;
  disabled?: boolean;
}> = ({ onAdd, disabled = false }) => {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Add your first item. Add an item, then compare to rank it."
      disabled={disabled}
      onPress={onAdd}
      activeOpacity={0.7}
      className="w-full items-center gap-2 border-2 border-dashed border-control rounded-2xl bg-surface-muted px-4 py-8 dark:border-control-dark dark:bg-surface-muted-dark"
    >
      <Emoji symbol="🥇" size={56} dimmed={disabled} />
      <View className="items-center gap-1">
        <Text className="text-title-medium font-semibold text-center text-ink dark:text-ink-dark">
          Add your first item
        </Text>
        <Text className="text-body-medium text-center text-ink-muted dark:text-ink-muted-dark">
          Add an item, then compare to rank it.
        </Text>
      </View>
    </TouchableOpacity>
  );
};
