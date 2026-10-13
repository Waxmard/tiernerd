import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { AppColors } from '../design-system/tokens';
import type { Item } from '../services/itemsService';
import { styles } from './ListDetailScreen.styles';
import { RANGE_OPTIONS } from './RangeSelector';

export interface FocusTarget {
  focus?: () => void;
}

interface ListDetailItemRowProps {
  item: Item;
  selected: boolean;
  disabled: boolean;
  onPress: (item: Item) => void;
  onFocusTarget: (itemId: string, element: FocusTarget | null) => void;
}

export const ListDetailItemRow: React.FC<ListDetailItemRowProps> = ({
  item,
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
    isRanked ? ['score', item.rating?.toFixed(1)].join(' ') : 'Not ranked yet',
    isRanked && rangeLabel ? ['range', rangeLabel].join(' ') : null,
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
      <View style={[styles.itemRow, selected && styles.selectedItemRow]}>
        <Text style={[styles.itemScore, !isRanked && styles.itemScoreUnranked]}>
          {isRanked ? item.rating?.toFixed(1) : '—'}
        </Text>
        <View style={styles.itemDetails}>
          <Text style={styles.itemName} numberOfLines={2}>
            {item.name}
          </Text>
          {item.description?.trim() ? (
            <Text style={styles.itemDescription} numberOfLines={1}>
              {item.description}
            </Text>
          ) : null}
          {isRanked && rangeLabel ? (
            <Text style={styles.itemRange}>{rangeLabel}</Text>
          ) : (
            <Text style={styles.itemUnranked}>Not ranked yet</Text>
          )}
        </View>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={AppColors.secondary.muted}
          accessible={false}
        />
      </View>
    </TouchableOpacity>
  );
};

export const ListItemEmptyState: React.FC = () => (
  <View style={styles.emptyState}>
    <Image
      source={require('../../assets/logo-transparent.png')}
      style={styles.emptyStateImage}
      accessible={false}
    />
    <Text style={styles.emptyStateTitle}>No items yet</Text>
    <Text style={styles.emptyStateText}>
      Tap the + button to add your first item
    </Text>
  </View>
);
