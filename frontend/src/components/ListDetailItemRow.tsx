import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../providers/ThemeProvider';
import type { Item } from '../services/itemsService';
import {
  type PreferenceBand,
  preferenceBand,
} from '../services/themePreference';
import { RANGE_OPTIONS, RangeBadge } from './RangeSelector';

const RAIL_CLASS: Record<PreferenceBand, string> = {
  1: 'bg-preference-1 dark:bg-preference-1-dark',
  2: 'bg-preference-2 dark:bg-preference-2-dark',
  3: 'bg-preference-3 dark:bg-preference-3-dark',
  4: 'bg-preference-4 dark:bg-preference-4-dark',
};

interface ListDetailItemRowProps {
  item: Item;
  rank: number | null;
  rankedCount: number;
  selected: boolean;
  disabled: boolean;
  onPress: (item: Item) => void;
}

const ROW_CLASS =
  'flex-row items-center border-2 px-4 py-3 mb-2 min-h-16 rounded-2xl bg-surface dark:bg-surface-dark';

export const ListDetailItemRow: React.FC<ListDetailItemRowProps> = ({
  item,
  rank,
  rankedCount,
  selected,
  disabled,
  onPress,
}) => {
  const isRanked = item.rating !== null;
  const band = preferenceBand(rank, rankedCount);
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
        {band !== null ? (
          <View
            accessible={false}
            importantForAccessibility="no"
            pointerEvents="none"
            className={[
              'absolute left-0 top-0 bottom-0 w-[6px] rounded-l-md',
              RAIL_CLASS[band],
            ].join(' ')}
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
          {isRanked ? (
            rangeLabel ? (
              <RangeBadge tierSet={item.tier_set} />
            ) : null
          ) : (
            <Text className="text-body-medium text-ink-muted dark:text-ink-muted-dark mt-0.5">
              Not ranked yet
            </Text>
          )}
        </View>
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
      accessibilityLabel="Add your first item. Choose a starting category, then compare."
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
          Choose a starting category, then compare.
        </Text>
      </View>
    </TouchableOpacity>
  );
};
