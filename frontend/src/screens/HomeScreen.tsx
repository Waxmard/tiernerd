import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  type ListRenderItemInfo,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddItemContent } from '../components/AddItemContent';
import {
  type CreatedList,
  CreateListContent,
} from '../components/CreateListModal';
import { RankingContent } from '../components/RankingContent';
import { useItemWorkspace } from '../components/useItemWorkspace';
import { Button } from '../design-system/components';
import {
  AppColors,
  AppLayout,
  AppSpacing,
  AppTypography,
} from '../design-system/tokens';
import type { RootStackScreenProps } from '../navigation/types';
import { useAuth } from '../providers/AuthContext';
import type { Item } from '../services/itemsService';
import { type ListSimple, listsService } from '../services/listsService';

type ModalStep = 'create' | 'addItem' | null;
interface TierList {
  id: string;
  title: string;
  description: string | null;
  itemCount: number;
  updatedAt: Date;
}
type HomeScreenProps = RootStackScreenProps<'Main'>;
type CreateListContentHandle = { requestClose: () => Promise<boolean> };
const toTierList = (list: ListSimple): TierList => ({
  id: list.list_id,
  title: list.title,
  description: list.description,
  itemCount: list.item_count,
  updatedAt: new Date(list.updated_at),
});
export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { user, token } = useAuth();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const gutter =
    windowWidth >= AppLayout.desktopBreakpoint
      ? AppSpacing.lg
      : AppLayout.gutter;
  const [lists, setLists] = useState<TierList[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalStep, setModalStep] = useState<ModalStep>(null);
  const [pendingList, setPendingList] = useState<CreatedList | null>(null);
  const createListRef = useRef<CreateListContentHandle | null>(null);
  const bypassBeforeRemoveRef = useRef(false);
  const closingForNavigationRef = useRef(false);
  const listsRequestRef = useRef(0);
  const refreshLists = useCallback(
    async (showLoading = false) => {
      if (!token) return;
      const requestId = ++listsRequestRef.current;
      if (showLoading) setIsLoading(true);
      try {
        const result = await listsService.getLists(token);
        if (requestId !== listsRequestRef.current) return;
        setLists(result.map(toTierList));
        setError(null);
      } catch (err: unknown) {
        if (requestId === listsRequestRef.current)
          setError(err instanceof Error ? err.message : 'Failed to load lists');
        throw err;
      } finally {
        if (requestId === listsRequestRef.current) setIsLoading(false);
      }
    },
    [token]
  );
  const fetchLists = useCallback(async () => {
    try {
      await refreshLists(true);
    } catch {
      return;
    }
  }, [refreshLists]);
  useFocusEffect(
    useCallback(() => {
      void fetchLists();
    }, [fetchLists])
  );
  const handleWorkspaceItemsChanged = useCallback(
    async (item?: Item) => {
      await refreshLists();
      if (item && pendingList)
        navigation.navigate('ListDetail', {
          listId: pendingList.listId,
          listTitle: pendingList.title,
          completedItemId: item.item_id,
        });
    },
    [navigation, pendingList, refreshLists]
  );
  const handleWorkspaceClosed = useCallback(() => {
    setModalStep(null);
    setPendingList(null);
  }, []);
  const workspace = useItemWorkspace({
    listTitle: pendingList?.title ?? '',
    token,
    onItemsChanged: handleWorkspaceItemsChanged,
    onClosed: handleWorkspaceClosed,
  });
  const handleListCreated = useCallback(
    (list: CreatedList) => {
      void fetchLists();
      setPendingList(list);
      workspace.openAdd();
      setModalStep('addItem');
    },
    [fetchLists, workspace.openAdd]
  );
  const getModalTitle = () =>
    modalStep === 'create'
      ? 'Create New List'
      : workspace.mode === 'ranking'
        ? workspace.session?.status === 'ready_to_commit'
          ? 'Ready to save'
          : 'Which is better?'
        : 'Add item';
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (bypassBeforeRemoveRef.current) {
          bypassBeforeRemoveRef.current = false;
          return;
        }
        if (closingForNavigationRef.current) {
          event.preventDefault();
          return;
        }
        if (!modalStep) return;
        event.preventDefault();
        closingForNavigationRef.current = true;
        const action = event.data.action;
        const close =
          modalStep === 'create'
            ? createListRef.current?.requestClose()
            : workspace.requestClose();
        void Promise.resolve(close)
          .catch(() => false)
          .then((canLeave) => {
            if (canLeave) {
              bypassBeforeRemoveRef.current = true;
              navigation.dispatch(action);
            }
          })
          .finally(() => {
            closingForNavigationRef.current = false;
          });
      }),
    [modalStep, navigation, workspace.requestClose]
  );
  const formatDate = (date: Date) => {
    const age = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (age === 0) return 'today';
    if (age === 1) return 'yesterday';
    if (age < 7) return `${age} days ago`;
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  };
  const renderRow = ({ item }: ListRenderItemInfo<TierList>) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={
        item.description?.trim()
          ? `${item.title}, ${item.itemCount} items. ${item.description}`
          : `${item.title}, ${item.itemCount} items`
      }
      accessibilityHint="Open tier list"
      onPress={() =>
        navigation.navigate('ListDetail', {
          listId: item.id,
          listTitle: item.title,
        })
      }
      activeOpacity={0.7}
      style={styles.row}
    >
      <View style={styles.rowText}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        {item.description?.trim() ? (
          <Text style={styles.description} numberOfLines={1}>
            {item.description}
          </Text>
        ) : null}
        <Text style={styles.itemCount}>{item.itemCount} items</Text>
        <Text style={styles.updatedAt}>
          Modified {formatDate(item.updatedAt)}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={AppColors.textSecondary}
      />
    </TouchableOpacity>
  );
  const content =
    !token || isLoading ? (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={AppColors.accent.primary} />
      </View>
    ) : error ? (
      <View style={styles.center}>
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={AppColors.textSecondary}
        />
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Button title="Try again" onPress={() => void fetchLists()} />
      </View>
    ) : (
      <FlatList
        style={styles.list}
        data={lists}
        renderItem={renderRow}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Image
              source={require('../../assets/logo-transparent.png')}
              style={styles.logo}
              accessible={false}
            />
            <Text style={styles.emptyTitle}>Your lists start here</Text>
            <Text style={styles.emptyText}>
              Create a list to start ranking what you love.
            </Text>
          </View>
        }
      />
    );
  return (
    <View style={[styles.container, { height: windowHeight }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.shell}>
          <View style={[styles.shellContent, { marginHorizontal: gutter }]}>
            <View style={styles.header}>
              <Text style={styles.brand}>TierNerd</Text>
              <View style={styles.headerActions}>
                <Button
                  title="New list"
                  onPress={() => setModalStep('create')}
                  size="small"
                  testID="fab-create"
                  accessibilityLabel="Create new list"
                />
                <TouchableOpacity
                  onPress={() => navigation.navigate('Profile')}
                  style={styles.profile}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Open profile"
                >
                  {user?.photoUrl ? (
                    <Image
                      source={{ uri: user.photoUrl }}
                      style={styles.profileImage}
                      accessible={false}
                    />
                  ) : (
                    <View style={styles.profilePlaceholder}>
                      <Ionicons
                        name="person"
                        size={20}
                        color={AppColors.accent.primary}
                      />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.readingRegion}>{content}</View>
          </View>
        </View>
        <Modal
          visible={modalStep !== null}
          transparent
          animationType="none"
          accessibilityLabel={getModalTitle()}
          onRequestClose={() => {
            if (modalStep === 'create')
              void createListRef.current?.requestClose().catch(() => false);
            else if (modalStep === 'addItem')
              void workspace.requestClose().catch(() => false);
          }}
        >
          {modalStep === 'create' && (
            <CreateListContent
              ref={createListRef}
              onClose={() => {
                setModalStep(null);
                setPendingList(null);
              }}
              onSuccess={handleListCreated}
            />
          )}
          {modalStep === 'addItem' &&
            pendingList &&
            (workspace.mode === 'ranking' && workspace.session ? (
              <RankingContent
                listTitle={pendingList.title}
                session={workspace.session}
                presentation="modal"
                isBusy={workspace.isBusy}
                error={workspace.error}
                onAnswer={(result) => void workspace.answer(result)}
                onUndo={() => void workspace.undo()}
                onCommit={() => void workspace.commit()}
                onCancel={() =>
                  void workspace.requestClose().catch(() => false)
                }
                onRestart={() => void workspace.restart()}
                onReload={workspace.reloadSession}
                onRetryRefresh={workspace.retryRefresh}
              />
            ) : workspace.mode === 'add' || workspace.mode === 'edit' ? (
              <AddItemContent
                mode={workspace.mode}
                form={workspace.form}
                onFormChange={workspace.setForm}
                onRetryRefresh={workspace.retryRefresh}
                fieldErrors={workspace.fieldErrors}
                isBusy={workspace.isBusy}
                error={workspace.error}
                onSubmit={() => void workspace.submitMetadata()}
                onClose={() => void workspace.requestClose().catch(() => false)}
                presentation="modal"
                introText={`“${pendingList.title}” created. Add its first item.`}
              />
            ) : null)}
        </Modal>
      </SafeAreaView>
    </View>
  );
};
const styles = StyleSheet.create({
  container: { minHeight: 0, backgroundColor: AppColors.dominant.secondary },
  safeArea: { minHeight: 0, flex: 1 },
  shell: {
    width: '100%',
    maxWidth: AppLayout.maxWidth,
    alignSelf: 'center',
    flex: 1,
    minHeight: 0,
  },
  shellContent: { flex: 1, minHeight: 0 },
  header: {
    paddingTop: AppSpacing.md,
    paddingBottom: AppSpacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    ...AppTypography.headlineSmall,
    color: AppColors.secondary.emphasis,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  profile: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.accent.light,
  },
  profileImage: { width: '100%', height: '100%' },
  profilePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: AppColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readingRegion: {
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
    flex: 1,
    minHeight: 0,
  },
  list: { flex: 1, minHeight: 0 },
  listContent: { paddingBottom: AppSpacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppColors.neutral[200],
  },
  rowText: { flex: 1, minWidth: 0, gap: AppSpacing.sm },
  title: {
    ...AppTypography.bodyLarge,
    color: AppColors.secondary.emphasis,
    fontWeight: '600',
  },
  description: {
    ...AppTypography.bodySmall,
    color: AppColors.textSecondary,
  },
  itemCount: {
    ...AppTypography.bodySmall,
    color: AppColors.textSecondary,
  },
  updatedAt: {
    ...AppTypography.bodySmall,
    color: AppColors.secondary.muted,
  },
  empty: { alignItems: 'flex-start', paddingTop: AppSpacing.xs },
  logo: { width: 56, height: 56, marginBottom: AppSpacing.sm },
  emptyTitle: {
    ...AppTypography.headlineSmall,
    color: AppColors.secondary.emphasis,
    fontWeight: '600',
    marginBottom: AppSpacing.xs,
  },
  emptyText: { ...AppTypography.bodyMedium, color: AppColors.textSecondary },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
  },
  errorTitle: {
    ...AppTypography.headlineSmall,
    color: AppColors.secondary.emphasis,
    fontWeight: '600',
    marginTop: AppSpacing.md,
    marginBottom: AppSpacing.xs,
  },
  errorText: {
    ...AppTypography.bodyMedium,
    color: AppColors.textSecondary,
    textAlign: 'center',
    marginBottom: AppSpacing.lg,
  },
});
