import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import {
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button } from '../design-system/components';
import type {
  ListColor,
  ListCover,
  ListIcon,
} from '../design-system/tokens/colors';
import { useTheme } from '../providers/ThemeProvider';
import type { ListPhoto } from '../services/listCoversService';
import type {
  ListOptionsInput,
  ListRankingMode,
} from '../services/listsService';
import { ListPhotoCover, PhotoAttribution } from './ListPhotoCover';
import { ListRankingOptions } from './ListRankingOptions';

interface ListDetailHeaderProps {
  title: string;
  color: ListColor | null;
  icon: ListIcon | null;
  cover: ListCover | null;
  coverPhoto?: ListPhoto | null;
  listId: string;
  addDisabled: boolean;
  addLoading: boolean;
  onAdd: () => void;
  description: string | null;
  deleteDisabled: boolean;
  optionsKey: string;
  rankingMode: ListRankingMode;
  optionsDisabled: boolean;
  onSaveOptions: (options: ListOptionsInput) => Promise<void>;
  onOptionsVisibilityChange: (open: boolean) => void;
  onBack: () => void;
  onDelete: () => void;
}

export const ListDetailHeader: React.FC<ListDetailHeaderProps> = ({
  title,
  icon,
  cover,
  color,
  coverPhoto = null,
  listId,
  addDisabled,
  addLoading,
  onAdd,
  description,
  deleteDisabled,
  optionsKey,
  rankingMode,
  optionsDisabled,
  onSaveOptions,
  onOptionsVisibilityChange,
  onBack,
  onDelete,
}) => {
  const { colors } = useTheme();
  const deleteIconColor = deleteDisabled
    ? colors['ink-disabled']
    : colors['danger-text'];
  const header = (
    <View className="gap-2 p-3 mt-2 mb-2 rounded-2xl bg-surface dark:bg-surface-dark shrink-0">
      <View className="flex-row items-start">
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
        <View className="flex-1 min-w-0 min-h-11 justify-center px-2">
          <Text
            accessibilityRole="header"
            className="text-headline-small text-ink dark:text-ink-dark text-left"
          >
            {title}
          </Text>
        </View>
        <ListRankingOptions
          key={optionsKey}
          title={title}
          rankingMode={rankingMode}
          color={color}
          icon={icon}
          cover={cover}
          coverPhoto={coverPhoto}
          listId={listId}
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
      {cover === 'landscape' || coverPhoto ? (
        <View className="h-28 desktop:h-40 rounded-xl overflow-hidden">
          <ListPhotoCover
            cover={cover}
            photo={coverPhoto}
            listId={listId}
            color={color}
            className="w-full h-full"
          />
        </View>
      ) : null}
      {coverPhoto?.source === 'unsplash' ? (
        <View className="px-1 -mt-1">
          <PhotoAttribution photo={coverPhoto} />
        </View>
      ) : null}
      {description?.trim() ? (
        <ScrollView
          className="max-h-[72px]"
          role={Platform.OS === 'web' ? 'region' : undefined}
          accessibilityLabel={
            Platform.OS === 'web' ? 'List description' : undefined
          }
          tabIndex={Platform.OS === 'web' ? 0 : undefined}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          <Text className="text-body-medium text-ink-muted dark:text-ink-muted-dark">
            {description}
          </Text>
        </ScrollView>
      ) : null}
      {addLoading ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-body-small text-ink-muted dark:text-ink-muted-dark"
        >
          Loading list…
        </Text>
      ) : null}
      <View className="flex-row justify-end">
        <Button
          title="Add item"
          onPress={onAdd}
          disabled={addDisabled}
          loading={addLoading}
          variant="text"
          size="small"
          className="shrink"
          icon={
            addLoading ? undefined : (
              <Ionicons
                name="add"
                size={20}
                color={colors[addDisabled ? 'ink-disabled' : 'accent-text']}
                accessible={false}
              />
            )
          }
        />
      </View>
    </View>
  );
  return (
    <ScrollView
      role={Platform.OS === 'web' ? 'region' : undefined}
      accessibilityLabel={Platform.OS === 'web' ? 'List details' : undefined}
      tabIndex={Platform.OS === 'web' ? 0 : undefined}
      style={{ flexGrow: 0, minHeight: 0, maxHeight: '50%' }}
      alwaysBounceVertical={false}
      nestedScrollEnabled
      showsVerticalScrollIndicator
    >
      {header}
    </ScrollView>
  );
};
