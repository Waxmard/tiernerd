import type React from 'react';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BaseModalContent, Button, Input } from '../design-system/components';
import {
  AppBorders,
  AppColors,
  AppSpacing,
  AppTypography,
} from '../design-system/tokens';
import { useAuth } from '../providers/AuthContext';
import { ApiError } from '../services/api';
import {
  type ComparisonSession,
  type Item,
  isComparisonSession,
  itemsService,
  type TierSet,
} from '../services/itemsService';
import { confirmDestructive } from '../utils/confirm';

interface AddItemContentProps {
  onClose: () => void;
  onSuccess: (item?: Item) => void;
  listTitle: string;
  editingItem?: Item;
}

interface AddItemModalProps extends AddItemContentProps {
  visible: boolean;
}

interface TierOption {
  label: string;
  value: TierSet;
}

const TIER_OPTIONS: TierOption[] = [
  { label: 'Great (7.0–10.0)', value: 'good' },
  { label: 'Okay (4.0–6.9)', value: 'mid' },
  { label: 'Bad (1.0–3.9)', value: 'bad' },
];

const MAX_NAME_LENGTH = 100;

// Content component without Modal wrapper (for use in parent-controlled Modal)
export const AddItemContent: React.FC<AddItemContentProps> = ({
  onClose,
  onSuccess,
  listTitle,
  editingItem,
}) => {
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [tierSet, setTierSet] = useState<TierSet | null>(null);
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparisonSession, setComparisonSession] =
    useState<ComparisonSession | null>(null);

  const isEditMode = !!editingItem;

  // Pre-fill form when editing
  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);
      setDescription(editingItem.description ?? '');
    }
  }, [editingItem]);

  const resetForm = () => {
    setName('');
    setTierSet(null);
    setDescription('');
    setError(null);
    setComparisonSession(null);
  };

  const handleClose = () => {
    if (isLoading) return;
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError('Name is required');
      return;
    }

    if (trimmedName.length > MAX_NAME_LENGTH) {
      setError(`Name must be ${MAX_NAME_LENGTH} characters or less`);
      return;
    }

    if (!isEditMode && !tierSet) {
      setError('Please pick a range');
      return;
    }

    if (!token) {
      setError('Authentication required');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      if (isEditMode && editingItem) {
        const updated = await itemsService.updateItem(
          editingItem.item_id,
          {
            name: trimmedName,
            description: description.trim() || undefined,
          },
          token
        );
        resetForm();
        onSuccess(updated);
      } else {
        if (!tierSet) {
          setError('Please pick a range');
          return;
        }
        const response = await itemsService.createItem(
          listTitle,
          {
            name: trimmedName,
            tier_set: tierSet,
            description: description.trim() || undefined,
          },
          token
        );

        if (isComparisonSession(response)) {
          setComparisonSession(response);
        } else {
          resetForm();
          onSuccess(response);
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError('An item with this name already exists in this list');
        } else if (err.data?.detail) {
          if (Array.isArray(err.data.detail)) {
            const messages = err.data.detail
              .map((e) => e.msg ?? '')
              .filter(Boolean)
              .join(', ');
            setError(messages || 'Validation error');
          } else if (typeof err.data.detail === 'string') {
            setError(err.data.detail);
          } else {
            setError(
              isEditMode
                ? 'Failed to update item. Please try again.'
                : 'Failed to add item. Please try again.'
            );
          }
        } else {
          setError(
            isEditMode
              ? 'Failed to update item. Please try again.'
              : 'Failed to add item. Please try again.'
          );
        }
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleComparisonResult = async (result: 'better' | 'worse') => {
    if (!token || !comparisonSession || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const next = await itemsService.submitComparison(
        comparisonSession.session_id,
        result,
        token
      );
      if (next === null || next.is_complete) {
        resetForm();
        onSuccess();
      } else {
        setComparisonSession(next);
      }
    } catch (err) {
      setError(
        err instanceof ApiError && typeof err.data?.detail === 'string'
          ? err.data.detail
          : 'Unable to save your choice. Try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !editingItem || isLoading) return;
    const confirmed = await confirmDestructive(
      'Delete Item',
      `Delete "${editingItem.name}"? This cannot be undone.`,
      'Delete Item'
    );
    if (!confirmed) return;
    setIsLoading(true);
    setError(null);
    try {
      await itemsService.deleteItem(editingItem.item_id, token);
      resetForm();
      onSuccess();
    } catch (err) {
      setError(
        err instanceof ApiError && typeof err.data?.detail === 'string'
          ? err.data.detail
          : 'Unable to delete this item. Try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const comparison = comparisonSession?.current_comparison;
  if (comparison) {
    return (
      <BaseModalContent
        title="Which is better?"
        error={error}
        isLoading={isLoading}
        onClose={handleClose}
      >
        <View style={styles.tierOptions}>
          <Button
            title={`Choose ${comparison.reference_item.name}`}
            onPress={() => handleComparisonResult('better')}
            disabled={isLoading}
            fullWidth
          />
          <Button
            title={`Choose ${comparison.target_item.name}`}
            onPress={() => handleComparisonResult('worse')}
            disabled={isLoading}
            fullWidth
          />
        </View>
      </BaseModalContent>
    );
  }

  return (
    <BaseModalContent
      title={isEditMode ? 'Edit Item' : 'Add Item'}
      error={error}
      isLoading={isLoading}
      submitText={isEditMode ? 'Save' : 'Add'}
      submitDisabled={!name.trim() || (!isEditMode && !tierSet)}
      onClose={handleClose}
      onSubmit={handleSubmit}
    >
      <Input
        label="Name"
        placeholder="Enter item name"
        value={name}
        onChangeText={(text) => {
          setName(text);
          if (error) setError(null);
        }}
        maxLength={MAX_NAME_LENGTH}
        autoFocus
      />

      {!isEditMode && (
        <View style={styles.tierSection}>
          <Text style={styles.tierLabel}>Starting range</Text>
          <View style={styles.tierOptions}>
            {TIER_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: tierSet === option.value }}
                style={[
                  styles.tierOption,
                  tierSet === option.value && styles.tierOptionSelected,
                ]}
                onPress={() => {
                  setTierSet(option.value);
                  if (error) setError(null);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tierOptionText,
                    tierSet === option.value && styles.tierOptionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <Input
        label="Description (optional)"
        placeholder="Add a description"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
        inputStyle={styles.descriptionInput}
      />
      {isEditMode && (
        <Button
          title="Delete Item"
          variant="text"
          onPress={handleDelete}
          disabled={isLoading}
          textStyle={{ color: AppColors.error }}
        />
      )}
    </BaseModalContent>
  );
};

// Full modal component (wraps content in Modal for backward compatibility)
export const AddItemModal: React.FC<AddItemModalProps> = ({
  visible,
  onClose,
  onSuccess,
  listTitle,
  editingItem,
}) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onClose}
  >
    {visible && (
      <AddItemContent
        onClose={onClose}
        onSuccess={onSuccess}
        listTitle={listTitle}
        editingItem={editingItem}
      />
    )}
  </Modal>
);

const styles = StyleSheet.create({
  tierSection: {
    marginBottom: AppSpacing.md,
  },
  tierLabel: {
    ...AppTypography.bodySmall,
    color: AppColors.secondary.emphasis,
    fontWeight: '500',
    marginBottom: AppSpacing.sm,
  },
  tierOptions: {
    gap: AppSpacing.sm,
  },
  tierOption: {
    paddingVertical: AppSpacing.sm,
    paddingHorizontal: AppSpacing.md,
    borderRadius: AppBorders.radiusSm,
    borderWidth: 1,
    borderColor: AppColors.neutral[300],
    backgroundColor: AppColors.surface,
  },
  tierOptionSelected: {
    borderColor: AppColors.accent.primary,
    backgroundColor: AppColors.accent.light,
  },
  tierOptionText: {
    ...AppTypography.bodyMedium,
    color: AppColors.textSecondary,
    textAlign: 'center',
  },
  tierOptionTextSelected: {
    color: AppColors.secondary.emphasis,
    fontWeight: '600',
  },
  descriptionInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
