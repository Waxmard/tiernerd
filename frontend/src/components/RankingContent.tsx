import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, Text, View } from 'react-native';
import { BaseModalContent, Button } from '../design-system/components';
import { useThemeColors } from '../providers/ThemeProvider';
import type {
  ComparisonSession,
  Item,
  TierSet,
} from '../services/itemsService';
import { RANGE_OPTIONS, RangeBadge } from './RangeSelector';

export interface RankingContentProps {
  listTitle: string;
  session: ComparisonSession;
  presentation: 'modal' | 'panel';
  isBusy: boolean;
  error: string | null;
  recoveryRequired: boolean;
  onAnswer: (result: 'better' | 'worse') => void;
  onUndo: () => void;
  onRetryCommit: () => void;
  onCancel: () => void;
  onRestart: () => void;
  onReload: () => void;
  onRetryRefresh?: () => void;
}
interface ComparisonChoiceProps {
  item: Item;
  label: string;
  scoreLabel: string;
  isBusy: boolean;
  onPress: () => void;
}

const REFRESH_ERROR = 'Unable to refresh items. Try again.';

const choiceTextClass = (isBusy: boolean): string =>
  isBusy
    ? 'text-ink-disabled dark:text-ink-disabled-dark'
    : 'text-ink dark:text-ink-dark';

function getRangeLabel(tierSet: TierSet | null): string {
  return (
    RANGE_OPTIONS.find((option) => option.value === tierSet)?.label ??
    'Range not selected'
  );
}

function getSavedScore(item: Item): string {
  if (item.rating === null || item.tier_set === null) return 'Not ranked yet';
  return (
    'Saved score ' +
    item.rating.toFixed(1) +
    ' in ' +
    getRangeLabel(item.tier_set)
  );
}

