import type React from 'react';
import { useEffect } from 'react';
import { Pressable, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Emoji } from '../design-system/components';
import { type ListColor, palette } from '../design-system/tokens/colors';
import { useTheme } from '../providers/ThemeProvider';
import type { Item } from '../services/itemsService';
import type { ListRankingMode } from '../services/listsService';
import {
  formatScore,
  rankMedal,
  splitScoreParts,
} from '../services/rankingEngine';
import { CHIP_CLASS } from './ImmersiveBoard';

export const TABULAR_NUMS = { fontVariant: ['tabular-nums' as const] };

export interface ItemRankBadgeProps {
  rankingMode: ListRankingMode;
  rating: number | null;
  rank: number | null;
  color?: ListColor | null;
  size?: 'md' | 'lg';
  className?: string;
}

export const ItemRankBadge: React.FC<ItemRankBadgeProps> = ({
  rankingMode,
  rating,
  rank,
  color = null,
  size = 'md',
  className,
}) => {
  const { scheme, colors } = useTheme();
  if (rankingMode === 'score' ? rating === null : rank === null) {
    return null;
  }

  const tintClass = color
    ? CHIP_CLASS[color]
    : 'bg-accent-tint dark:bg-accent-tint-dark';
  const borderColor = color
    ? palette.list[color][scheme].solid
    : colors['accent-line'];
  const primaryColor = color
    ? palette.list[color][scheme]['on-tint']
    : colors['accent-text'];
  const secondaryColor = colors['ink-muted'];
  const sizeClass =
    size === 'lg'
      ? 'min-w-[64px] h-12 px-3.5 rounded-2xl'
      : 'min-w-[52px] h-10 px-2.5 rounded-xl';
  const primaryTextClass =
    size === 'lg'
      ? 'text-[22px] leading-[28px] font-bold'
      : 'text-[18px] leading-[24px] font-bold';
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
  color?: ListColor | null;
  selected: boolean;
  disabled: boolean;
  onPress: (item: Item) => void;
  onIconPress?: (item: Item) => void;
  pulseAt: number;
}

const ROW_CLASS =
  'flex-row items-center border-2 px-4 py-3 mb-2 min-h-16 rounded-2xl bg-surface dark:bg-surface-dark';

export const ListDetailItemRow: React.FC<ListDetailItemRowProps> = ({
  item,
  rank,
  rankingMode,
  color = null,
  selected,
  disabled,
  onPress,
  onIconPress,
  pulseAt,
}) => {
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
    item.description?.trim() || null,
  ]
    .filter(Boolean)
    .join(', ');
  const scale = useSharedValue(1);
  useEffect(() => {
    if (Date.now() - pulseAt > 2000) return;
    scale.value = withDelay(
      350,
      withSequence(
        withTiming(1.04, { duration: 160 }),
        withTiming(1, { duration: 240 })
      )
    );
  }, [pulseAt, scale]);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={pulseStyle}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={accessibleDescription}
        accessibilityHint="Open item details"
        accessibilityState={{ disabled, selected }}
        accessibilityActions={
          item.icon && onIconPress
            ? [{ name: 'changeIcon', label: 'Change emoji' }]
            : undefined
        }
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'changeIcon')
            onIconPress?.(item);
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
          {item.icon && onIconPress ? (
            <Pressable
              className="w-10 min-h-11 mr-3 items-center justify-center shrink-0"
              accessibilityRole="button"
              accessibilityLabel={`Change emoji for ${item.name}`}
              accessibilityHint="Opens the emoji picker"
              disabled={disabled}
              onPress={() => onIconPress(item)}
            >
              <Emoji symbol={item.icon} size={28} />
            </Pressable>
          ) : item.icon ? (
            <View className="w-10 mr-3 items-center shrink-0">
              <Emoji symbol={item.icon} size={28} />
            </View>
          ) : null}
          <View className="flex-1 min-w-0">
            <Text className="text-title-medium font-semibold text-ink dark:text-ink-dark">
              {item.name}
            </Text>
            {item.description?.trim() ? (
              <Text
                numberOfLines={2}
                className="text-body-medium text-ink-muted dark:text-ink-muted-dark"
              >
                {item.description}
              </Text>
            ) : null}
            {!ranked ? (
              <View className="flex-row items-center gap-1">
                <Emoji symbol="⏳" size={14} />
                <Text className="text-body-medium text-ink-muted dark:text-ink-muted-dark mt-0.5">
                  Not ranked yet
                </Text>
              </View>
            ) : null}
          </View>
          {ranked ? (
            <View className="ml-3 flex-row items-center gap-1 shrink-0">
              {medal ? <Emoji symbol={medal} size={22} /> : null}
              <ItemRankBadge
                rankingMode={rankingMode}
                rating={item.rating}
                rank={rank}
                color={color}
              />
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    </Animated.View>
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
