import type React from 'react';
import { ActivityIndicator, Modal, View } from 'react-native';
import { useThemeColors } from '../providers/ThemeProvider';
import type { ComparisonSession, Item } from '../services/itemsService';
import { AddItemContent } from './AddItemContent';
import { ItemDetailContent } from './ItemDetailContent';
import type { ItemWorkspace } from './itemWorkspaceTypes';
import { RankingContent } from './RankingContent';

interface ListDetailWorkspaceHostProps {
  isDesktop: boolean;
  isScreenBusy: boolean;
  listTitle: string;
  selectedItemId: string | null;
  dismissedDetailsItemId: string | null;
  selectedItem: Item | null;
  selectedRank: number | null;
  rankedCount: number;
  selectedSession: ComparisonSession | null;
  isLoadingSession: boolean;
  sessionError: string | null;
  isLoadingItems: boolean;
  itemsLoaded: boolean;
  canMutate: boolean;
  workspace: ItemWorkspace;
  onRetrySession: () => void;
  onResume: () => void;
  onEdit: () => void;
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
  selectedItemId,
  dismissedDetailsItemId,
  selectedItem,
  selectedRank,
  rankedCount,
  selectedSession,
  isLoadingSession,
  sessionError,
  isLoadingItems,
  itemsLoaded,
  canMutate,
  workspace,
  onRetrySession,
  onResume,
  onEdit,
  onDelete,
  onDetailsClose,
  onMobileClose,
  onStartRanking,
  children,
}) => {
  const colors = useThemeColors();
  const isBusy = workspace.isBusy || isScreenBusy;

  const renderWorkspace = (presentation: 'modal' | 'panel') => {
    if (workspace.mode === 'ranking' && workspace.session) {
      return (
        <RankingContent
          listTitle={listTitle}
          session={workspace.session}
          presentation={presentation}
          isBusy={isBusy}
          error={workspace.error}
          recoveryRequired={workspace.recoveryRequired}
          onAnswer={workspace.answer}
          onUndo={workspace.undo}
          onRetryCommit={workspace.retryCommit}
          onCancel={() => workspace.requestClose().catch(() => false)}
          onPause={workspace.pauseRanking}
          onRestart={workspace.restart}
          onReload={workspace.reloadSession}
          onRetryRefresh={workspace.retryRefresh}
        />
      );
    }

    if (workspace.mode === 'add' || workspace.mode === 'edit') {
      return (
        <AddItemContent
          mode={workspace.mode}
          form={workspace.form}
          onFormChange={workspace.setForm}
          onRetryRefresh={workspace.retryRefresh}
          fieldErrors={workspace.fieldErrors}
          isBusy={isBusy}
          error={workspace.error}
          onSubmit={workspace.submitMetadata}
          onClose={() => workspace.requestClose().catch(() => false)}
          presentation={presentation}
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
        presentation={presentation}
        session={selectedSession}
        isLoadingSession={isLoadingSession}
        isBusy={isBusy}
        error={workspace.error}
        sessionError={sessionError}
        onRetrySession={onRetrySession}
        onRetryRefresh={workspace.retryRefresh}
        onRank={onStartRanking}
        onResume={onResume}
        onEdit={onEdit}
        onDelete={onDelete}
        onClose={onDetailsClose}
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
              ? workspace.session?.status === 'ready_to_commit'
                ? 'Saving ranking…'
                : 'Which is better?'
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
