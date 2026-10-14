import type React from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';
import { BaseModalContent } from '../design-system/components';
import { useThemeColors } from '../providers/ThemeProvider';
import type { ComparisonSession, Item } from '../services/itemsService';
import { AddItemContent } from './AddItemContent';
import { ItemDetailContent } from './ItemDetailContent';
import { RangeSelector } from './RangeSelector';
import { RankingContent } from './RankingContent';
import type { ItemWorkspace } from './useItemWorkspace';

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
  workspace: ItemWorkspace;
  onRetrySession: () => void;
  onOpenRange: () => void;
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
  workspace,
  onRetrySession,
  onOpenRange,
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

  const renderRange = (presentation: 'modal' | 'panel') => {
    const isReRanking =
      workspace.item?.rating !== null && workspace.item?.rating !== undefined;
    return (
      <BaseModalContent
        title={isReRanking ? 'Re-rank item' : 'Rank item'}
        isLoading={isBusy}
        error={workspace.error}
        submitText="Start ranking"
        closeText="Cancel"
        presentation={presentation}
        onClose={() => workspace.requestClose().catch(() => false)}
        onSubmit={onStartRanking}
      >
        {isReRanking && workspace.item ? (
          <Text className="text-body-medium text-ink-muted dark:text-ink-muted-dark mb-4">
            Saved score {workspace.item.rating?.toFixed(1)}
          </Text>
        ) : null}
        <RangeSelector
          value={workspace.form.tierSet}
          onChange={(tierSet) => workspace.setForm({ tierSet })}
          error={workspace.fieldErrors.range}
          disabled={isBusy}
        />
      </BaseModalContent>
    );
  };

  const renderWorkspace = (presentation: 'modal' | 'panel') => {
    if (workspace.mode === 'ranking' && workspace.session) {
      return (
        <RankingContent
          listTitle={listTitle}
          session={workspace.session}
          presentation={presentation}
          isBusy={isBusy}
          error={workspace.error}
          onAnswer={workspace.answer}
          onUndo={workspace.undo}
          onCommit={workspace.commit}
          onCancel={() => workspace.requestClose().catch(() => false)}
          onRestart={workspace.restart}
          onReload={workspace.reloadSession}
          onRetryRefresh={workspace.retryRefresh}
        />
      );
    }

    if (workspace.mode === 'range') return renderRange(presentation);

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
        onRank={onOpenRange}
        onResume={onResume}
        onEdit={onEdit}
        onDelete={onDelete}
        onClose={onDetailsClose}
      />
    );
  };

  return (
    <>
      <View className="flex-1 min-h-0 desktop:flex-row desktop:gap-6">
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
                ? 'Ready to save'
                : 'Which is better?'
              : workspace.mode === 'range'
                ? workspace.item?.rating !== null &&
                  workspace.item?.rating !== undefined
                  ? 'Re-rank item'
                  : 'Rank item'
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
