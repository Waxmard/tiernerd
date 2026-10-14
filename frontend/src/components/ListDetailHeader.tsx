import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../design-system/components';
import { type ListColor, palette } from '../design-system/tokens/colors';
import { useTheme } from '../providers/ThemeProvider';

export interface RankOutcome {
  itemId: string;
  name: string;
  rank: number;
  rankedCount: number;
  score: number;
}

interface ListDetailHeaderProps {
  title: string;
  color: ListColor | null;
  itemCount: number;
  rankedCount: number;
  addDisabled: boolean;
  onAdd: () => void;
  description: string | null;
  metadataError: boolean;
  outcome: RankOutcome | null;
  deleteDisabled: boolean;
  onBack: () => void;
  onDelete: () => void;
  onRetryMetadata: () => void;
  onDismissOutcome: () => void;
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
  outcome,
  deleteDisabled,
  onBack,
  onDelete,
  onRetryMetadata,
  onDismissOutcome,
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
      <View className="flex-row flex-wrap items-start gap-2 py-2 pt-6 desktop:pt-0 bg-surface dark:bg-surface-dark shrink-0">
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
            className="text-title-large text-ink dark:text-ink-dark text-left"
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
      <View className="flex-row flex-wrap items-center justify-between gap-2 py-2 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark shrink-0">
        <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark shrink">
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
      {outcome ? (
        <View
          className="flex-row items-center bg-accent-tint dark:bg-accent-tint-dark border border-control dark:border-control-dark rounded-lg px-4 py-2 mb-4"
          accessibilityLiveRegion="polite"
        >
          <View className="flex-1">
            <Text className="text-body-medium font-semibold text-ink dark:text-ink-dark">
              “{outcome.name}” ranked #{outcome.rank} of {outcome.rankedCount}.
            </Text>
            <Text className="text-label-medium text-ink-muted dark:text-ink-muted-dark mt-0.5">
              Score {outcome.score.toFixed(1)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onDismissOutcome}
            accessibilityRole="button"
            accessibilityLabel="Dismiss ranking result"
            className="w-10 h-10 items-center justify-center"
          >
            <Ionicons
              name="close"
              size={20}
              color={colors.ink}
              accessible={false}
            />
          </TouchableOpacity>
        </View>
      ) : null}
    </>
  );
};
