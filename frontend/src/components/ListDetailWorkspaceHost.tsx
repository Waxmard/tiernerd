import type React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SheetModal } from '../design-system/components';
import type { ListColor } from '../design-system/tokens/colors';
import { useThemeColors } from '../providers/ThemeProvider';
import type { Item } from '../services/itemsService';
import type { ListRankingMode } from '../services/listsService';
import { AddItemContent } from './AddItemContent';
import { ItemDetailContent } from './ItemDetailContent';
import type { ItemFormField, ItemWorkspace } from './itemWorkspaceTypes';
import { RankingContent, RankingResultContent } from './RankingContent';

interface ListDetailWorkspaceHostProps {
  isScreenBusy: boolean;
  listTitle: string;
  listColor?: ListColor | null;
  selectedItemId: string | null;
  dismissedDetailsItemId: string | null;
  selectedItem: Item | null;
  selectedRank: number | null;
  rankedCount: number;
  rankingMode: ListRankingMode;
  isLoadingItems: boolean;
  itemsLoaded: boolean;
  canMutate: boolean;
  workspace: ItemWorkspace;
  onEdit: (focus?: ItemFormField) => void;
  onIconChange: (icon: string | null) => void;
  onDelete: () => void;
  onDetailsClose: () => void;
  onMobileClose: () => void;
  onStartRanking: () => void;
  onEditRank: () => void;
  onEditDetails: () => void;
  children: React.ReactNode;
}

export const ListDetailWorkspaceHost: React.FC<
  ListDetailWorkspaceHostProps
> = ({
  isScreenBusy,
  listTitle,
  listColor = null,
  selectedItemId,
  dismissedDetailsItemId,
  selectedItem,
  selectedRank,
  rankedCount,
  rankingMode,
  isLoadingItems,
  itemsLoaded,
  canMutate,
  workspace,
  onEdit,
  onDelete,
  onDetailsClose,
  onMobileClose,
  onStartRanking,
  onIconChange,
  onEditRank,
  onEditDetails,
  children,
}) => {
  const colors = useThemeColors();
  const isBusy = workspace.isBusy || isScreenBusy;

  const renderWorkspace = () => {
    if (workspace.mode === 'ranked' && workspace.item && workspace.result)
      return (
        <RankingResultContent
          item={workspace.item}
          result={workspace.result}
          rankingMode={rankingMode}
          color={listColor}
          onDone={workspace.dismissResult}
        />
      );
    if (workspace.mode === 'ranking' && workspace.view) {
      return (
        <RankingContent
          listTitle={listTitle}
          item={workspace.view.item}
          view={workspace.view}
          isBusy={isBusy}
          rankingMode={rankingMode}
          color={listColor}
          onAnswer={(answer) => void workspace.answer(answer)}
          onUndo={() => void workspace.undo()}
          onCancel={() => void workspace.cancelRanking()}
          onPause={() => void workspace.pauseRanking()}
        />
      );
    }

    if (workspace.mode === 'add' || workspace.mode === 'edit') {
      const scoreEdit = rankingMode === 'score' ? workspace.scoreEdit : null;
      return (
        <AddItemContent
          mode={workspace.mode}
          form={workspace.form}
          onFormChange={workspace.setForm}
          fieldErrors={workspace.fieldErrors}
          isBusy={isBusy}
          onSubmit={workspace.submitMetadata}
          onClose={() => void workspace.requestClose()}
          canEditScore={scoreEdit !== null}
          autoScore={scoreEdit?.autoScore ?? null}
          scoreBounds={scoreEdit?.bounds}
          color={listColor}
          focusField={workspace.focusField}
          listTitle={listTitle}
          editActions={
            workspace.mode === 'edit' && workspace.item
              ? {
                  rankTitle:
                    workspace.item.position === null ? 'Rank now' : 'Re-rank',
                  onRank: onEditRank,
                  onDetails: onEditDetails,
                  onDelete,
                }
              : undefined
          }
        />
      );
    }

    if (!selectedItem) {
      if (selectedItemId && (isLoadingItems || !itemsLoaded)) {
        return (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        );
      }
      return null;
    }

    return (
      <ItemDetailContent
        item={selectedItem}
        canMutate={canMutate}
        rank={selectedRank}
        rankedCount={rankedCount}
        rankingMode={rankingMode}
        color={listColor}
        hasDraft={workspace.ranking !== null}
        isBusy={isBusy}
        onRank={onStartRanking}
        onEdit={onEdit}
        onDelete={onDelete}
        onClose={onDetailsClose}
        onIconChange={onIconChange}
        listTitle={listTitle}
      />
    );
  };

  return (
    <>
      <View className="flex-1 min-h-0">{children}</View>
      <SheetModal
        visible={
          workspace.mode !== 'closed' ||
          (selectedItemId !== null && dismissedDetailsItemId !== selectedItemId)
        }
        accessibilityLabel={
          workspace.mode === 'ranking'
            ? 'Which is better?'
            : workspace.mode === 'ranked'
              ? 'Ranking result'
              : workspace.mode === 'edit'
                ? 'Edit item'
                : workspace.mode === 'add'
                  ? 'Add item'
                  : (selectedItem?.name ?? 'Item details')
        }
        onRequestClose={onMobileClose}
      >
        {renderWorkspace()}
      </SheetModal>
    </>
  );
};
