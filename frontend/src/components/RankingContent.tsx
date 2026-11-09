import type React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { BaseModalContent, Button } from '../design-system/components';
import { type ListColor, palette } from '../design-system/tokens/colors';
import { useTheme } from '../providers/ThemeProvider';
import type { Item } from '../services/itemsService';
import type { ListRankingMode } from '../services/listsService';
import type { RankingAnswer } from '../services/rankingEngine';
import { CHIP_CLASS } from './ImmersiveBoard';
import type { RankingView } from './itemWorkspaceTypes';
import { ItemRankBadge, TABULAR_NUMS } from './ListDetailItemRow';

export interface RankingContentProps {
  listTitle: string;
  item: Item;
  view: RankingView;
  presentation: 'modal' | 'panel';
  isBusy: boolean;
  rankingMode: ListRankingMode;
  color?: ListColor | null;
  onAnswer: (result: RankingAnswer) => void;
  onUndo: () => void;
  onCancel: () => void;
  onPause: () => void;
}

interface ComparisonChoiceProps {
  item: Item;
  accessibilityLabel: string;
  surfaceClassName: string;
  borderColor?: string;
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
  surfaceClassName,
  borderColor,
  isBusy,
  onPress,
  children,
}: ComparisonChoiceProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Select the better item."
      accessibilityState={{ disabled: isBusy }}
      disabled={isBusy}
      onPress={onPress}
      className={[
        'flex-1 min-h-[120px] items-center justify-center gap-2 rounded-2xl border-2 px-4 py-4',
        surfaceClassName,
      ].join(' ')}
      style={({ pressed }) => [
        borderColor ? { borderColor } : null,
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
  rankingMode,
  color = null,
  onAnswer,
  onUndo,
  onCancel,
  onPause,
}: RankingContentProps) {
  const { scheme, colors } = useTheme();
  const target = view.target;
  const tintClass = color
    ? CHIP_CLASS[color]
    : 'bg-accent-tint dark:bg-accent-tint-dark';
  const hueSolid = color
    ? palette.list[color][scheme].solid
    : colors['accent-line'];
  const hueOnTint = color
    ? palette.list[color][scheme]['on-tint']
    : colors['accent-text'];
  const progressFill = color
    ? palette.list[color][scheme].solid
    : colors.accent;
  const caption = item.position === null ? 'New' : 'Re-ranking';

  return (
    <BaseModalContent
      title="Which is better?"
      presentation={presentation}
      onClose={onPause}
      footer={
        <View className="gap-2">
          <View className="flex-row gap-2">
            <Button
              title="Undo last answer"
              variant="secondary"
              onPress={onUndo}
              disabled={isBusy || !view.canUndo}
              className="flex-1"
            />
            <Button
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
                  backgroundColor: progressFill,
                }}
              />
            </View>
            <Text
              style={TABULAR_NUMS}
              className="text-body-small text-ink-muted dark:text-ink-muted-dark"
            >
              Landing between #{view.range.best} and #{view.range.worst} of{' '}
              {view.range.total}
            </Text>
          </>
        ) : null}
      </View>
      {target ? (
        <View className="flex-1 gap-2">
          <ComparisonChoice
            item={item}
            accessibilityLabel={`${item.name}. ${caption}.`}
            surfaceClassName={tintClass}
            borderColor={hueSolid}
            isBusy={isBusy}
            onPress={() => onAnswer('better')}
          >
            <Text className="text-label-large" style={{ color: hueOnTint }}>
              {caption}
            </Text>
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
            surfaceClassName="bg-surface dark:bg-surface-dark border-line dark:border-line-dark"
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
