import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { BaseModalContent, Button } from '../design-system/components';
import {
  AppBorders,
  AppColors,
  AppSpacing,
  AppTypography,
} from '../design-system/tokens';
import type {
  ComparisonSession,
  Item,
  TierSet,
} from '../services/itemsService';
import { RANGE_OPTIONS } from './RangeSelector';

export interface RankingContentProps {
  listTitle: string;
  session: ComparisonSession;
  presentation: 'modal' | 'panel';
  isBusy: boolean;
  error: string | null;
  onAnswer: (result: 'better' | 'worse') => void;
  onUndo: () => void;
  onCommit: () => void;
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name} is better. ${label}. ${scoreLabel}`}
      accessibilityHint="Select the better item."
      accessibilityState={{ disabled: isBusy }}
      disabled={isBusy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        pressed && !isBusy && styles.choicePressed,
      ]}
    >
      <View style={styles.choiceHeader}>
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            accessibilityLabel={item.name}
            style={styles.image}
          />
        ) : null}
        <View style={styles.choiceCopy}>
          <Text style={styles.choiceName}>{item.name}</Text>
          <Text style={styles.choiceRole}>{label}</Text>
        </View>
      </View>
      {item.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}
      <Text style={styles.scoreLabel}>{scoreLabel}</Text>
    </Pressable>
  );
}

export function RankingContent({
  listTitle,
  session,
  presentation,
  isBusy,
  error,
  onAnswer,
  onUndo,
  onCommit,
  onCancel,
  onRestart,
  onReload,
  onRetryRefresh,
}: RankingContentProps) {
  const destinationRange = getRangeLabel(session.tier_set);
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
  const canCommit = isReady && !isStale && session.preview !== null;
  const title = isCompleted
    ? 'Ranking saved'
    : isReady
      ? 'Ready to save'
      : 'Which is better?';
  const closeText =
    isCompleted || isCancelled
      ? 'Close'
      : session.discard_on_cancel
        ? 'Cancel and discard item'
        : 'Cancel ranking';
  const preview = session.preview;
  const previewContent = preview ? (
    <View style={styles.preview}>
      <Text style={styles.previewItem}>{candidate.name}</Text>
      <View style={styles.previewStats}>
        <View style={styles.previewStat}>
          <Text style={styles.previewScore}>{preview.score.toFixed(1)}</Text>
          <Text style={styles.previewLabel}>Score</Text>
        </View>
        <View style={styles.previewStat}>
          <Text style={styles.previewRank}>#{preview.rank}</Text>
          <Text style={styles.previewLabel}>
            of {preview.ranked_count} ranked items
          </Text>
        </View>
      </View>
    </View>
  ) : null;

  return (
    <BaseModalContent
      title={title}
      error={error}
      isLoading={isBusy}
      closeText={closeText}
      presentation={presentation}
      onClose={onCancel}
      onSubmit={canCommit ? onCommit : undefined}
      submitText="Save ranking"
    >
      <View style={styles.context}>
        <Text style={styles.listTitle}>{listTitle}</Text>
        <Text style={styles.destination}>Ranking into {destinationRange}</Text>
        {isAsking ? (
          <Text style={styles.questionCount}>
            Question {session.comparisons_answered + 1} · up to{' '}
            {session.comparison_limit} questions
          </Text>
        ) : null}
      </View>
      {isStale ? (
        <View style={styles.messageBlock}>
          <Text style={styles.message}>
            The list changed. Restart ranking to continue.
          </Text>
          <Button
            title="Restart ranking"
            onPress={onRestart}
            disabled={isBusy}
            fullWidth
          />
        </View>
      ) : isCompleted ? (
        <View style={styles.messageBlock}>
          {preview ? (
            previewContent
          ) : (
            <>
              <Text style={styles.message}>
                The saved rank is unavailable. Reload ranking status.
              </Text>
              <Button
                title="Reload ranking status"
                variant="secondary"
                onPress={onReload}
                disabled={isBusy}
                fullWidth
              />
            </>
          )}
        </View>
      ) : isReady ? (
        <View style={styles.messageBlock}>
          {preview ? (
            previewContent
          ) : (
            <>
              <Text style={styles.message}>
                Unable to load the ranking preview. Reload ranking status before
                saving.
              </Text>
              <Button
                title="Reload ranking status"
                variant="secondary"
                onPress={onReload}
                disabled={isBusy}
                fullWidth
              />
            </>
          )}
          {session.can_undo ? (
            <Button
              title="Undo last answer"
              variant="secondary"
              onPress={onUndo}
              disabled={isBusy}
              fullWidth
            />
          ) : null}
        </View>
      ) : isCancelled ? (
        <Text style={styles.message}>This ranking was cancelled.</Text>
      ) : isAsking && existingItem ? (
        <View style={styles.question}>
          <Text style={styles.instruction}>Select the better item.</Text>
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
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.messageBlock}>
          <Text style={styles.message}>
            Unable to load the current question. Reload ranking status before
            continuing.
          </Text>
          <Button
            title="Reload current question"
            variant="secondary"
            onPress={onReload}
            disabled={isBusy}
            fullWidth
          />
        </View>
      )}
      {error === REFRESH_ERROR && onRetryRefresh ? (
        <Button
          title="Retry refresh"
          onPress={onRetryRefresh}
          disabled={isBusy}
          fullWidth
        />
      ) : null}
    </BaseModalContent>
  );
}

const styles = StyleSheet.create({
  context: {
    gap: AppSpacing.xs,
    marginBottom: AppSpacing.md,
  },
  listTitle: {
    ...AppTypography.bodySmall,
    color: AppColors.textSecondary,
  },
  destination: {
    ...AppTypography.bodySmall,
    color: AppColors.accent.dark,
  },
  question: {
    gap: 12,
  },
  questionCount: {
    ...AppTypography.bodySmall,
    color: AppColors.textSecondary,
  },
  instruction: {
    ...AppTypography.titleSmall,
    color: AppColors.secondary.emphasis,
  },
  choice: {
    borderWidth: 1,
    borderColor: AppColors.controlBorder,
    borderRadius: AppBorders.radiusMd,
    backgroundColor: AppColors.dominant.primary,
    padding: AppSpacing.md,
    gap: 12,
  },
  choicePressed: {
    backgroundColor: AppColors.selectedSurface,
    borderColor: AppColors.accent.dark,
  },
  choiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  image: {
    width: 48,
    height: 48,
    borderRadius: AppBorders.radiusSm,
  },
  choiceCopy: {
    flex: 1,
    minWidth: 0,
    gap: AppSpacing.xxs,
  },
  choiceName: {
    ...AppTypography.titleMedium,
    color: AppColors.secondary.emphasis,
  },
  choiceRole: {
    ...AppTypography.bodySmall,
    color: AppColors.textSecondary,
  },
  description: {
    ...AppTypography.bodySmall,
    color: AppColors.secondary.primary,
  },
  scoreLabel: {
    ...AppTypography.bodySmall,
    color: AppColors.textSecondary,
  },
  messageBlock: {
    gap: 12,
  },
  message: {
    ...AppTypography.bodyMedium,
    color: AppColors.secondary.primary,
    textAlign: 'left',
  },
  preview: {
    gap: AppSpacing.xs,
  },
  previewItem: {
    ...AppTypography.titleSmall,
    color: AppColors.secondary.emphasis,
  },
  previewStats: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: AppSpacing.lg,
    marginTop: AppSpacing.xs,
  },
  previewStat: {
    gap: AppSpacing.xxs,
  },
  previewScore: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: AppColors.accent.dark,
  },
  previewRank: {
    ...AppTypography.titleMedium,
    fontVariant: ['tabular-nums'],
    color: AppColors.secondary.emphasis,
  },
  previewLabel: {
    ...AppTypography.bodySmall,
    color: AppColors.textSecondary,
  },
});
