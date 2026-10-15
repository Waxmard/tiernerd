import type React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import type { Item } from '../services/itemsService';
import { preferenceColor } from '../services/themePreference';
import { RANGE_OPTIONS, RangeBadge } from './RangeSelector';

export interface FocusTarget {
  focus?: () => void;
}

interface ListDetailItemRowProps {
  item: Item;
  rank: number | null;
  rankedCount: number;
  selected: boolean;
  disabled: boolean;
  onPress: (item: Item) => void;
  onFocusTarget: (itemId: string, element: FocusTarget | null) => void;
}

const ROW_CLASS =
  'flex-row items-center border-2 p-[14px] mb-2 min-h-16 rounded-lg bg-surface dark:bg-surface-dark';

export const ListDetailItemRow: React.FC<ListDetailItemRowProps> = ({
  item,
  rank,
  rankedCount,
  selected,
  disabled,
  onPress,
  onFocusTarget,
}) => {
  const isRanked = item.rating !== null;
  const railColor = preferenceColor(rank, rankedCount);
  const rangeLabel = RANGE_OPTIONS.find(
    (option) => option.value === item.tier_set
  )?.label;
  const accessibleDescription = [
    item.name,
    rank !== null ? `rank ${rank}` : null,
    !isRanked ? 'Not ranked yet' : null,
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
      accessibilityState={{ disabled, selected }}
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
            ? 'border-accent-text dark:border-accent-text-dark'
            : 'border-transparent',
          railColor ? 'pl-5' : '',
        ].join(' ')}
      >
        {railColor ? (
          <View
            nativeID={`tiernerd-preference-rail-${item.item_id}`}
            accessible={false}
            importantForAccessibility="no"
            pointerEvents="none"
            className="absolute left-0 top-0 bottom-0 w-[6px] rounded-l-md"
            style={{ backgroundColor: railColor }}
          />
        ) : null}
        <View className="flex-1 min-w-0">
          <Text className="text-[18px] leading-[25.2px] font-semibold text-ink dark:text-ink-dark">
            {item.name}
          </Text>
          {item.description?.trim() ? (
            <Text className="text-[14px] leading-[21px] text-ink-muted dark:text-ink-muted-dark">
              {item.description}
            </Text>
          ) : null}
          {isRanked ? (
            rangeLabel ? (
              <RangeBadge tierSet={item.tier_set} />
            ) : null
          ) : (
            <Text className="text-[14px] leading-[21px] text-ink-muted dark:text-ink-muted-dark mt-0.5">
              Not ranked yet
            </Text>
          )}
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
