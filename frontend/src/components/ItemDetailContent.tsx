import { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { BaseModalContent, Button } from '../design-system/components';
import {
  AppBorders,
  AppColors,
  AppSpacing,
  AppTypography,
} from '../design-system/tokens';
import type { ComparisonSession, Item } from '../services/itemsService';
import { RANGE_OPTIONS } from './RangeSelector';

export interface ItemDetailContentProps {
  item: Item;
  rank: number | null;
  rankedCount: number;
  session: ComparisonSession | null;
  isLoadingSession: boolean;
  isBusy: boolean;
  error: string | null;
  sessionError?: string | null;
  presentation: 'modal' | 'panel';
  onRetrySession: () => void;
  onRank: () => void;
  onResume: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRetryRefresh?: () => void;
  onClose: () => void;
}

const REFRESH_ERROR = 'Unable to refresh items. Try again.';

export function ItemDetailContent({
  item,
  rank,
  rankedCount,
  session,
  isLoadingSession,
  isBusy,
  error,
  sessionError,
  presentation,
  onRetrySession,
  onRank,
  onResume,
  onEdit,
  onDelete,
  onRetryRefresh,
  onClose,
}: ItemDetailContentProps) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageFailed =
    item.image_url !== null && failedImageUrl === item.image_url;

  const rangeLabel =
    RANGE_OPTIONS.find((option) => option.value === item.tier_set)?.label ??
    'Range not selected';
  const liveSession =
    session && ['active', 'ready_to_commit'].includes(session.status)
      ? session
      : null;
  const refreshPending = error === REFRESH_ERROR;
  const actionsBlocked =
    isBusy || isLoadingSession || Boolean(sessionError) || refreshPending;
  const rankTitle = liveSession
    ? liveSession.is_stale
      ? 'Restart ranking'
      : 'Resume ranking'
    : item.rating === null
      ? 'Rank now'
      : 'Re-rank';
  const canRetryRefresh = refreshPending && onRetryRefresh !== undefined;
  const deleteTitle = canRetryRefresh ? 'Retry refresh' : 'Delete Item';

  return (
    <BaseModalContent
      title={item.name}
      error={error}
      presentation={presentation}
      onClose={onClose}
      footer={
        <View style={styles.footerActions}>
          <Button
            title={rankTitle}
            onPress={liveSession ? onResume : onRank}
            disabled={actionsBlocked}
            fullWidth
          />
          <View style={styles.secondaryActions}>
            <Button
              title="Edit"
              variant="secondary"
              onPress={onEdit}
              disabled={isBusy || refreshPending}
              style={styles.secondaryAction}
            />
            <Button
              title={deleteTitle}
              variant={canRetryRefresh ? 'secondary' : 'text'}
              onPress={canRetryRefresh ? onRetryRefresh : onDelete}
              disabled={
                isBusy ||
                isLoadingSession ||
                Boolean(sessionError) ||
                (refreshPending && !onRetryRefresh)
              }
              textStyle={canRetryRefresh ? undefined : styles.deleteText}
              style={styles.secondaryAction}
            />
          </View>
          <Button
            title="Close details"
            variant="text"
            onPress={onClose}
            disabled={isBusy || refreshPending}
            fullWidth
          />
        </View>
      }
    >
      <View style={styles.content}>
        {item.rating === null ? (
          <Text style={styles.score}>Not ranked yet</Text>
        ) : (
          <View style={styles.rankingSummary}>
            <Text style={styles.score}>{item.rating.toFixed(1)}</Text>
            {rank !== null ? (
              <Text style={styles.rank}>
                Rank #{rank} of {rankedCount}
              </Text>
            ) : null}
          </View>
        )}
        <Text style={styles.range}>{rangeLabel}</Text>
        <Text style={styles.scoreExplanation}>
          Scores reflect position within each range. Adding, removing or
          re-ranking items can change scores.
        </Text>
        {item.description ? (
          <Text style={styles.description}>{item.description}</Text>
        ) : null}
        {item.image_url ? (
          imageFailed ? (
            <Text style={styles.imageUnavailable}>Image unavailable</Text>
          ) : (
            <Image
              source={{ uri: item.image_url }}
              accessibilityLabel={item.name}
              onError={() => setFailedImageUrl(item.image_url)}
              resizeMode="cover"
              style={styles.image}
            />
          )
        ) : null}

        {isLoadingSession ? (
          <View style={styles.sessionStatus}>
            <ActivityIndicator color={AppColors.accent.dark} />
            <Text style={styles.secondaryText}>Checking ranking status</Text>
          </View>
        ) : sessionError ? (
          <View style={styles.sessionStatus}>
            <Text accessibilityRole="alert" style={styles.error}>
              {sessionError}
            </Text>
            <Button
              title="Retry"
              variant="secondary"
              onPress={onRetrySession}
              disabled={isBusy}
              fullWidth
            />
          </View>
        ) : null}
      </View>
    </BaseModalContent>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: AppSpacing.md,
    paddingBottom: AppSpacing.md,
  },
  rankingSummary: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: AppSpacing.md,
    flexWrap: 'wrap',
  },
  score: {
    ...AppTypography.titleMedium,
    color: AppColors.accent.dark,
    fontSize: 20,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
  rank: {
    ...AppTypography.bodyMedium,
    color: AppColors.secondary.primary,
  },
  range: {
    ...AppTypography.labelMedium,
    color: AppColors.textSecondary,
  },
  scoreExplanation: {
    ...AppTypography.bodySmall,
    color: AppColors.secondary.muted,
  },
  description: {
    ...AppTypography.bodyLarge,
    color: AppColors.secondary.primary,
  },
  image: {
    width: '100%',
    height: 220,
    borderRadius: AppBorders.radiusMd,
    backgroundColor: AppColors.surfaceLight,
  },
  imageUnavailable: {
    ...AppTypography.bodySmall,
    color: AppColors.textSecondary,
  },
  sessionStatus: {
    gap: AppSpacing.sm,
  },
  secondaryText: {
    ...AppTypography.bodySmall,
    color: AppColors.textSecondary,
    textAlign: 'center',
  },
  error: {
    ...AppTypography.bodySmall,
    color: AppColors.error,
  },
  footerActions: {
    gap: AppSpacing.sm,
  },
  secondaryActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing.sm,
  },
  secondaryAction: {
    flex: 1,
    minWidth: 120,
  },
  deleteText: {
    color: AppColors.error,
  },
});
