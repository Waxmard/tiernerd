import type React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { BaseModalContent, Button, Emoji } from '../design-system/components';
import type { ListColor } from '../design-system/tokens/colors';
import { useListHue, useTheme } from '../providers/ThemeProvider';
import type { Item } from '../services/itemsService';
import type { ListRankingMode } from '../services/listsService';
import type { RankingAnswer } from '../services/rankingEngine';
import type { RankingView } from './itemWorkspaceTypes';
import { ItemRankBadge, TABULAR_NUMS } from './ListDetailItemRow';

export interface RankingContentProps {
  listTitle: string;
  item: Item;
  view: RankingView;
  presentation: 'modal' | 'panel';
  isBusy: boolean;
  rankingMode?: ListRankingMode;
  color?: ListColor | null;
  onAnswer: (result: RankingAnswer) => void;
  onUndo: () => void;
  onCancel: () => void;
  onPause: () => void;
}

interface ComparisonChoiceProps {
  item: Item;
  accessibilityLabel: string;
  color: ListColor | null;
  isBusy: boolean;
  onPress: () => void;
  children: React.ReactNode;
}

const choiceTextClass = (isBusy: boolean): string =>
  isBusy
    ? 'text-ink-disabled dark:text-ink-disabled-dark'
    : 'text-ink dark:text-ink-dark';

function ComparisonChoice({
  item,
  accessibilityLabel,
  color,
  isBusy,
  onPress,
  children,
}: ComparisonChoiceProps) {
  const { colors } = useTheme();
  const hue = useListHue(color);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Select the better item."
      accessibilityState={{ disabled: isBusy }}
      disabled={isBusy}
      onPress={onPress}
      className="flex-1 min-h-[120px] items-center justify-center gap-2 rounded-2xl border-2 px-4 py-4"
      style={({ pressed }) => [
        hue.cardStyle,
        pressed && !isBusy
          ? { transform: [{ scale: 0.97 }], borderColor: colors['accent-text'] }
          : null,
      ]}
    >
      {item.image_url ? (
        <Image
          source={{ uri: item.image_url }}
          accessibilityLabel={item.name}
          className="w-20 h-20 rounded-2xl"
        />
      ) : null}
      <Text
        numberOfLines={3}
        className={[
          'text-headline-small text-center',
          choiceTextClass(isBusy),
        ].join(' ')}
      >
        {item.name}
      </Text>
      {item.description ? (
        <Text
          numberOfLines={2}
          className="text-body-medium text-center text-ink-muted dark:text-ink-muted-dark"
        >
          {item.description}
        </Text>
      ) : null}
      {children}
    </Pressable>
  );
}

export function RankingContent({
  listTitle,
  item,
  view,
  presentation,
  isBusy,
  rankingMode = 'rank',
  color = null,
  onAnswer,
  onUndo,
  onCancel,
  onPause,
}: RankingContentProps) {
  const hue = useListHue(color);
  const target = view.target;
  const caption = item.position === null ? 'New' : 'Re-ranking';

  return (
    <BaseModalContent
      title="Which is better?"
      emoji="⚖️"
      color={color}
      presentation={presentation}
      onClose={onPause}
      footer={
        <View className="gap-2">
          <View className="flex-row gap-2">
            <Button
              icon={<Emoji symbol="↩️" size={18} />}
              title="Undo last answer"
              variant="secondary"
              onPress={onUndo}
              disabled={isBusy || !view.canUndo}
              className="flex-1"
            />
            <Button
              icon={<Emoji symbol="🔖" size={18} />}
              title="Finish later"
              variant="secondary"
              onPress={onPause}
              disabled={isBusy}
              className="flex-1"
            />
          </View>
          <Button
            title="Cancel ranking"
            variant="text"
            onPress={onCancel}
            disabled={isBusy}
            textClassName="text-danger-text dark:text-danger-text-dark"
            fullWidth
          />
        </View>
      }
    >
      <View className="gap-2 mb-3">
        <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
          {listTitle}
        </Text>
        {target ? (
          <>
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="Ranking progress"
              accessibilityValue={{
                min: 0,
                max: view.limit,
                now: view.answered,
              }}
              className="h-1.5 rounded-full overflow-hidden bg-line dark:bg-line-dark"
            >
              <View
                className="h-full rounded-full"
                style={{
                  width: `${(view.answered / view.limit) * 100}%`,
                  backgroundColor: hue.solid,
                }}
              />
            </View>
            <View className="flex-row items-center gap-1">
              <Emoji symbol="📍" size={12} />
              <Text
                style={TABULAR_NUMS}
                className="text-body-small text-ink-muted dark:text-ink-muted-dark"
              >
                Landing between #{view.range.best} and #{view.range.worst} of{' '}
                {view.range.total}
              </Text>
            </View>
          </>
        ) : null}
      </View>
      {target ? (
        <View className="flex-1 gap-2">
          <ComparisonChoice
            item={item}
            accessibilityLabel={`${item.name}. ${caption}.`}
            color={color}
            isBusy={isBusy}
            onPress={() => onAnswer('better')}
          >
            <View
              className="flex-row items-center gap-1 rounded-full px-3 py-1"
              style={{ backgroundColor: hue.solid }}
            >
              <Emoji symbol={item.position === null ? '🌱' : '🔄'} size={14} />
              <Text className="text-label-large" style={{ color: hue.onSolid }}>
                {caption}
              </Text>
            </View>
          </ComparisonChoice>
          <Text className="text-label-large text-center text-ink-muted dark:text-ink-muted-dark">
            or
          </Text>
          <ComparisonChoice
            item={target}
            accessibilityLabel={
              view.targetRank !== null
                ? `${target.name}. Ranked ${view.targetRank} of ${view.rankedCount}.`
                : `${target.name}. Existing item.`
            }
            color={color}
            isBusy={isBusy}
            onPress={() => onAnswer('worse')}
          >
            <View className="flex-row items-center gap-2">
              <ItemRankBadge
                rankingMode={rankingMode}
                rating={target.rating}
                rank={view.targetRank}
                color={color}
              />
              {view.targetRank !== null ? (
                <Text
                  style={TABULAR_NUMS}
                  className="text-body-medium text-ink-muted dark:text-ink-muted-dark"
                >
                  {rankingMode === 'rank'
                    ? `of ${view.rankedCount} ranked`
                    : `Rank #${view.targetRank} of ${view.rankedCount}`}
                </Text>
              ) : null}
            </View>
          </ComparisonChoice>
        </View>
      ) : (
        <View className="flex-1 items-center justify-center">
          <Text className="text-body-medium text-ink dark:text-ink-dark text-center">
            Comparing this item against the list…
          </Text>
        </View>
      )}
    </BaseModalContent>
  );
}
