import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../design-system/components';
import { type ListColor, palette } from '../design-system/tokens/colors';
import { useTheme } from '../providers/ThemeProvider';

interface ListDetailHeaderProps {
  title: string;
  color: ListColor | null;
  itemCount: number;
  rankedCount: number;
  addDisabled: boolean;
  onAdd: () => void;
  description: string | null;
  metadataError: boolean;
  itemsError: string | null;
  showingSavedItems: boolean;
  onRetryItems: () => void;
  deleteDisabled: boolean;
  onBack: () => void;
  onDelete: () => void;
  onRetryMetadata: () => void;
}

const CHIP_CLASS: Record<ListColor, string> = {
  blue: 'bg-list-blue-tint dark:bg-list-blue-tint-dark',
  teal: 'bg-list-teal-tint dark:bg-list-teal-tint-dark',
  amber: 'bg-list-amber-tint dark:bg-list-amber-tint-dark',
  pink: 'bg-list-pink-tint dark:bg-list-pink-tint-dark',
};

const RETRY_BUTTON_CLASS =
  'border border-control dark:border-control-dark rounded px-4 py-1 min-h-11 justify-center';

const RETRY_TEXT_CLASS =
  'text-label-medium font-semibold text-accent-text dark:text-accent-text-dark';

export const ListDetailHeader: React.FC<ListDetailHeaderProps> = ({
  title,
  color,
  itemCount,
  rankedCount,
  addDisabled,
  onAdd,
  description,
  metadataError,
  itemsError,
  showingSavedItems,
  onRetryItems,
  deleteDisabled,
  onBack,
  onDelete,
  onRetryMetadata,
}) => {
  const { scheme, colors } = useTheme();
  const chipClass = color
    ? CHIP_CLASS[color]
    : 'bg-accent-tint dark:bg-accent-tint-dark';
  const chipIconColor = color
    ? palette.list[color][scheme]['on-tint']
    : colors['accent-text'];
  const deleteIconColor = deleteDisabled
    ? colors['ink-disabled']
    : colors['danger-text'];
  return (
    <View className="gap-2 pt-2 pb-3 bg-canvas dark:bg-canvas-dark border-b border-line dark:border-line-dark shrink-0">
      <View className="flex-row items-start gap-2">
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
            color={colors.ink}
            accessible={false}
          />
        </TouchableOpacity>
        <View
          className={[
            'w-6 h-6 rounded-lg shrink-0 items-center justify-center mt-2',
            chipClass,
          ].join(' ')}
        >
          <Ionicons
            name="layers-outline"
            size={16}
            color={chipIconColor}
            accessible={false}
          />
        </View>
        <View className="flex-1 min-w-0 gap-1">
          <Text
            accessibilityRole="header"
            className="text-headline-small text-ink dark:text-ink-dark text-left"
          >
            {title}
          </Text>
          {description?.trim() ? (
            <ScrollView
              className="max-h-[72px]"
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              <Text className="text-body-medium text-ink-muted dark:text-ink-muted-dark">
                {description}
              </Text>
            </ScrollView>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={onDelete}
          disabled={deleteDisabled}
          accessibilityRole="button"
          accessibilityLabel="Delete list"
          accessibilityState={{ disabled: deleteDisabled }}
          className="w-11 h-11 items-center justify-center shrink-0"
          activeOpacity={0.7}
          testID="delete-list"
        >
          <Ionicons
            name="trash-outline"
            size={24}
            color={deleteIconColor}
            accessible={false}
          />
        </TouchableOpacity>
      </View>
      {metadataError ? (
        <View className="flex-row items-center justify-between mt-2">
          <Text
            className="text-body-small text-danger-text dark:text-danger-text-dark shrink"
            accessibilityRole="alert"
          >
            Unable to load list details.
          </Text>
          <TouchableOpacity
            onPress={onRetryMetadata}
            accessibilityRole="button"
            accessibilityLabel="Retry loading list details"
            className={RETRY_BUTTON_CLASS}
          >
            <Text className={RETRY_TEXT_CLASS}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View className="flex-row items-center gap-2">
        <View className="flex-1 min-w-0 gap-1">
          <Text className="text-body-medium text-ink-muted dark:text-ink-muted-dark">
            {rankedCount} of {itemCount} ranked
          </Text>
          <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
            Stronger green = more preferred. Paler green = less preferred.
          </Text>
        </View>
        <Button
          title="Add item"
          onPress={onAdd}
          disabled={addDisabled}
          size="small"
          icon={
            <Ionicons
              name="add-circle-outline"
              size={20}
              color={colors['on-accent']}
              accessible={false}
            />
          }
          testID="fab-add-item"
        />
      </View>
      {showingSavedItems ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-body-small text-ink-muted dark:text-ink-muted-dark"
        >
          Showing saved items. Refreshing…
        </Text>
      ) : null}
      {itemsError ? (
        <View className="flex-row items-center justify-between">
          <Text
            accessibilityRole="alert"
            className="text-body-small text-danger-text dark:text-danger-text-dark shrink"
          >
            {itemsError}
          </Text>
          <TouchableOpacity
            onPress={onRetryItems}
            accessibilityRole="button"
            accessibilityLabel="Retry refreshing items"
            className={RETRY_BUTTON_CLASS}
          >
            <Text className={RETRY_TEXT_CLASS}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};
