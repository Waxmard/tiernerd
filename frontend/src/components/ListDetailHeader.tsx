import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../design-system/components';
import { AppColors } from '../design-system/tokens';
import { styles } from './ListDetailScreen.styles';

export interface RankOutcome {
  itemId: string;
  name: string;
  rank: number;
  rankedCount: number;
  score: number;
}

interface ListDetailHeaderProps {
  title: string;
  itemCount: number;
  rankedCount: number;
  addDisabled: boolean;
  onAdd: () => void;
  description: string | null;
  metadataError: boolean;
  outcome: RankOutcome | null;
  deleteDisabled: boolean;
  onBack: () => void;
  onDelete: () => void;
  onRetryMetadata: () => void;
  onDismissOutcome: () => void;
}

export const ListDetailHeader: React.FC<ListDetailHeaderProps> = ({
  title,
  itemCount,
  rankedCount,
  addDisabled,
  onAdd,
  description,
  metadataError,
  outcome,
  deleteDisabled,
  onBack,
  onDelete,
  onRetryMetadata,
  onDismissOutcome,
}) => (
  <>
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={styles.backButton}
        activeOpacity={0.7}
      >
        <Ionicons
          name="chevron-back"
          size={28}
          color={AppColors.secondary.emphasis}
          accessible={false}
        />
      </TouchableOpacity>
      <View style={styles.headerContent}>
        <Text accessibilityRole="header" style={styles.headerTitle}>
          {title}
        </Text>
        {description?.trim() ? (
          <ScrollView
            style={styles.descriptionScroll}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            <Text style={styles.listDescription}>{description}</Text>
          </ScrollView>
        ) : null}
      </View>
      <TouchableOpacity
        onPress={onDelete}
        disabled={deleteDisabled}
        accessibilityRole="button"
        accessibilityLabel="Delete list"
        accessibilityState={{ disabled: deleteDisabled }}
        style={styles.deleteButton}
        activeOpacity={0.7}
        testID="delete-list"
      >
        <Ionicons
          name="trash-outline"
          size={24}
          color={deleteDisabled ? AppColors.disabledText : AppColors.error}
          accessible={false}
        />
      </TouchableOpacity>
    </View>
    {metadataError ? (
      <View style={styles.metadataError}>
        <Text style={styles.refreshError} accessibilityRole="alert">
          Unable to load list details.
        </Text>
        <TouchableOpacity
          onPress={onRetryMetadata}
          accessibilityRole="button"
          accessibilityLabel="Retry loading list details"
          style={styles.retryButton}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    ) : null}
    <View style={styles.headerToolbar}>
      <Text style={styles.rankedCount}>
        {rankedCount} of {itemCount} ranked
      </Text>
      <Button
        title="Add item"
        onPress={onAdd}
        disabled={addDisabled}
        size="small"
        testID="fab-add-item"
      />
    </View>
    {outcome ? (
      <View style={styles.outcome} accessibilityLiveRegion="polite">
        <View style={styles.outcomeText}>
          <Text style={styles.outcomeTitle}>
            “{outcome.name}” ranked #{outcome.rank} of {outcome.rankedCount}.
          </Text>
          <Text style={styles.outcomeScore}>
            Score {outcome.score.toFixed(1)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onDismissOutcome}
          accessibilityRole="button"
          accessibilityLabel="Dismiss ranking result"
          style={styles.dismissOutcome}
        >
          <Ionicons
            name="close"
            size={20}
            color={AppColors.secondary.emphasis}
            accessible={false}
          />
        </TouchableOpacity>
      </View>
    ) : null}
  </>
);
