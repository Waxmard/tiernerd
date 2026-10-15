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
  Text,
  TouchableOpacity,
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
import type { Item } from '../services/itemsService';
import { listsCacheKey, parseCachedLists } from '../services/listsCache';
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
  const { scheme } = useTheme();
  const colors = useThemeColors();
  const safeAreaInsets = useSafeAreaInsets();
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
        if (user)
          void AsyncStorage.setItem(
            listsCacheKey(user.id),
            JSON.stringify(result)
          ).catch(() => {});
      } catch (err: unknown) {
        if (requestId === listsRequestRef.current)
          setError(err instanceof Error ? err.message : 'Failed to load lists');
        throw err;
      } finally {
        if (requestId === listsRequestRef.current) setIsLoading(false);
      }
    },
    [token, user]
  );
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const raw = await AsyncStorage.getItem(listsCacheKey(user.id)).catch(
        () => null
      );
      if (cancelled) return;
      const cached = parseCachedLists(raw);
      if (!cached) return;
      setLists(cached.map(toTierList));
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);
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
        className="flex-row items-center gap-2 p-[14px] mb-2 bg-surface dark:bg-surface-dark rounded-lg"
      >
        <View
          className={[
            'w-10 h-10 items-center justify-center rounded-lg',
            item.color
              ? CHIP_CLASS[item.color]
              : 'bg-accent-tint dark:bg-accent-tint-dark',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <Ionicons
            name="layers-outline"
            size={20}
            color={chipIconColor}
            accessible={false}
          />
        </View>
        <View className="flex-1 min-w-0 gap-2">
          <Text className="text-[18px] leading-[25.2px] font-semibold text-ink dark:text-ink-dark">
            {item.title}
          </Text>
          {item.description?.trim() ? (
            <Text className="text-[14px] leading-[21px] text-ink-muted dark:text-ink-muted-dark">
              {item.description}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-[14px] leading-[21px] text-ink-muted dark:text-ink-muted-dark">
              {item.itemCount} items
            </Text>
            <Text className="text-[14px] leading-[21px] text-ink-muted dark:text-ink-muted-dark">
              Modified {formatDate(item.updatedAt)}
            </Text>
          </View>
        </View>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={colors['ink-muted']}
        />
      </TouchableOpacity>
    );
  };
  const content =
    !token || isLoading ? (
      <View className="flex-1 items-center justify-center px-6">
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    ) : error && !lists.length ? (
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
        className="flex-1 min-h-0"
        data={lists}
        renderItem={renderRow}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 16 + safeAreaInsets.bottom }}
        ListHeaderComponent={
          <Text
            accessibilityRole="header"
            className="text-[30px] leading-[36px] font-semibold text-ink dark:text-ink-dark mb-3"
          >
            My lists
          </Text>
        }
        ListEmptyComponent={
          <View className="items-start pt-0.5">
            <Image
              source={require('../../assets/logo-transparent.png')}
              className="w-14 h-14 mb-2"
              accessible={false}
            />
            <Text className="text-headline-small font-semibold text-ink dark:text-ink-dark mb-1">
              Your lists start here
            </Text>
            <Text className="text-body-medium text-ink-muted dark:text-ink-muted-dark">
              Create a list to start ranking what you love.
            </Text>
          </View>
        }
      />
    );
  return (
    <View className="flex-1 min-h-0 bg-canvas dark:bg-canvas-dark">
      <SafeAreaView className="min-h-0 flex-1" edges={['top']}>
        <View className="w-full max-w-[1280px] self-center flex-1 min-h-0">
          <View className="flex-1 min-h-0 mx-4 desktop:mx-6">
            <View className="pt-8 desktop:pt-4 pb-4 flex-row flex-wrap justify-between items-center shrink-0 bg-canvas dark:bg-canvas-dark">
              <View className="flex-row items-center gap-1">
                <Ionicons
                  name="layers-outline"
                  size={20}
                  color={colors['accent-text']}
                  accessible={false}
                />
                <Text className="text-headline-small font-semibold text-ink dark:text-ink-dark">
                  TierNerd
                </Text>
              </View>
              <View className="flex-row flex-wrap items-center gap-2">
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
            <View className="w-full max-w-[800px] self-center flex-1 min-h-0">
              {content}
            </View>
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
                recoveryRequired={workspace.recoveryRequired}
                onAnswer={(result) => void workspace.answer(result)}
                onUndo={() => void workspace.undo()}
                onRetryCommit={() => void workspace.retryCommit()}
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
                introText={`“${pendingList.title}”`}
              />
            ) : null)}
        </Modal>
      </SafeAreaView>
    </View>
  );
};
