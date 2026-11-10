import type React from 'react';
import { ActivityIndicator, Modal, View } from 'react-native';
import type { ListColor } from '../design-system/tokens/colors';
import { useThemeColors } from '../providers/ThemeProvider';
import type { Item } from '../services/itemsService';
import type { ListRankingMode } from '../services/listsService';
import { AddItemContent } from './AddItemContent';
import { ItemDetailContent } from './ItemDetailContent';
import type { ItemFormField, ItemWorkspace } from './itemWorkspaceTypes';
import { RankingContent } from './RankingContent';

interface ListDetailWorkspaceHostProps {
  isDesktop: boolean;
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
  onIconChange: (icon: string) => void;
  onDelete: () => void;
  onDetailsClose: () => void;
  onMobileClose: () => void;
  onStartRanking: () => void;
  children: React.ReactNode;
}

export const ListDetailWorkspaceHost: React.FC<
  ListDetailWorkspaceHostProps
> = ({
  isDesktop,
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
  children,
}) => {
  const colors = useThemeColors();
  const isBusy = workspace.isBusy || isScreenBusy;

  const renderWorkspace = (presentation: 'modal' | 'panel') => {
    if (workspace.mode === 'ranking' && workspace.view) {
      return (
        <RankingContent
          listTitle={listTitle}
          item={workspace.view.item}
          view={workspace.view}
          presentation={presentation}
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
          presentation={presentation}
          canEditScore={scoreEdit !== null}
          autoScore={scoreEdit?.autoScore ?? null}
          scoreBounds={scoreEdit?.bounds}
          color={listColor}
          focusField={workspace.focusField}
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
        presentation={presentation}
        hasDraft={workspace.ranking !== null}
        isBusy={isBusy}
        onRank={onStartRanking}
        onEdit={onEdit}
        onDelete={onDelete}
        onClose={onDetailsClose}
        onIconChange={onIconChange}
      />
    );
  };

  return (
    <>
      <View className="flex-1 min-h-0 desktop:flex-row desktop:gap-4">
        <View className="flex-1 min-h-0 min-w-0">{children}</View>
        {isDesktop &&
        (selectedItemId !== null || workspace.mode !== 'closed') ? (
          <View className="w-[400px] shrink-0 min-h-0">
            {workspace.mode === 'closed' ? (
              <View className="flex-1 min-h-0 min-w-0">
                {renderWorkspace('panel')}
              </View>
            ) : (
              renderWorkspace('panel')
            )}
          </View>
        ) : null}
      </View>
      {!isDesktop ? (
        <Modal
          visible={
            workspace.mode !== 'closed' ||
            (selectedItemId !== null &&
              dismissedDetailsItemId !== selectedItemId)
          }
          transparent
          animationType="none"
          accessibilityLabel={
            workspace.mode === 'ranking'
              ? 'Which is better?'
              : workspace.mode === 'edit'
                ? 'Edit item'
                : workspace.mode === 'add'
                  ? 'Add item'
                  : (selectedItem?.name ?? 'Item details')
          }
          onRequestClose={onMobileClose}
        >
          {renderWorkspace('modal')}
        </Modal>
      ) : null}
    </>
  );
};
