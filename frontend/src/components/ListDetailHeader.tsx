import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../design-system/components';
import type {
  ListColor,
  ListCover,
  ListIcon,
} from '../design-system/tokens/colors';
import { useTheme } from '../providers/ThemeProvider';
import type {
  ListOptionsInput,
  ListRankingMode,
} from '../services/listsService';
import { LandscapeBackdrop, ListIdentityBadge } from './ImmersiveBoard';
import { ListRankingOptions } from './ListRankingOptions';

interface ListDetailHeaderProps {
  title: string;
  color: ListColor | null;
  icon: ListIcon | null;
  cover: ListCover | null;
  itemCount: number;
  rankedCount: number;
  addDisabled: boolean;
  addLoading: boolean;
  onAdd: () => void;
  description: string | null;
  metadataError: boolean;
  itemsError: string | null;
  showingSavedItems: boolean;
  onRetryItems: () => void;
  deleteDisabled: boolean;
  optionsKey: string;
  rankingMode: ListRankingMode;
  optionsDisabled: boolean;
  onSaveOptions: (options: ListOptionsInput) => Promise<void>;
  onOptionsVisibilityChange: (open: boolean) => void;
  onBack: () => void;
  onDelete: () => void;
  onRetryMetadata: () => void;
}

const RETRY_BUTTON_CLASS =
  'border border-control dark:border-control-dark rounded px-4 py-1 min-h-11 justify-center';

const RETRY_TEXT_CLASS =
  'text-label-medium font-semibold text-accent-text dark:text-accent-text-dark';

export const ListDetailHeader: React.FC<ListDetailHeaderProps> = ({
  title,
  icon,
  cover,
  color,
  itemCount,
  rankedCount,
  addDisabled,
  addLoading,
  onAdd,
  description,
  metadataError,
  itemsError,
  showingSavedItems,
  onRetryItems,
  deleteDisabled,
  optionsKey,
  rankingMode,
  optionsDisabled,
  onSaveOptions,
  onOptionsVisibilityChange,
  onBack,
  onDelete,
  onRetryMetadata,
}) => {
  const { colors } = useTheme();
  const deleteIconColor = deleteDisabled
    ? colors['ink-disabled']
    : colors['danger-text'];
  return (
    <View className="gap-3 p-3 mt-2 mb-2 rounded-2xl bg-surface dark:bg-surface-dark shrink-0">
      <View className="flex-row items-center">
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
        <View className="flex-1 min-w-0 px-2">
          <ListIdentityBadge color={color} icon={icon} />
        </View>
        <ListRankingOptions
          key={optionsKey}
          rankingMode={rankingMode}
          color={color}
          icon={icon}
          cover={cover}
          disabled={optionsDisabled}
          onSave={onSaveOptions}
          onVisibilityChange={onOptionsVisibilityChange}
        />
        <TouchableOpacity
          onPress={onDelete}
          disabled={deleteDisabled}
          accessibilityRole="button"
          accessibilityLabel="Delete list"
          accessibilityState={{ disabled: deleteDisabled }}
          className="w-11 h-11 items-center justify-center shrink-0"
          activeOpacity={0.7}
        >
          <Ionicons
            name="trash-outline"
            size={24}
            color={deleteIconColor}
            accessible={false}
          />
        </TouchableOpacity>
      </View>
      {cover === 'landscape' ? (
        <View className="h-28 desktop:h-40 rounded-xl overflow-hidden">
          <LandscapeBackdrop variant={color} className="absolute inset-0" />
        </View>
      ) : null}
      <Text
        accessibilityRole="header"
        className="text-headline-large text-ink dark:text-ink-dark text-left"
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
        <Text className="flex-1 min-w-0 text-body-medium text-ink-muted dark:text-ink-muted-dark">
          {rankedCount} of {itemCount} ranked
        </Text>
        <Button
          title="Add item"
          onPress={onAdd}
          disabled={addDisabled}
          loading={addLoading}
          size="small"
          icon={
            addLoading ? undefined : (
              <Ionicons
                name="add-circle-outline"
                size={20}
                color={colors[addDisabled ? 'ink-disabled' : 'on-accent']}
                accessible={false}
              />
            )
          }
        />
      </View>
      {showingSavedItems || addLoading ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-body-small text-ink-muted dark:text-ink-muted-dark"
        >
          {showingSavedItems
            ? 'Showing saved items. Refreshing…'
            : 'Loading list…'}
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
