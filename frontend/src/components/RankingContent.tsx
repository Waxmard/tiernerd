import { Image, Pressable, Text, View } from 'react-native';
import { BaseModalContent, Button } from '../design-system/components';
import { useThemeColors } from '../providers/ThemeProvider';
import type { ComparisonSession, Item } from '../services/itemsService';
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
  onPause?: () => void;
  onRestart: () => void;
  onReload: () => void;
  onRetryRefresh?: () => void;
}
interface ComparisonChoiceProps {
  item: Item;
  label: string;
  isBusy: boolean;
  onPress: () => void;
}

const REFRESH_ERROR = 'Unable to refresh items. Try again.';

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
      className="min-h-16 border border-control dark:border-control-dark rounded-lg p-[14px] gap-2 bg-surface dark:bg-surface-dark"
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
            className={[
              'text-[18px] leading-[25.2px] font-semibold',
              choiceTextClass(isBusy),
            ].join(' ')}
          >
            {item.name}
          </Text>
          <Text
            className={[
              'text-[14px] leading-[21px]',
              choiceTextClass(isBusy),
            ].join(' ')}
          >
            {label}
          </Text>
        </View>
      </View>
      {item.description ? (
        <Text
          className={[
            'text-[14px] leading-[21px]',
            choiceTextClass(isBusy),
          ].join(' ')}
        >
          {item.description}
        </Text>
      ) : null}
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
  onPause,
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
  const canPause = Boolean(onPause && !isCompleted && !isCancelled);
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
      onClose={canPause && onPause ? onPause : onCancel}
      footer={
        canPause && onPause ? (
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Button
              title={closeText}
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
        <View className="gap-2">
          <ComparisonChoice
            item={candidate}
            label="Item being ranked"
            isBusy={isBusy}
            onPress={() => onAnswer('better')}
          />
          <ComparisonChoice
            item={existingItem}
            label="Existing item"
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
