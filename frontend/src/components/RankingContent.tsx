import type React from 'react';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Image, Pressable, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInRight,
  FadeOutLeft,
  LayoutAnimationConfig,
  ZoomIn,
} from 'react-native-reanimated';
import { BaseModalContent, Button, Emoji } from '../design-system/components';
import { useListHue, useTheme } from '../providers/ThemeProvider';
import type { Item } from '../services/itemsService';
import type { ListRankingMode } from '../services/listsService';
import {
  formatScore,
  type RankingAnswer,
  rankMedal,
} from '../services/rankingEngine';
import type { RankingResult, RankingView } from './itemWorkspaceTypes';
import { ItemRankBadge, TABULAR_NUMS } from './ListDetailItemRow';

const RESULT_HOLD_MS = 1500;

export interface RankingContentProps {
  listTitle: string;
  item: Item;
  view: RankingView;
  isBusy: boolean;
  rankingMode?: ListRankingMode;
  onAnswer: (result: RankingAnswer) => void;
  onUndo: () => void;
  onCancel: () => void;
  onPause: () => void;
}

interface ComparisonChoiceProps {
  item: Item;
  accessibilityLabel: string;
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
  isBusy,
  onPress,
  children,
}: ComparisonChoiceProps) {
  const { colors } = useTheme();
  const hue = useListHue();
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
      {item.icon ? <Emoji symbol={item.icon} size={40} /> : null}
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
  isBusy,
  rankingMode = 'rank',
  onAnswer,
  onUndo,
  onCancel,
  onPause,
}: RankingContentProps) {
  const hue = useListHue();
  const target = view.target;
  const caption = item.position === null ? 'New' : 'Re-ranking';

  return (
    <BaseModalContent
      title="Which is better?"
      emoji="⚖️"
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
              <Animated.View
                style={{
                  height: '100%',
                  borderRadius: 9999,
                  width: `${(view.answered / view.limit) * 100}%`,
                  backgroundColor: hue.solid,
                  transitionProperty: 'width',
                  transitionDuration: 250,
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
        <LayoutAnimationConfig skipEntering>
          <View className="flex-1 gap-2">
            <ComparisonChoice
              item={item}
              accessibilityLabel={`${item.name}. ${caption}.`}
              isBusy={isBusy}
              onPress={() => onAnswer('better')}
            >
              <View
                className="flex-row items-center gap-1 rounded-full px-3 py-1"
                style={{ backgroundColor: hue.solid }}
              >
                <Emoji
                  symbol={item.position === null ? '🌱' : '🔄'}
                  size={14}
                />
                <Text
                  className="text-label-large"
                  style={{ color: hue.onSolid }}
                >
                  {caption}
                </Text>
              </View>
            </ComparisonChoice>
            <Text className="text-label-large text-center text-ink-muted dark:text-ink-muted-dark">
              or
            </Text>
            <Animated.View
              key={target.item_id}
              entering={FadeInRight.duration(220)}
              exiting={FadeOutLeft.duration(160)}
              style={{ flex: 1 }}
            >
              <ComparisonChoice
                item={target}
                accessibilityLabel={
                  view.targetRank !== null
                    ? `${target.name}. Ranked ${view.targetRank} of ${view.rankedCount}.`
                    : `${target.name}. Existing item.`
                }
                isBusy={isBusy}
                onPress={() => onAnswer('worse')}
              >
                <View className="flex-row items-center gap-2">
                  <ItemRankBadge
                    rankingMode={rankingMode}
                    rating={target.rating}
                    rank={view.targetRank}
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
            </Animated.View>
          </View>
        </LayoutAnimationConfig>
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

export function RankingResultContent({
  item,
  result,
  rankingMode = 'rank',
  onDone,
}: {
  item: Item;
  result: RankingResult;
  rankingMode?: ListRankingMode;
  onDone: () => void;
}) {
  const summary =
    rankingMode === 'score'
      ? `Scored ${formatScore(result.score)}`
      : `Ranked #${result.rank} of ${result.total}`;
  const latest = useRef({ onDone, summary });
  latest.current = { onDone, summary };
  const medal = rankMedal(result.rank);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(latest.current.summary);
    const timer = setTimeout(() => latest.current.onDone(), RESULT_HOLD_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <BaseModalContent
      title={rankingMode === 'score' ? 'Scored!' : 'Ranked!'}
      emoji="🎉"
      onClose={onDone}
      scrollable={false}
      footer={<Button title="Done" variant="text" onPress={onDone} fullWidth />}
    >
      <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${summary}. Tap to continue.`}
          onPress={onDone}
          className="flex-1 items-center justify-center gap-3"
        >
          {item.icon ? <Emoji symbol={item.icon} size={56} /> : null}
          <Text
            numberOfLines={3}
            className="text-headline-small text-center text-ink dark:text-ink-dark"
          >
            {item.name}
          </Text>
          <Animated.View entering={ZoomIn.delay(120).duration(280)}>
            <View className="flex-row items-center gap-3">
              {medal ? <Emoji symbol={medal} size={30} /> : null}
              <ItemRankBadge
                rankingMode={rankingMode}
                rating={result.score}
                rank={result.rank}
                size="lg"
              />
            </View>
          </Animated.View>
          <Text
            style={TABULAR_NUMS}
            className="text-body-medium text-ink-muted dark:text-ink-muted-dark"
          >
            {rankingMode === 'rank'
              ? `of ${result.total} ranked`
              : `Rank #${result.rank} of ${result.total}`}
          </Text>
        </Pressable>
      </Animated.View>
    </BaseModalContent>
  );
}
