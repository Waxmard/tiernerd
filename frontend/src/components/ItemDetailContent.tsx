import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { BaseModalContent, Button, Emoji } from '../design-system/components';
import { useListHue } from '../providers/ThemeProvider';
import type { Item } from '../services/itemsService';
import type { ListRankingMode } from '../services/listsService';
import { rankMedal } from '../services/rankingEngine';
import { EmojiPickerModal } from './EmojiPicker';
import type { ItemFormField } from './itemWorkspaceTypes';
import { ItemRankBadge, TABULAR_NUMS } from './ListDetailItemRow';

export interface ItemDetailContentProps {
  item: Item;
  rank: number | null;
  rankedCount: number;
  rankingMode: ListRankingMode;
  canMutate: boolean;
  hasDraft: boolean;
  isBusy: boolean;
  onRank: () => void;
  onEdit: (focus?: ItemFormField) => void;
  onIconChange: (icon: string | null) => void;
  onDelete: () => void;
  onClose: () => void;
  listTitle: string;
}

const SCORE_CLASS =
  'text-[20px] leading-6 font-semibold text-accent-text dark:text-accent-text-dark';

export function ItemDetailContent({
  item,
  rank,
  rankedCount,
  rankingMode,
  canMutate,
  hasDraft,
  isBusy,
  onRank,
  onEdit,
  onDelete,
  onClose,
  onIconChange,
  listTitle,
}: ItemDetailContentProps) {
  const hue = useListHue();
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageFailed =
    item.image_url !== null && failedImageUrl === item.image_url;
  const actionsBlocked = !canMutate || isBusy;
  const rankTitle = hasDraft
    ? 'Resume ranking'
    : item.position === null
      ? 'Rank now'
      : 'Re-rank';
  const medal = item.position === null ? null : rankMedal(rank);
  const [pickingIcon, setPickingIcon] = useState(false);
  const pickIcon = (icon: string | null) => {
    setPickingIcon(false);
    onIconChange(icon);
  };
  const scoreEditable = rankingMode === 'score' && item.position !== null;

  return (
    <BaseModalContent
      title={item.name}
      emoji={item.icon ?? undefined}
      onTitlePress={actionsBlocked ? undefined : () => onEdit('name')}
      titleHint="Edit name"
      onEmojiPress={actionsBlocked ? undefined : () => setPickingIcon(true)}
      emojiLabel={item.icon ? `Item emoji: ${item.icon}` : undefined}
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
              onPress={() => onEdit()}
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
        <Pressable
          accessibilityRole={scoreEditable ? 'button' : undefined}
          accessibilityHint={scoreEditable ? 'Edit score' : undefined}
          accessibilityState={
            scoreEditable ? { disabled: actionsBlocked } : undefined
          }
          onPress={
            scoreEditable && !actionsBlocked
              ? () => onEdit('manualRating')
              : undefined
          }
          className="rounded-2xl border-2 p-4 gap-2"
          style={({ pressed }) =>
            pressed && scoreEditable && !actionsBlocked
              ? [hue.cardStyle, { opacity: 0.7 }]
              : hue.cardStyle
          }
        >
          {item.position === null ? (
            <View className="flex-row items-center gap-1">
              <Emoji symbol="⏳" size={14} />
              <Text style={TABULAR_NUMS} className={SCORE_CLASS}>
                Not ranked yet
              </Text>
            </View>
          ) : (
            <View className="flex-row items-center flex-wrap gap-3">
              {medal ? <Emoji symbol={medal} size={30} /> : null}
              <ItemRankBadge
                rankingMode={rankingMode}
                rating={item.rating}
                rank={rank}
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
        </Pressable>
        {item.description ? (
          <Pressable
            accessibilityRole={actionsBlocked ? undefined : 'button'}
            accessibilityHint={actionsBlocked ? undefined : 'Edit description'}
            onPress={actionsBlocked ? undefined : () => onEdit('description')}
            className="min-h-11 justify-center"
            style={({ pressed }) =>
              pressed && !actionsBlocked ? { opacity: 0.7 } : undefined
            }
          >
            <Text className="text-body-large text-ink dark:text-ink-dark">
              {item.description}
            </Text>
          </Pressable>
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
      <EmojiPickerModal
        visible={pickingIcon}
        value={item.icon ?? null}
        onSelect={pickIcon}
        suggestFor={{
          name: item.name,
          kind: 'item',
          description: item.description,
          listTitle,
        }}
        onRemove={() => pickIcon(null)}
        onClose={() => setPickingIcon(false)}
      />
    </BaseModalContent>
  );
}
