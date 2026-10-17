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
    <>
      <View className="flex-row flex-wrap items-start gap-2 py-2 pt-6 desktop:pt-4 bg-surface dark:bg-surface-dark shrink-0">
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
            'w-7 h-7 rounded-lg shrink-0 items-center justify-center',
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
            className="text-[30px] leading-[36px] font-semibold text-ink dark:text-ink-dark text-left"
          >
            {title}
          </Text>
          {description?.trim() ? (
            <ScrollView
              className="max-h-[72px]"
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              <Text className="text-[14px] leading-[21px] text-ink-muted dark:text-ink-muted-dark">
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
      <View className="flex-row flex-wrap items-center justify-between gap-2 py-2 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark shrink-0">
        <Text className="text-[14px] leading-[21px] text-ink-muted dark:text-ink-muted-dark shrink">
          {rankedCount} of {itemCount} ranked
        </Text>
        <Button
          title="Add item"
          onPress={onAdd}
          disabled={addDisabled}
          size="large"
          className="min-h-14"
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
      <Text className="text-[14px] leading-[21px] text-ink dark:text-ink-dark py-2 shrink-0">
        Stronger green = more preferred. Paler green = less preferred.
      </Text>
    </>
  );
};
