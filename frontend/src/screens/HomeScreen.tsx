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
  Pressable,
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
import { EmojiPickerModal } from '../components/EmojiPicker';
import {
  ImmersiveScreenShell,
  ListIdentityBadge,
  NavBarTitle,
  NavIconButton,
  ScreenNavBar,
  useScrolledPast,
} from '../components/ImmersiveBoard';
import { useItemWorkspace } from '../components/useItemWorkspace';
import { Button, Emoji, SheetModal } from '../design-system/components';
import type { ListIcon } from '../design-system/tokens/colors';
import type { RootStackScreenProps } from '../navigation/types';
import { useAuth } from '../providers/AuthContext';
import { useNotifyWhenOnline, useSync } from '../providers/SyncProvider';
import { useTheme } from '../providers/ThemeProvider';
import { aiService } from '../services/aiService';
import { ApiError, getApiErrorMessage } from '../services/apiError';
import type { Item } from '../services/itemsService';
import { listIconEmoji } from '../services/listIcon';
import {
  enqueueListCacheWrite,
  listsCacheKey,
  parseCachedLists,
  sortListsByRecency,
} from '../services/listsCache';
import { type ListSimple, listsService } from '../services/listsService';
import { localLibrary, reconcileLists } from '../services/localLibrary';
import { pendingOps } from '../services/syncQueue';
import { newId } from '../utils/id';

type ModalStep = 'create' | 'addItem' | null;
interface TierList {
  id: string;
  title: string;
  description: string | null;
  icon: ListIcon | null;
  itemCount: number;
  updatedAt: Date;
}
type HomeScreenProps = RootStackScreenProps<'Main'>;
const toTierList = (list: ListSimple): TierList => ({
  id: list.list_id,
  title: list.title,
  description: list.description,
  icon: list.icon ?? null,
  itemCount: list.item_count,
  updatedAt: new Date(list.updated_at),
});
const itemCountLabel = (count: number) =>
  `${count} ${count === 1 ? 'item' : 'items'}`;
