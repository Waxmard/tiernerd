import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
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
        />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
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
        />
      </TouchableOpacity>
    </View>
    {description?.trim() ? (
      <ScrollView
        style={styles.descriptionScroll}
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
        <Text style={styles.listDescription}>{description}</Text>
      </ScrollView>
    ) : null}
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
    <Text style={styles.scoreExplanation}>
      Scores reflect position within each range. Adding, removing or re-ranking
      items can change scores.
    </Text>
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
