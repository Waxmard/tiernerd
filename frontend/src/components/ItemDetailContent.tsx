import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { BaseModalContent, Button, Emoji } from '../design-system/components';
import type { ListColor } from '../design-system/tokens/colors';
import { useListHue } from '../providers/ThemeProvider';
import type { Item } from '../services/itemsService';
import type { ListRankingMode } from '../services/listsService';
import { ItemRankBadge, TABULAR_NUMS } from './ListDetailItemRow';

export interface ItemDetailContentProps {
  item: Item;
  rank: number | null;
  rankedCount: number;
  rankingMode: ListRankingMode;
  color?: ListColor | null;
  canMutate: boolean;
  hasDraft: boolean;
  isBusy: boolean;
  presentation: 'modal' | 'panel';
  onRank: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const SCORE_CLASS =
  'text-[20px] leading-6 font-semibold text-accent-text dark:text-accent-text-dark';

export function ItemDetailContent({
  item,
  rank,
  rankedCount,
  rankingMode,
  color = null,
  canMutate,
  hasDraft,
  isBusy,
  presentation,
  onRank,
  onEdit,
  onDelete,
  onClose,
}: ItemDetailContentProps) {
  const hue = useListHue(color);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageFailed =
    item.image_url !== null && failedImageUrl === item.image_url;
  const actionsBlocked = !canMutate || isBusy;
  const rankTitle = hasDraft
    ? 'Resume ranking'
    : item.position === null
      ? 'Rank now'
      : 'Re-rank';

  return (
    <BaseModalContent
      title={item.name}
      presentation={presentation}
      color={color}
      onClose={onClose}
      footer={
        <View className="gap-2">
          <Button
            title={rankTitle}
            onPress={onRank}
            disabled={actionsBlocked}
            loading={isBusy}
            fullWidth
            icon={<Emoji symbol="⚖️" size={18} />}
          />
          <View className="flex-row flex-wrap gap-2">
            <Button
              title="Edit"
              variant="secondary"
              onPress={onEdit}
              disabled={actionsBlocked}
              className="flex-1 min-w-[120px]"
              icon={<Emoji symbol="✏️" size={18} />}
            />
            <Button
              title="Delete Item"
              variant="text"
              onPress={onDelete}
              disabled={actionsBlocked}
              textClassName="text-danger-text dark:text-danger-text-dark"
              icon={<Emoji symbol="🗑️" size={18} />}
              className="flex-1 min-w-[120px]"
            />
          </View>
          <Button
            title="Close details"
            variant="text"
            onPress={onClose}
            disabled={isBusy}
            fullWidth
          />
        </View>
      }
    >
      <View className="gap-3 pb-4">
        <View className="rounded-2xl border-2 p-4 gap-2" style={hue.cardStyle}>
          {item.position === null ? (
            <Text style={TABULAR_NUMS} className={SCORE_CLASS}>
              ⏳ Not ranked yet
            </Text>
          ) : (
            <View className="flex-row items-center flex-wrap gap-3">
              <ItemRankBadge
                rankingMode={rankingMode}
                rating={item.rating}
                rank={rank}
                color={color}
                size="lg"
              />
              {rank !== null ? (
                <Text
                  style={TABULAR_NUMS}
                  className="text-body-medium text-ink dark:text-ink-dark"
                >
                  {rankingMode === 'rank'
                    ? `of ${rankedCount} ranked`
                    : `Rank #${rank} of ${rankedCount}`}
                </Text>
              ) : null}
            </View>
          )}
          {rankingMode === 'score' ? (
            <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
              {item.position !== null && item.manual_rating !== null
                ? 'Manual score · items without one adjust around it.'
                : 'Scores are based on list order and any manual scores.'}
            </Text>
          ) : null}
        </View>
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
              className="w-full h-[220px] rounded-2xl bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark"
            />
          )
        ) : null}
      </View>
    </BaseModalContent>
  );
}