export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { user, token } = useAuth();
  const { flush, isOffline, lastSyncedAt, mutate } = useSync();
  const notify = useNotifyWhenOnline();
  const isOfflineRef = useRef(isOffline);
  isOfflineRef.current = isOffline;
  const userId = user?.id ?? null;
  const { colors } = useTheme();
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
  const listsRef = useRef(lists);
  listsRef.current = lists;
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
  const [loadFailed, setLoadFailed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>(null);
  const modalStepRef = useRef(modalStep);
  modalStepRef.current = modalStep;
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestedTitle, setSuggestedTitle] = useState('');
  const suggestedTitlesRef = useRef<string[]>([]);
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const [pendingList, setPendingList] = useState<CreatedList | null>(null);
  const [iconListId, setIconListId] = useState<string | null>(null);
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
    setIsLoading(Boolean(token));
    setLoadFailed(false);
    suggestedTitlesRef.current = [];
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
        if (!isOfflineRef.current) {
          await flush().catch(() => undefined);
        }
        const fetched = await listsService.getLists(token);
        const result = userId
          ? reconcileLists(
              fetched,
              parseCachedLists(
                await AsyncStorage.getItem(listsCacheKey(userId)).catch(
                  () => null
                )
              ) ?? [],
              await pendingOps(userId)
            )
          : sortListsByRecency(fetched);
        if (!isCurrent()) return;
        liveResponseRef.current += 1;
        setLists(result.map(toTierList));
        setSnapshotIdentity({ userId, token });
        setHasSnapshot(true);
        setLoadFailed(false);
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
          setLoadFailed(true);
          notify(
            err instanceof Error ? err.message : "Couldn't load your lists."
          );
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
    [flush, isIdentityCurrent, notify, token, userId]
  );
  const fetchLists = useCallback(async () => {
    try {
      await refreshLists(true);
    } catch {
      return;
    }
  }, [refreshLists]);
  const handleRefresh = () => {
    setIsRefreshing(true);
    void refreshLists()
      .catch(() => undefined)
      .finally(() => setIsRefreshing(false));
  };
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
      await refreshLists().catch(() => undefined);
      if (
        !item ||
        !pendingList ||
        !isIdentityCurrent(expectedUserId, expectedToken)
      )
        return;
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
    userId,
    listId: pendingList?.listId ?? '',
    listTitle: pendingList?.title ?? '',
    items: [],
    onItemsChanged: handleWorkspaceItemsChanged,
    onClosed: handleWorkspaceClosed,
  });
  const showCachedLists = useCallback(
    async (expectedUserId: string | null, expectedToken: string | null) => {
      if (!expectedUserId) return;
      const cached = parseCachedLists(
        await AsyncStorage.getItem(listsCacheKey(expectedUserId)).catch(
          () => null
        )
      );
      if (!cached || !isIdentityCurrent(expectedUserId, expectedToken)) return;
      setLists(cached.map(toTierList));
      setSnapshotIdentity({ userId: expectedUserId, token: expectedToken });
      setHasSnapshot(true);
    },
    [isIdentityCurrent]
  );
  const saveListIcon = async (listId: string, icon: string) => {
    if (!userId) return;
    const now = new Date().toISOString();
    const metadata = { icon };
    try {
      const outcome = await mutate(
        { id: newId(), createdAt: now, kind: 'list.update', listId, metadata },
        {
          applyLocal: () =>
            localLibrary.applyLocalListUpdate(userId, listId, metadata, now),
        }
      );
      if (outcome.status === 'rejected') notify(outcome.message);
    } catch (err) {
      notify(getApiErrorMessage(err, 'Unable to save the list emoji.'));
    }
    await refreshLists().catch(() => showCachedLists(userId, token));
  };
  const autoFillListIcon = async (list: ListSimple) => {
    if (!token || list.icon || isOfflineRef.current) return;
    const expectedUserId = userId;
    const [icon] = await aiService
      .suggestEmojis(
        { name: list.title, kind: 'list', description: list.description },
        token
      )
      .catch((): string[] => []);
    if (!icon || !isIdentityCurrent(expectedUserId, token)) return;
    if (
      listsRef.current.find((entry) => entry.id === list.list_id)?.icon !== null
    )
      return;
    await saveListIcon(list.list_id, icon);
  };
  const handleSuggestList = async () => {
    if (!token) return;
    const expectedUserId = userId;
    setIsSuggesting(true);
    try {
      const title = await aiService.suggestNextList(
        suggestedTitlesRef.current,
        token
      );
      if (
        !isIdentityCurrent(expectedUserId, token) ||
        modalStepRef.current !== null ||
        !navigation.isFocused()
      )
        return;
      suggestedTitlesRef.current = [...suggestedTitlesRef.current, title].slice(
        -50
      );
      setSuggestedTitle(title);
      setModalStep('create');
    } catch (err) {
      notify(getApiErrorMessage(err, "Couldn't suggest a list. Try again."));
    } finally {
      setIsSuggesting(false);
    }
  };
  const iconList = visibleLists.find((entry) => entry.id === iconListId);
  const iconListValue = listIconEmoji(iconList?.icon);
  const handleListCreated = useCallback(
    (list: ListSimple, fromSuggestion: boolean) => {
      const expectedUserId = userId;
      const expectedToken = token;
      const created = toTierList(list);
      setLists((previous) =>
        [created, ...previous.filter((entry) => entry.id !== created.id)].sort(
          (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
        )
      );
      setSnapshotIdentity({ userId: expectedUserId, token: expectedToken });
      setHasSnapshot(true);
      setIsLoading(false);
      if (fromSuggestion) {
        setModalStep(null);
        navigation.navigate('ListDetail', {
          listId: list.list_id,
          listTitle: list.title,
        });
      } else {
        setPendingList({ listId: list.list_id, title: list.title });
        workspace.openAdd();
        setModalStep('addItem');
      }
      void refreshLists().catch(() =>
        showCachedLists(expectedUserId, expectedToken)
      );
    },
    [
      navigation,
      refreshLists,
      showCachedLists,
      token,
      userId,
      workspace.openAdd,
    ]
  );
  const getModalTitle = () =>
    modalStep === 'create' ? 'Create New List' : 'Add item';
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
  useEffect(() => {
    if (lastSyncedAt === 0) return;
    void refreshLists().catch(() => undefined);
  }, [lastSyncedAt, refreshLists]);
  const { mode: workspaceMode, dismissResult } = workspace;
  useEffect(() => {
    if (workspaceMode === 'ranked') dismissResult();
  }, [workspaceMode, dismissResult]);

  const wasOfflineRef = useRef(isOffline);
  useEffect(() => {
    if (wasOfflineRef.current && !isOffline) {
      void refreshLists().catch(() => undefined);
    }
    wasOfflineRef.current = isOffline;
  }, [isOffline, refreshLists]);

  const formatDate = (date: Date) => {
    const age = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (age === 0) return 'today';
    if (age === 1) return 'yesterday';
    if (age < 7) return `${age} days ago`;
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year:
        date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    });
  };
  const renderRow = ({ item }: ListRenderItemInfo<TierList>) => {
    const titleLength = Array.from(item.title).length;
    const count = itemCountLabel(item.itemCount);
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${count}`}
        accessibilityHint="Open tier list"
        accessibilityActions={[{ name: 'changeIcon', label: 'Change emoji' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'changeIcon')
            setIconListId(item.id);
        }}
        onPress={() =>
          navigation.navigate('ListDetail', {
            listId: item.id,
            listTitle: item.title,
          })
        }
        activeOpacity={0.7}
        style={{ width: cardWidth }}
        className="shrink-0 flex-row items-center gap-3 rounded-2xl border border-card-line bg-card p-4 dark:border-card-line-dark dark:bg-card-dark"
      >
        {item.icon ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Change emoji for ${item.title}`}
            accessibilityHint="Opens the emoji picker"
            hitSlop={6}
            onPress={() => setIconListId(item.id)}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <ListIdentityBadge size="lg" icon={item.icon} />
          </Pressable>
        ) : null}
        <View className="flex-1 min-w-0 gap-1">
          <Text
            numberOfLines={2}
            className={`${
              titleLength <= 40 ? 'text-title-medium' : 'text-title-small'
            } font-semibold text-card-ink dark:text-card-ink-dark`}
          >
            {item.title}
          </Text>
          <View className="flex-row flex-wrap items-center gap-x-3">
            <Text className="text-body-small text-card-ink-muted dark:text-card-ink-muted-dark">
              {count}
            </Text>
            <Text className="text-body-small text-card-ink-muted dark:text-card-ink-muted-dark">
              Modified {formatDate(item.updatedAt)}
            </Text>
          </View>
        </View>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={colors['card-ink-muted']}
          accessible={false}
        />
      </TouchableOpacity>
    );
  };
  const nav = useScrolledPast();
  const navScrolled = currentSnapshot && nav.scrolled;
  const titleBlock = (
    <View className="pt-1">
      <Text
        onLayout={nav.onTitleLayout}
        accessibilityRole="header"
        className="font-display-bold text-[32px] leading-[38px] tracking-[-0.4px] text-ink dark:text-ink-dark"
      >
        My lists
      </Text>
      <View className="mt-3 flex-row flex-wrap items-center gap-2">
        <Button
          title="New list"
          onPress={() => setModalStep('create')}
          icon={
            <Ionicons
              name="add"
              size={20}
              color={colors['on-accent']}
              accessible={false}
            />
          }
          accessibilityLabel="Create new list"
        />
        <Button
          icon={<Emoji symbol="✨" size={18} />}
          title="Suggest list"
          variant="text"
          loading={isSuggesting}
          disabled={isOffline || !token || modalStep !== null}
          onPress={() => void handleSuggestList()}
        />
      </View>
    </View>
  );
  const content = currentSnapshot ? (
    <FlatList
      key={columns}
      className="flex-1 min-h-0"
      data={visibleLists}
      numColumns={columns}
      columnWrapperStyle={columns > 1 ? { gap: 12 } : undefined}
      renderItem={renderRow}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      refreshing={isRefreshing}
      onRefresh={handleRefresh}
      contentContainerStyle={{
        paddingBottom: 16 + safeAreaInsets.bottom,
        gap: 12,
      }}
      ListHeaderComponent={titleBlock}
      onScroll={nav.onScroll}
      scrollEventThrottle={16}
      ListEmptyComponent={
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Create a list. Start ranking what you love."
          onPress={() => setModalStep('create')}
          activeOpacity={0.7}
          className="w-full items-center gap-2 border-2 border-dashed border-card-ink-muted rounded-2xl bg-card-muted px-4 py-8 dark:border-card-ink-muted-dark dark:bg-card-muted-dark"
        >
          <Emoji symbol="🏆" size={56} />
          <View className="items-center gap-1">
            <Text className="text-title-medium font-semibold text-center text-card-ink dark:text-card-ink-dark">
              Create a list
            </Text>
            <Text className="text-body-medium text-center text-card-ink-muted dark:text-card-ink-muted-dark">
              Start ranking what you love.
            </Text>
          </View>
        </TouchableOpacity>
      }
    />
  ) : loadFailed && !isLoading ? (
    <>
      {titleBlock}
      <View className="mt-3 w-full items-center gap-3 rounded-2xl border border-card-line bg-card px-4 py-8 dark:border-card-line-dark dark:bg-card-dark">
        <Emoji symbol="⚠️" size={40} />
        <View className="items-center gap-1">
          <Text className="text-title-medium font-semibold text-center text-card-ink dark:text-card-ink-dark">
            Couldn't load your lists
          </Text>
          <Text className="text-body-medium text-center text-card-ink-muted dark:text-card-ink-muted-dark">
            Check your connection and try again.
          </Text>
        </View>
        <Button
          title="Try again"
          variant="secondary"
          size="small"
          onPress={() => void fetchLists()}
        />
      </View>
    </>
  ) : (
    <>
      {titleBlock}
      <View className="flex-1 items-center justify-center px-6">
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    </>
  );
  return (
    <ImmersiveScreenShell>
      <ScreenNavBar scrolled={navScrolled}>
        {navScrolled ? null : (
          <Text className="pl-3 text-brand-title text-ink dark:text-ink-dark">
            TierNerd
          </Text>
        )}
        <NavBarTitle visible={navScrolled} align="left">
          My lists
        </NavBarTitle>
        {navScrolled ? (
          <NavIconButton
            name="add"
            label="Create new list"
            tone="accent"
            onPress={() => setModalStep('create')}
          />
        ) : null}
        <TouchableOpacity
          onPress={() => navigation.navigate('Profile')}
          className="w-10 h-10 mr-2 shrink-0 rounded-full overflow-hidden bg-surface dark:bg-surface-dark border border-accent-line dark:border-accent-line-dark"
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          {user?.photoUrl && user.photoUrl !== failedPhotoUrl ? (
            <Image
              source={{ uri: user.photoUrl }}
              onError={() => setFailedPhotoUrl(user.photoUrl ?? null)}
              resizeMode="cover"
              className="w-full h-full"
              accessible={false}
            />
          ) : (
            <View className="w-full h-full bg-surface dark:bg-surface-dark items-center justify-center">
              <Emoji symbol="👤" size={20} />
            </View>
          )}
        </TouchableOpacity>
      </ScreenNavBar>
      <SafeAreaView className="min-h-0 flex-1" edges={['left', 'right']}>
        <View className="w-full max-w-[1280px] self-center flex-1 min-h-0">
          <View
            className="flex-1 min-h-0"
            style={{ marginHorizontal: horizontalGutter }}
          >
            <View className="flex-1 min-h-0">{content}</View>
          </View>
        </View>
        <SheetModal
          visible={modalStep !== null}
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
              initialTitle={suggestedTitle}
              onClose={() => {
                setModalStep(null);
                setPendingList(null);
                setSuggestedTitle('');
              }}
              onSuccess={(list) => {
                const fromSuggestion = suggestedTitle !== '';
                setSuggestedTitle('');
                handleListCreated(list, fromSuggestion);
                void autoFillListIcon(list);
              }}
            />
          )}
          {modalStep === 'addItem' &&
            pendingList &&
            (workspace.mode === 'add' || workspace.mode === 'edit' ? (
              <AddItemContent
                mode={workspace.mode}
                form={workspace.form}
                onFormChange={workspace.setForm}
                fieldErrors={workspace.fieldErrors}
                isBusy={workspace.isBusy}
                onSubmit={() => void workspace.submitMetadata()}
                onClose={() => void workspace.requestClose().catch(() => false)}
                introText={`“${pendingList.title}”`}
                listTitle={pendingList.title}
              />
            ) : null)}
        </SheetModal>
        <EmojiPickerModal
          visible={iconListId !== null}
          value={iconListValue}
          suggestFor={
            iconList
              ? {
                  name: iconList.title,
                  kind: 'list',
                  description: iconList.description,
                }
              : undefined
          }
          onSelect={(emoji) => {
            const id = iconListId;
            setIconListId(null);
            if (id) void saveListIcon(id, emoji);
          }}
          onClose={() => setIconListId(null)}
        />
      </SafeAreaView>
    </ImmersiveScreenShell>
  );
};
