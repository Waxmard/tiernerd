import type React from 'react';
import { ActivityIndicator, Modal, Platform, Text, View } from 'react-native';
import { BaseModalContent, Button } from '../design-system/components';
import { AppColors } from '../design-system/tokens';
import type { ComparisonSession, Item } from '../services/itemsService';
import { AddItemContent } from './AddItemContent';
import { ItemDetailContent } from './ItemDetailContent';
import { styles } from './ListDetailScreen.styles';
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
  onAdd: () => void;
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
  onAdd,
  children,
}) => {
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
          <Text style={styles.savedScore}>
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

  const renderEmpty = () => (
    <View style={styles.emptyWorkspace}>
      <Text style={styles.emptyWorkspaceTitle} accessibilityRole="header">
        Item details
      </Text>
      <Text style={styles.emptyWorkspaceText}>
        Select an item to view its details.
      </Text>
      <Button onPress={onAdd} variant="primary" title="Add item" />
    </View>
  );

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
          <View style={styles.loadingWorkspace}>
            <ActivityIndicator size="large" color={AppColors.accent.primary} />
          </View>
        );
      }
      return renderEmpty();
    }

    return (
      <ItemDetailContent
        item={selectedItem}
        rank={selectedRank}
        rankedCount={rankedCount}
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
      <View style={[styles.contentRow, isDesktop && styles.desktopContentRow]}>
        <View style={styles.listColumn}>{children}</View>
        {isDesktop ? (
          <View style={styles.workspacePane}>
            {workspace.mode === 'closed' ? (
              <View
                style={styles.paneRegion}
                role="region"
                aria-label={
                  Platform.OS === 'web'
                    ? (selectedItem?.name ?? 'Item details')
                    : undefined
                }
                accessibilityLabel={
                  Platform.OS !== 'web'
                    ? (selectedItem?.name ?? 'Item details')
                    : undefined
                }
              >
                {selectedItemId ? renderWorkspace('panel') : renderEmpty()}
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
          {workspace.mode === 'closed' ? (
            <View style={styles.detailModalBackdrop}>
              <View style={styles.detailModalFrame}>
                {renderWorkspace('modal')}
              </View>
            </View>
          ) : (
            renderWorkspace('modal')
          )}
        </Modal>
      ) : null}
    </>
  );
};
