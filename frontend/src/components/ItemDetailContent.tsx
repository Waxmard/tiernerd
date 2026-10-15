import { useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { BaseModalContent, Button } from '../design-system/components';
import { useThemeColors } from '../providers/ThemeProvider';
import type { ComparisonSession, Item } from '../services/itemsService';
import { RANGE_OPTIONS, RangeBadge } from './RangeSelector';

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

const TABULAR_NUMS = { fontVariant: ['tabular-nums' as const] };

const SCORE_CLASS =
  'text-[20px] leading-6 font-semibold text-accent-text dark:text-accent-text-dark';

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
  const colors = useThemeColors();
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageFailed =
    item.image_url !== null && failedImageUrl === item.image_url;

  const rangeOption = RANGE_OPTIONS.find(
    (option) => option.value === item.tier_set
  );
  const rangeLabel = rangeOption?.label ?? 'Range not selected';
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
        <View className="gap-2">
          <Button
            title={rankTitle}
            onPress={liveSession ? onResume : onRank}
            disabled={actionsBlocked}
            fullWidth
          />
          <View className="flex-row flex-wrap gap-2">
            <Button
              title="Edit"
              variant="secondary"
              onPress={onEdit}
              disabled={isBusy || refreshPending}
              className="flex-1 min-w-[120px]"
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
              textClassName={
                canRetryRefresh
                  ? undefined
                  : 'text-danger-text dark:text-danger-text-dark'
              }
              className="flex-1 min-w-[120px]"
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
      <View className="gap-4 pb-4">
        {item.rating === null ? (
          <Text style={TABULAR_NUMS} className={SCORE_CLASS}>
            Not ranked yet
          </Text>
        ) : (
          <View className="flex-row items-baseline flex-wrap gap-4">
            <Text style={TABULAR_NUMS} className={SCORE_CLASS}>
              {item.rating.toFixed(1)}
            </Text>
            {rank !== null ? (
              <Text className="text-body-medium text-ink dark:text-ink-dark">
                Rank #{rank} of {rankedCount}
              </Text>
            ) : null}
          </View>
        )}
        {rangeOption ? (
          <RangeBadge tierSet={item.tier_set} />
        ) : (
          <Text className="text-label-medium text-ink-muted dark:text-ink-muted-dark">
            {rangeLabel}
          </Text>
        )}
        <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
          Scores reflect position within each range. Adding, removing or
          re-ranking items can change scores.
        </Text>
        {item.description ? (
          <Text className="text-body-large text-ink dark:text-ink-dark">
            {item.description}
          </Text>
        ) : null}
        {item.image_url ? (
          imageFailed ? (
            <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
              Image unavailable
            </Text>
          ) : (
            <Image
              source={{ uri: item.image_url }}
              accessibilityLabel={item.name}
              onError={() => setFailedImageUrl(item.image_url)}
              resizeMode="cover"
              className="w-full h-[220px] rounded-lg bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark"
            />
          )
        ) : null}

        {isLoadingSession ? (
          <View className="gap-2">
            <ActivityIndicator color={colors['accent-text']} />
            <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark text-center">
              Checking ranking status
            </Text>
          </View>
        ) : sessionError ? (
          <View className="gap-2">
            <Text
              accessibilityRole="alert"
              className="text-body-small text-danger-text dark:text-danger-text-dark"
            >
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
