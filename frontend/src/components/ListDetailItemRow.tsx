import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { type ListColor, palette } from '../design-system/tokens/colors';
import { useTheme, useThemeColors } from '../providers/ThemeProvider';
import type { Item } from '../services/itemsService';
import type { ListRankingMode } from '../services/listsService';
import { formatScore, splitScoreParts } from '../services/rankingEngine';
import { CHIP_CLASS, SWATCH_CLASS } from './ImmersiveBoard';

const TABULAR_NUMS = { fontVariant: ['tabular-nums' as const] };

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
  const primaryTextClass =
    size === 'lg'
      ? 'text-[22px] leading-7 font-bold'
      : 'text-[18px] leading-6 font-bold';
  const secondaryTextClass =
    size === 'lg'
      ? 'text-[15px] leading-5 font-semibold'
      : 'text-[13px] leading-4 font-semibold';

  if (rankingMode === 'rank') {
    if (rank === null) {
      return null;
    }
    const solidClass = color
      ? SWATCH_CLASS[color]
      : 'bg-accent dark:bg-accent-dark';
    const onSolidColor = color
      ? palette.list[color][scheme]['on-solid']
      : colors['on-accent'];
    const pillSizeClass =
      size === 'lg'
        ? 'min-w-12 h-12 px-3.5 rounded-full'
        : 'min-w-10 h-10 px-3 rounded-full';

    return (
      <View
        className={[
          pillSizeClass,
          'items-center justify-center shrink-0',
          solidClass,
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Text
          numberOfLines={1}
          style={[TABULAR_NUMS, { color: onSolidColor }]}
          className={primaryTextClass}
        >
          <Text
            style={[TABULAR_NUMS, { color: onSolidColor }]}
            className={`${secondaryTextClass} opacity-75`}
          >
            #
          </Text>
          {rank}
        </Text>
      </View>
    );
  }

  if (rating === null) {
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
  const tileSizeClass =
    size === 'lg'
      ? 'min-w-[64px] h-12 px-3.5 rounded-2xl'
      : 'min-w-[52px] h-10 px-2.5 rounded-xl';
  const scoreParts = splitScoreParts(rating);

  return (
    <View
      style={{ borderColor }}
      className={[
        tileSizeClass,
        'border-[1.5px] items-center justify-center shrink-0',
        tintClass,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
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
}) => {
  const ranked = item.position !== null;
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

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibleDescription}
      accessibilityHint="Open item details"
      accessibilityState={{ disabled, selected }}
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
        {ranked && rankingMode === 'rank' ? (
          <ItemRankBadge
            rankingMode="rank"
            rating={item.rating}
            rank={rank}
            color={color}
            className="mr-3"
          />
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
            <Text className="text-body-medium text-ink-muted dark:text-ink-muted-dark mt-0.5">
              Not ranked yet
            </Text>
          ) : null}
        </View>
        {ranked && rankingMode === 'score' ? (
          <ItemRankBadge
            rankingMode="score"
            rating={item.rating}
            rank={rank}
            color={color}
            className="ml-3"
          />
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

export const ListItemEmptyState: React.FC<{
  onAdd: () => void;
  disabled?: boolean;
}> = ({ onAdd, disabled = false }) => {
  const colors = useThemeColors();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Add your first item. Add an item, then compare to rank it."
      disabled={disabled}
      onPress={onAdd}
      activeOpacity={0.7}
      className="w-full min-h-24 flex-row items-center gap-3 border-2 border-dashed border-control rounded-2xl bg-surface-muted px-4 py-3 dark:border-control-dark dark:bg-surface-muted-dark"
    >
      <Ionicons
        name="add-circle-outline"
        size={24}
        color={colors['accent-text']}
        accessible={false}
      />
      <View className="flex-1 min-w-0 gap-1">
        <Text className="text-title-small font-semibold text-ink dark:text-ink-dark">
          Add your first item
        </Text>
        <Text className="text-body-medium text-ink-muted dark:text-ink-muted-dark">
          Add an item, then compare to rank it.
        </Text>
      </View>
    </TouchableOpacity>
  );
};
