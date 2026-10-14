import type React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import type { Item } from '../services/itemsService';
import { RANGE_OPTIONS, RangeBadge } from './RangeSelector';

export interface FocusTarget {
  focus?: () => void;
}

interface ListDetailItemRowProps {
  item: Item;
  rank: number | null;
  selected: boolean;
  disabled: boolean;
  onPress: (item: Item) => void;
  onFocusTarget: (itemId: string, element: FocusTarget | null) => void;
}

const TABULAR_NUMS = { fontVariant: ['tabular-nums' as const] };

const ROW_CLASS =
  'flex-row items-center border-b border-line dark:border-line-dark px-2 py-3 mb-2 min-h-16';

export const ListDetailItemRow: React.FC<ListDetailItemRowProps> = ({
  item,
  rank,
  selected,
  disabled,
  onPress,
  onFocusTarget,
}) => {
  const isRanked = item.rating !== null;
  const rangeLabel = RANGE_OPTIONS.find(
    (option) => option.value === item.tier_set
  )?.label;
  const accessibleDescription = [
    item.name,
    rank !== null ? `rank ${rank}` : null,
    isRanked ? `score ${item.rating?.toFixed(1)}` : 'Not ranked yet',
    isRanked && rangeLabel ? `range ${rangeLabel}` : null,
    item.description?.trim() || null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibleDescription}
      accessibilityHint="Open item details"
      accessibilityState={{ disabled }}
      disabled={disabled}
      testID={isRanked ? 'ranked-item' : 'unranked-item'}
      onPress={() => onPress(item)}
      ref={(element) =>
        onFocusTarget(
          item.item_id,
          element ? (element as unknown as FocusTarget) : null
        )
      }
      activeOpacity={0.7}
    >
      <View
        className={[
          ROW_CLASS,
          selected
            ? 'bg-accent-tint dark:bg-accent-tint-dark rounded-lg'
            : 'bg-surface dark:bg-surface-dark',
        ].join(' ')}
      >
        <Text className="w-8 shrink-0 text-label-medium text-ink-muted dark:text-ink-muted-dark">
          {rank === null ? '—' : `#${rank}`}
        </Text>
        <View className="flex-1 min-w-0 mx-2">
          <Text
            className="text-body-large font-semibold text-ink dark:text-ink-dark"
            numberOfLines={2}
          >
            {item.name}
          </Text>
          {item.description?.trim() ? (
            <Text
              className="text-body-small text-ink-muted dark:text-ink-muted-dark"
              numberOfLines={1}
            >
              {item.description}
            </Text>
          ) : null}
          {isRanked ? (
            rangeLabel ? (
              <RangeBadge tierSet={item.tier_set} />
            ) : null
          ) : (
            <Text className="text-label-medium text-ink-muted dark:text-ink-muted-dark mt-0.5">
              Not ranked yet
            </Text>
          )}
        </View>
        <View className="w-12 min-h-8 shrink-0 items-center justify-center rounded-full border border-line dark:border-line-dark bg-canvas dark:bg-canvas-dark">
          <Text
            className={[
              'text-[20px] leading-6 font-semibold',
              isRanked
                ? 'text-accent-text dark:text-accent-text-dark'
                : 'text-ink-muted dark:text-ink-muted-dark',
            ].join(' ')}
            style={TABULAR_NUMS}
          >
            {isRanked ? item.rating?.toFixed(1) : '—'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export const ListItemEmptyState: React.FC = () => (
  <View className="flex-1 items-center justify-center px-6">
    <Image
      source={require('../../assets/logo-transparent.png')}
      className="w-[100px] h-[100px] opacity-30 mb-6"
      accessible={false}
    />
    <Text className="text-headline-small font-semibold text-ink dark:text-ink-dark mb-2">
      No items yet
    </Text>
    <Text className="text-body-medium text-ink-muted dark:text-ink-muted-dark text-center">
      Select Add item to add your first item
    </Text>
  </View>
);
