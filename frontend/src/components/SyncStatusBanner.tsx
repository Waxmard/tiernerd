import type React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSync } from '../providers/SyncProvider';

export const SyncStatusBanner: React.FC = () => {
  const { isOffline, isSyncing, pendingCount, issues, dismissIssue } =
    useSync();
  const status = isOffline
    ? 'Offline — changes will sync when you reconnect.'
    : isSyncing
      ? 'Syncing…'
      : pendingCount > 0
        ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync.`
        : null;

  if (!status && issues.length === 0) return null;

  return (
    <View className="gap-1 rounded-xl border border-line bg-surface-muted px-3 py-2 mb-2 dark:border-line-dark dark:bg-surface-muted-dark">
      {status ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-body-small text-ink-muted dark:text-ink-muted-dark"
        >
          {status}
        </Text>
      ) : null}
      {issues.map((issue) => (
        <View key={issue.id} className="flex-row items-center gap-2">
          <Text
            accessibilityRole="alert"
            className="flex-1 text-body-small text-danger-text dark:text-danger-text-dark"
          >
            {issue.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss sync message"
            onPress={() => dismissIssue(issue.id)}
            className="min-h-11 justify-center px-2"
          >
            <Text className="text-label-medium font-semibold text-accent-text dark:text-accent-text-dark">
              Dismiss
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
};
