import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../providers/ThemeProvider';
import type { Item } from '../services/itemsService';
import type { ListRankingMode } from '../services/listsService';

interface ListDetailItemRowProps {
  item: Item;
  rank: number | null;
  rankingMode: ListRankingMode;
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
  selected,
  disabled,
  onPress,
}) => {
  const ranked = item.position !== null;
  const score = ranked && item.rating !== null ? item.rating.toFixed(1) : null;
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
        {ranked && (rankingMode === 'rank' ? rank !== null : score !== null) ? (
          <Text className="ml-3 shrink-0 text-body-medium font-semibold text-ink dark:text-ink-dark">
            {rankingMode === 'rank' ? rank : score}
          </Text>
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