function ComparisonChoice({
  item,
  label,
  scoreLabel,
  isBusy,
  onPress,
}: ComparisonChoiceProps) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}. ${label}. ${scoreLabel}`}
      accessibilityHint="Select the better item."
      accessibilityState={{ disabled: isBusy }}
      disabled={isBusy}
      onPress={onPress}
      className={[
        'min-h-[152px] border rounded-2xl p-6 gap-4',
        isBusy
          ? 'bg-surface-muted dark:bg-surface-muted-dark border-control dark:border-control-dark'
          : 'bg-accent-tint dark:bg-accent-tint-dark border-line dark:border-line-dark',
      ].join(' ')}
      style={({ pressed }) =>
        pressed && !isBusy
          ? { transform: [{ scale: 0.96 }], borderColor: colors.accent }
          : undefined
      }
    >
      <View className="flex-row items-center gap-4">
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            accessibilityLabel={item.name}
            className="w-16 h-16 rounded"
          />
        ) : null}
        <View className="flex-1 min-w-0 gap-0.5">
          <Text
            className={['text-headline-small', choiceTextClass(isBusy)].join(
              ' '
            )}
          >
            {item.name}
          </Text>
          <Text
            className={['text-body-small', choiceTextClass(isBusy)].join(' ')}
          >
            {label}
          </Text>
        </View>
        <Ionicons
          name="trophy-outline"
          size={28}
          color={isBusy ? colors['ink-disabled'] : colors['accent-text']}
          accessible={false}
        />
      </View>
      {item.description ? (
        <Text
          numberOfLines={2}
          className={['text-body-small', choiceTextClass(isBusy)].join(' ')}
        >
          {item.description}
        </Text>
      ) : null}
      <Text className={['text-body-small', choiceTextClass(isBusy)].join(' ')}>
        {scoreLabel}
      </Text>
    </Pressable>
  );
}

export function RankingContent({
  listTitle,
  session,
  presentation,
  isBusy,
  error,
  recoveryRequired,
  onAnswer,
  onUndo,
  onRetryCommit,
  onCancel,
  onRestart,
  onReload,
  onRetryRefresh,
}: RankingContentProps) {
  const destinationOption = RANGE_OPTIONS.find(
    (option) => option.value === session.tier_set
  );
  const comparison = session.current_comparison;
  const candidate = session.item;
  const existingItem = comparison
    ? ([comparison.reference_item, comparison.target_item].find(
        (item) => item.item_id !== session.item_id
      ) ?? null)
    : null;
  const isCompleted = session.status === 'completed';
  const isCancelled = session.status === 'cancelled';
  const isReady = session.status === 'ready_to_commit';
  const isStale = session.is_stale;
  const isAsking = Boolean(
    !isStale &&
      !isCompleted &&
      !isReady &&
      !isCancelled &&
      comparison &&
      existingItem
  );
  const title = isCompleted
    ? 'Refreshing list…'
    : isCancelled
      ? 'Ranking cancelled'
      : isReady
        ? error
          ? 'Unable to save ranking'
          : 'Saving ranking…'
        : 'Which is better?';
  const closeText =
    isCompleted || isCancelled
      ? 'Close'
      : session.discard_on_cancel
        ? 'Cancel and discard item'
        : 'Cancel ranking';

  return (
    <BaseModalContent
      title={title}
      error={error}
      isLoading={isBusy}
      closeText={closeText}
      presentation={presentation}
      onClose={onCancel}
    >
      <View className="gap-2 mb-4">
        <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
          {listTitle}
        </Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
            Ranking into
          </Text>
          {destinationOption ? (
            <RangeBadge tierSet={session.tier_set} />
          ) : (
            <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
              Range not selected
            </Text>
          )}
        </View>
        {isAsking ? (
          <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
            Question {session.comparisons_answered + 1} · up to{' '}
            {session.comparison_limit} questions
          </Text>
        ) : null}
      </View>
      {isStale ? (
        <View className="gap-4">
          <Text className="text-body-medium text-ink dark:text-ink-dark text-left">
            The list changed. Restart ranking to continue.
          </Text>
          <Button
            title="Restart ranking"
            onPress={onRestart}
            disabled={isBusy}
            fullWidth
            className="mt-2"
          />
        </View>
      ) : isCompleted ? (
        <View className="gap-4">
          {session.preview ? (
            <Text
              accessibilityLiveRegion="polite"
              className="text-body-medium text-ink dark:text-ink-dark text-left"
            >
              Refreshing list…
            </Text>
          ) : (
            <>
              <Text className="text-body-medium text-ink dark:text-ink-dark text-left">
                The saved rank is unavailable. Reload ranking status.
              </Text>
              <Button
                title="Reload ranking status"
                variant="secondary"
                onPress={onReload}
                disabled={isBusy}
                fullWidth
                className="mt-2"
              />
            </>
          )}
        </View>
      ) : isReady ? (
        <View className="gap-4">
          {recoveryRequired || !session.preview ? (
            <>
              <Text className="text-body-medium text-ink dark:text-ink-dark text-left">
                {session.preview
                  ? 'Unable to confirm ranking status. Reload ranking status to continue.'
                  : 'Unable to load ranking status. Reload to continue.'}
              </Text>
              <Button
                title="Reload ranking status"
                variant="secondary"
                onPress={onReload}
                disabled={isBusy}
                fullWidth
                className="mt-2"
              />
            </>
          ) : error ? (
            <Button
              title="Retry saving"
              onPress={onRetryCommit}
              disabled={isBusy}
              fullWidth
              className="mt-2"
            />
          ) : (
            <Text
              accessibilityLiveRegion="polite"
              className="text-body-medium text-ink dark:text-ink-dark text-left"
            >
              Saving ranking…
            </Text>
          )}
        </View>
      ) : isCancelled ? (
        <Text className="text-body-medium text-ink dark:text-ink-dark text-left">
          This ranking was cancelled.
        </Text>
      ) : isAsking && existingItem ? (
        <View className="gap-4">
          <ComparisonChoice
            item={candidate}
            label="Item being ranked"
            scoreLabel={getSavedScore(candidate)}
            isBusy={isBusy}
            onPress={() => onAnswer('better')}
          />
          <ComparisonChoice
            item={existingItem}
            label="Existing item"
            scoreLabel={getSavedScore(existingItem)}
            isBusy={isBusy}
            onPress={() => onAnswer('worse')}
          />
          {session.can_undo ? (
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
        <View className="gap-4">
          <Text className="text-body-medium text-ink dark:text-ink-dark text-left">
            Unable to load the current question. Reload ranking status before
            continuing.
          </Text>
          <Button
            title="Reload current question"
            variant="secondary"
            onPress={onReload}
            disabled={isBusy}
            fullWidth
            className="mt-2"
          />
        </View>
      )}
      {error === REFRESH_ERROR && onRetryRefresh ? (
        <Button
          title="Retry refresh"
          onPress={onRetryRefresh}
          disabled={isBusy}
          fullWidth
          className="mt-6"
        />
      ) : null}
    </BaseModalContent>
  );
}
