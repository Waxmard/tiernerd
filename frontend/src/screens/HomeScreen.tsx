import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  type ListRenderItemInfo,
  Modal,
  Platform,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { AddItemContent } from '../components/AddItemContent';
import {
  type CreatedList,
  CreateListContent,
  type CreateListContentHandle,
} from '../components/CreateListModal';
import { RankingContent } from '../components/RankingContent';
import { useItemWorkspace } from '../components/useItemWorkspace';
import { Button } from '../design-system/components';
import { type ListColor, palette } from '../design-system/tokens/colors';
import type { RootStackScreenProps } from '../navigation/types';
import { useAuth } from '../providers/AuthContext';
import { useTheme, useThemeColors } from '../providers/ThemeProvider';
import { ApiError } from '../services/apiError';
import type { Item } from '../services/itemsService';
import {
  enqueueListCacheWrite,
  listItemsCacheKey,
  listsCacheKey,
  parseCachedLists,
} from '../services/listsCache';
import { type ListSimple, listsService } from '../services/listsService';

type ModalStep = 'create' | 'addItem' | null;
interface TierList {
  id: string;
  title: string;
  description: string | null;
  color: ListColor | null;
  itemCount: number;
  updatedAt: Date;
}
type HomeScreenProps = RootStackScreenProps<'Main'>;
const CHIP_CLASS: Record<ListColor, string> = {
  blue: 'bg-list-blue-tint dark:bg-list-blue-tint-dark',
  teal: 'bg-list-teal-tint dark:bg-list-teal-tint-dark',
  amber: 'bg-list-amber-tint dark:bg-list-amber-tint-dark',
  pink: 'bg-list-pink-tint dark:bg-list-pink-tint-dark',
};
const toTierList = (list: ListSimple): TierList => ({
  id: list.list_id,
  title: list.title,
  description: list.description,
  color: list.color,
  itemCount: list.item_count,
  updatedAt: new Date(list.updated_at),
});
export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { user, token } = useAuth();
  const userId = user?.id ?? null;
  const { scheme } = useTheme();
  const colors = useThemeColors();
  const safeAreaInsets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const columns = windowWidth >= 1280 ? 3 : windowWidth >= 768 ? 2 : 1;
  const horizontalGutter = windowWidth >= 1024 ? 24 : 16;
  const availableWidth = Math.min(
    windowWidth - safeAreaInsets.left - safeAreaInsets.right,
    1280
  );
  const cardWidth =
    (availableWidth - 2 * horizontalGutter - 12 * (columns - 1)) / columns;
  const [lists, setLists] = useState<TierList[]>([]);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [snapshotIdentity, setSnapshotIdentity] = useState<{
    userId: string | null;
    token: string | null;
  } | null>(null);
  const currentSnapshot =
    hasSnapshot &&
    snapshotIdentity !== null &&
    snapshotIdentity.userId === userId &&
    snapshotIdentity.token === token;
  const visibleLists = currentSnapshot ? lists : [];
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalStep, setModalStep] = useState<ModalStep>(null);
  const [pendingList, setPendingList] = useState<CreatedList | null>(null);
  const createListRef = useRef<CreateListContentHandle | null>(null);
  const bypassBeforeRemoveRef = useRef(false);
  const closingForNavigationRef = useRef(false);
  const listsRequestRef = useRef(0);
  const overviewLifecycleRef = useRef(0);
  const liveResponseRef = useRef(0);
  const identityRef = useRef({ userId, token });
  identityRef.current = { userId, token };
  const isIdentityCurrent = useCallback(
    (expectedUserId: string | null, expectedToken: string | null) =>
      identityRef.current.userId === expectedUserId &&
      identityRef.current.token === expectedToken,
    []
  );
  useEffect(() => {
    overviewLifecycleRef.current += 1;
    listsRequestRef.current += 1;
    setLists([]);
    setHasSnapshot(false);
    setSnapshotIdentity({ userId, token });
    setError(null);
    setIsLoading(Boolean(token));
  }, [token, userId]);
  const refreshLists = useCallback(
    async (showLoading = false) => {
      if (!token) return;
      const requestId = ++listsRequestRef.current;
      const lifecycleId = overviewLifecycleRef.current;
      const isCurrent = () =>
        requestId === listsRequestRef.current &&
        lifecycleId === overviewLifecycleRef.current &&
        isIdentityCurrent(userId, token);
      if (showLoading) setIsLoading(true);
      try {
        const result = await listsService.getLists(token);
        if (!isCurrent()) return;
        liveResponseRef.current += 1;
        setLists(result.map(toTierList));
        setSnapshotIdentity({ userId, token });
        setHasSnapshot(true);
        setError(null);
        if (userId) {
          const key = listsCacheKey(userId);
          if (isCurrent())
            void enqueueListCacheWrite(key, async () => {
              if (isCurrent())
                await AsyncStorage.setItem(key, JSON.stringify(result));
            }).catch(() => {});
        }
      } catch (err: unknown) {
        if (isCurrent()) {
          setError(err instanceof Error ? err.message : 'Failed to load lists');
          if (
            err instanceof ApiError &&
            (err.status === 401 || err.status === 403)
          ) {
            liveResponseRef.current += 1;
            setLists([]);
            setHasSnapshot(false);
            setSnapshotIdentity({ userId, token });
            if (userId) {
              const key = listsCacheKey(userId);
              if (isCurrent())
                void enqueueListCacheWrite(key, async () => {
                  if (isCurrent()) await AsyncStorage.removeItem(key);
                }).catch(() => {});
            }
          }
        }
        throw err;
      } finally {
        if (isCurrent()) setIsLoading(false);
      }
    },
    [isIdentityCurrent, token, userId]
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
      const lifecycleId = ++overviewLifecycleRef.current;
      const identityUserId = userId;
      const identityToken = token;
      const cacheRevision = liveResponseRef.current;
      let active = true;
      const isCurrent = () =>
        active &&
        lifecycleId === overviewLifecycleRef.current &&
        isIdentityCurrent(identityUserId, identityToken);
      void fetchLists();
      if (identityUserId) {
        void (async () => {
          const raw = await AsyncStorage.getItem(
            listsCacheKey(identityUserId)
          ).catch(() => null);
          if (!isCurrent() || cacheRevision !== liveResponseRef.current) return;
          const cached = parseCachedLists(raw);
          if (cached) {
            setLists(cached.map(toTierList));
            setSnapshotIdentity({
              userId: identityUserId,
              token: identityToken,
            });
            setHasSnapshot(true);
            setIsLoading(false);
          } else {
            setLists([]);
            setSnapshotIdentity({
              userId: identityUserId,
              token: identityToken,
            });
            setHasSnapshot(false);
          }
        })();
      }
      return () => {
        active = false;
        ++overviewLifecycleRef.current;
        ++listsRequestRef.current;
      };
    }, [fetchLists, isIdentityCurrent, token, userId])
  );
  const handleWorkspaceItemsChanged = useCallback(
    async (item?: Item) => {
      const expectedUserId = userId;
      const expectedToken = token;
      const lifecycleId = ++overviewLifecycleRef.current;
      const requestId = ++listsRequestRef.current;
      setIsLoading(false);
      if (expectedUserId) {
        const overviewKey = listsCacheKey(expectedUserId);
        const itemKey = pendingList
          ? listItemsCacheKey(expectedUserId, pendingList.listId)
          : null;
        const keys = [overviewKey, itemKey].filter(
          (key): key is string => key !== null
        );
        await Promise.all(
          keys.map((key) => {
            if (
              requestId !== listsRequestRef.current ||
              lifecycleId !== overviewLifecycleRef.current ||
              !isIdentityCurrent(expectedUserId, expectedToken)
            )
              return Promise.resolve();
            return enqueueListCacheWrite(key, async () => {
              if (
                requestId === listsRequestRef.current &&
                lifecycleId === overviewLifecycleRef.current &&
                isIdentityCurrent(expectedUserId, expectedToken)
              )
                await AsyncStorage.removeItem(key);
            }).catch(() => {});
          })
        );
      }
      if (
        requestId !== listsRequestRef.current ||
        lifecycleId !== overviewLifecycleRef.current ||
        !isIdentityCurrent(expectedUserId, expectedToken)
      )
        return;
      await refreshLists();
      if (
        item &&
        pendingList &&
        lifecycleId === overviewLifecycleRef.current &&
        isIdentityCurrent(expectedUserId, expectedToken)
      )
        navigation.navigate('ListDetail', {
          listId: pendingList.listId,
          listTitle: pendingList.title,
          completedItemId: item.item_id,
        });
    },
    [isIdentityCurrent, navigation, pendingList, refreshLists, token, userId]
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
      const expectedUserId = userId;
      const expectedToken = token;
      const lifecycleId = ++overviewLifecycleRef.current;
      const requestId = ++listsRequestRef.current;
      setIsLoading(false);
      setPendingList(list);
      workspace.openAdd();
      setModalStep('addItem');
      if (
        expectedUserId &&
        requestId === listsRequestRef.current &&
        lifecycleId === overviewLifecycleRef.current &&
        isIdentityCurrent(expectedUserId, expectedToken)
      ) {
        const key = listsCacheKey(expectedUserId);
        void enqueueListCacheWrite(key, async () => {
          if (
            requestId === listsRequestRef.current &&
            lifecycleId === overviewLifecycleRef.current &&
            isIdentityCurrent(expectedUserId, expectedToken)
          )
            await AsyncStorage.removeItem(key);
        })
          .catch(() => {})
          .then(() => {
            if (
              requestId === listsRequestRef.current &&
              lifecycleId === overviewLifecycleRef.current &&
              isIdentityCurrent(expectedUserId, expectedToken)
            )
              return refreshLists();
          })
          .catch(() => {});
      } else if (
        requestId === listsRequestRef.current &&
        lifecycleId === overviewLifecycleRef.current &&
        isIdentityCurrent(expectedUserId, expectedToken)
      ) {
        void refreshLists().catch(() => {});
      }
    },
    [isIdentityCurrent, refreshLists, token, userId, workspace.openAdd]
  );
  const getModalTitle = () =>
    modalStep === 'create'
      ? 'Create New List'
      : workspace.mode === 'ranking'
        ? workspace.session?.status === 'ready_to_commit'
          ? 'Saving ranking…'
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
            : workspace.mode === 'ranking'
              ? workspace.pauseRanking()
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
    [
      modalStep,
      navigation,
      workspace.mode,
      workspace.pauseRanking,
      workspace.requestClose,
    ]
  );
  const formatDate = (date: Date) => {
    const age = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (age === 0) return 'today';
    if (age === 1) return 'yesterday';
    if (age < 7) return `${age} days ago`;
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  };
  const renderRow = ({ item }: ListRenderItemInfo<TierList>) => {
    const chipIconColor = item.color
      ? palette.list[item.color][scheme]['on-tint']
      : colors['accent-text'];
    return (
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
        style={{ width: cardWidth }}
        className="shrink-0 overflow-hidden rounded-2xl border border-line bg-surface dark:border-line-dark dark:bg-surface-dark"
      >
        <View className="flex-row items-center gap-3 p-4">
          <View
            className={[
              'w-8 h-8 items-center justify-center rounded-lg',
              item.color
                ? CHIP_CLASS[item.color]
                : 'bg-accent-tint dark:bg-accent-tint-dark',
            ].join(' ')}
          >
            <Ionicons
              name="layers-outline"
              size={20}
              color={chipIconColor}
              accessible={false}
            />
          </View>
          <View className="flex-1 min-w-0 gap-1">
            <Text className="text-title-medium font-semibold text-ink dark:text-ink-dark">
              {item.title}
            </Text>
            {item.description?.trim() ? (
              <Text
                numberOfLines={2}
                className="text-body-medium text-ink-muted dark:text-ink-muted-dark"
              >
                {item.description}
              </Text>
            ) : null}
          </View>
        </View>
        <View className="flex-row items-center justify-between gap-2 border-t border-line px-3 py-2 dark:border-line-dark">
          <View className="flex-1 min-w-0 flex-row flex-wrap items-center gap-3">
            <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
              {item.itemCount} items
            </Text>
            <Text className="text-body-small text-ink-muted dark:text-ink-muted-dark">
              Modified {formatDate(item.updatedAt)}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={colors['ink-muted']}
            accessible={false}
          />
        </View>
      </TouchableOpacity>
    );
  };
  const content =
    !token || (isLoading && !currentSnapshot) ? (
      <View className="flex-1 items-center justify-center px-6">
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    ) : error && !currentSnapshot ? (
      <View className="flex-1 items-center justify-center px-6">
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={colors['ink-muted']}
        />
        <Text className="text-headline-small font-semibold text-ink dark:text-ink-dark mt-4 mb-1">
          Something went wrong
        </Text>
        <Text className="text-body-medium text-ink-muted dark:text-ink-muted-dark text-center mb-6">
          {error}
        </Text>
        <Button title="Try again" onPress={() => void fetchLists()} />
      </View>
    ) : (
      <FlatList
        key={columns}
        className="flex-1 min-h-0"
        data={visibleLists}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? { gap: 12 } : undefined}
        renderItem={renderRow}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: 16 + safeAreaInsets.bottom,
          gap: 12,
        }}
        ListHeaderComponent={
          <View className="gap-2">
            <Text
              accessibilityRole="header"
              className="text-headline-small text-ink dark:text-ink-dark"
            >
              My lists
            </Text>
            {error ? (
              <View className="flex-row items-center justify-between gap-3 rounded-xl border border-danger-text p-3">
                <Text
                  accessibilityLiveRegion="polite"
                  className="flex-1 text-body-medium text-danger-text dark:text-danger-text-dark"
                >
                  {error}
                </Text>
                <Button title="Try again" onPress={() => void fetchLists()} />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Create a list. Start ranking what you love."
            onPress={() => setModalStep('create')}
            activeOpacity={0.7}
            className="w-full min-h-24 flex-row items-center gap-3 border-2 border-dashed border-control rounded-2xl bg-surface-muted px-4 py-3 dark:border-control-dark dark:bg-surface-muted-dark"
          >
            <Ionicons
              name="add-circle-outline"
              size={24}
              color={colors['accent-text']}
              accessible={false}
            />
            <View className="flex-1 min-w-0 gap-1">
              <Text className="text-title-small font-semibold text-ink dark:text-ink-dark">
                Create a list
              </Text>
              <Text className="text-body-medium text-ink-muted dark:text-ink-muted-dark">
                Start ranking what you love.
              </Text>
            </View>
          </TouchableOpacity>
        }
      />
    );
  return (
    <View className="flex-1 min-h-0 bg-canvas dark:bg-canvas-dark">
      <SafeAreaView
        className={`min-h-0 flex-1${Platform.OS === 'web' ? ' web-safe-area-top' : ''}`}
        edges={['top', 'left', 'right']}
      >
        <View className="w-full max-w-[1280px] self-center flex-1 min-h-0">
          <View
            className="flex-1 min-h-0"
            style={{ marginHorizontal: horizontalGutter }}
          >
            <View className="py-2 flex-row flex-wrap justify-between items-center gap-2 shrink-0 bg-canvas dark:bg-canvas-dark">
              <View className="flex-row items-center gap-1 shrink-0">
                <Ionicons
                  name="layers-outline"
                  size={20}
                  color={colors['accent-text']}
                  accessible={false}
                />
                <Text className="text-title-medium font-semibold text-ink dark:text-ink-dark">
                  TierNerd
                </Text>
              </View>
              <View className="flex-row items-center gap-2 shrink-0">
                <Button
                  title="New list"
                  onPress={() => setModalStep('create')}
                  size="small"
                  icon={
                    <Ionicons
                      name="add-circle-outline"
                      size={20}
                      color={colors['on-accent']}
                      accessible={false}
                    />
                  }
                  testID="fab-create"
                  accessibilityLabel="Create new list"
                />
                <TouchableOpacity
                  onPress={() => navigation.navigate('Profile')}
                  className="w-11 h-11 rounded-full overflow-hidden bg-surface dark:bg-surface-dark border border-accent-line dark:border-accent-line-dark"
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Open profile"
                >
                  {user?.photoUrl ? (
                    <Image
                      source={{ uri: user.photoUrl }}
                      className="w-full h-full"
                      accessible={false}
                    />
                  ) : (
                    <View className="w-full h-full bg-surface dark:bg-surface-dark items-center justify-center">
                      <Ionicons
                        name="person"
                        size={20}
                        color={colors['accent-text']}
                      />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
            <View className="flex-1 min-h-0">{content}</View>
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
            else if (modalStep === 'addItem') {
              if (workspace.mode === 'ranking') {
                const list = pendingList;
                if (workspace.pauseRanking() && list)
                  navigation.navigate('ListDetail', {
                    listId: list.listId,
                    listTitle: list.title,
                  });
              } else void workspace.requestClose().catch(() => false);
            }
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
                recoveryRequired={workspace.recoveryRequired}
                onAnswer={(result) => void workspace.answer(result)}
                onUndo={() => void workspace.undo()}
                onRetryCommit={() => void workspace.retryCommit()}
                onCancel={() =>
                  void workspace.requestClose().catch(() => false)
                }
                onPause={() => {
                  const list = pendingList;
                  if (workspace.pauseRanking() && list) {
                    navigation.navigate('ListDetail', {
                      listId: list.listId,
                      listTitle: list.title,
                    });
                  }
                }}
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
                introText={`“${pendingList.title}”`}
              />
            ) : null)}
        </Modal>
      </SafeAreaView>
    </View>
  );
};
