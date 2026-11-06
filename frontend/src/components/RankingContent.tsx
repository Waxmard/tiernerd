import { Image, Pressable, Text, View } from 'react-native';
import { BaseModalContent, Button } from '../design-system/components';
import { useThemeColors } from '../providers/ThemeProvider';
import type { Item } from '../services/itemsService';
import type { RankingAnswer } from '../services/rankingEngine';
import type { RankingView } from './itemWorkspaceTypes';

export interface RankingContentProps {
  listTitle: string;
  item: Item;
  view: RankingView;
  presentation: 'modal' | 'panel';
  isBusy: boolean;
  error: string | null;
  onAnswer: (result: RankingAnswer) => void;
  onUndo: () => void;
  onCancel: () => void;
  onPause?: () => void;
}

interface ComparisonChoiceProps {
  item: Item;
  label: string;
  isBusy: boolean;
  onPress: () => void;
}

const choiceTextClass = (isBusy: boolean): string =>
  isBusy
    ? 'text-ink-disabled dark:text-ink-disabled-dark'
    : 'text-ink dark:text-ink-dark';

function ComparisonChoice({
  item,
  label,
  isBusy,
  onPress,
}: ComparisonChoiceProps) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}. ${label}.`}
      accessibilityHint="Select the better item."
      accessibilityState={{ disabled: isBusy }}
      disabled={isBusy}
      onPress={onPress}
      className="min-h-16 border border-control dark:border-control-dark rounded-2xl p-3 gap-2 bg-surface dark:bg-surface-dark"
      style={({ pressed }) =>
        pressed && !isBusy
          ? { transform: [{ scale: 0.96 }], borderColor: colors['accent-text'] }
          : undefined
      }
    >
      <View className="flex-row items-center gap-2">
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            accessibilityLabel={item.name}
            className="w-16 h-16 rounded"
          />
        ) : null}
        <View className="flex-1 min-w-0 gap-0.5">
          <Text
            className={['text-title-medium', choiceTextClass(isBusy)].join(' ')}
          >
            {item.name}
          </Text>
          <Text
            className={['text-body-medium', choiceTextClass(isBusy)].join(' ')}
          >
            {label}
          </Text>
        </View>
      </View>
      {item.description ? (
        <Text
          className={['text-body-medium', choiceTextClass(isBusy)].join(' ')}
        >
          {item.description}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function RankingContent({
  listTitle,
  item,
  view,
  presentation,
  isBusy,
  error,
  onAnswer,
  onUndo,
  onCancel,
  onPause,
}: RankingContentProps) {
  const isAsking = !view.isDecided && view.target !== null;
  const title = view.isDecided ? 'Saving ranking…' : 'Which is better?';

  return (
    <BaseModalContent
      title={title}
      error={error}
      isLoading={isBusy}
      closeText="Cancel ranking"
      presentation={presentation}
      onClose={onPause ?? onCancel}
      footer={
        onPause ? (
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Button
              title="Cancel ranking"
              variant="text"
              onPress={onCancel}
              disabled={isBusy}
              textClassName="text-danger-text dark:text-danger-text-dark"
              className="shrink"
            />
            <Button
              title="Finish later"
              variant="secondary"
              onPress={onPause}
              disabled={isBusy}
              className="shrink"
            />
          </View>
        ) : undefined
      }
    >
      <View className="gap-1 mb-4">
        <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
          {listTitle}
        </Text>
        {isAsking ? (
          <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
            Question {view.answered + 1} · up to {view.limit} questions
          </Text>
        ) : null}
      </View>
      {view.isDecided ? (
        <View className="gap-2">
          <Text
            accessibilityLiveRegion="polite"
            className="text-body-medium text-ink dark:text-ink-dark text-left"
          >
            {view.preview
              ? `Rank #${view.preview.rank} of ${view.preview.rankedCount} · ${view.preview.score.toFixed(1)} score`
              : 'Saving ranking…'}
          </Text>
        </View>
      ) : isAsking && view.target ? (
        <View className="gap-2">
          <ComparisonChoice
            item={item}
            label="Item being ranked"
            isBusy={isBusy}
            onPress={() => onAnswer('better')}
          />
          <ComparisonChoice
            item={view.target}
            label="Existing item"
            isBusy={isBusy}
            onPress={() => onAnswer('worse')}
          />
          {view.canUndo ? (
            <Button
              title="Undo last answer"
              variant="secondary"
              onPress={onUndo}
              disabled={isBusy}
              fullWidth
              className="mt-2"
            />
          ) : null}
        </View>
      ) : (
        <Text className="text-body-medium text-ink dark:text-ink-dark text-left">
          Comparing this item against the list…
        </Text>
      )}
    </BaseModalContent>
  );
}
