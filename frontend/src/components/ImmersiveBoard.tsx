import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Emoji } from '../design-system/components';
import {
  LIST_COLORS,
  type ListColor,
  type ListIcon,
  palette,
} from '../design-system/tokens/colors';
import { useTheme } from '../providers/ThemeProvider';
import { listIconEmoji } from '../services/emojiCatalog';
import { LandscapeBackdrop } from './LandscapeBackdrop';
export const SWATCH_CLASS: Record<ListColor, string> = {
  blue: 'bg-list-blue-solid dark:bg-list-blue-solid-dark',
  teal: 'bg-list-teal-solid dark:bg-list-teal-solid-dark',
  amber: 'bg-list-amber-solid dark:bg-list-amber-solid-dark',
  pink: 'bg-list-pink-solid dark:bg-list-pink-solid-dark',
  violet: 'bg-list-violet-solid dark:bg-list-violet-solid-dark',
  coral: 'bg-list-coral-solid dark:bg-list-coral-solid-dark',
};

export const CHIP_CLASS: Record<ListColor, string> = {
  blue: 'bg-list-blue-tint dark:bg-list-blue-tint-dark',
  teal: 'bg-list-teal-tint dark:bg-list-teal-tint-dark',
  amber: 'bg-list-amber-tint dark:bg-list-amber-tint-dark',
  pink: 'bg-list-pink-tint dark:bg-list-pink-tint-dark',
  violet: 'bg-list-violet-tint dark:bg-list-violet-tint-dark',
  coral: 'bg-list-coral-tint dark:bg-list-coral-tint-dark',
};

export function ImmersiveScreenShell({ children }: { children: ReactNode }) {
  const { workspaceAppearance } = useTheme();
  return (
    <View className="flex-1 min-h-0 bg-canvas dark:bg-canvas-dark">
      {workspaceAppearance.background === 'landscape' ? (
        <LandscapeBackdrop variant="workspace" className="absolute inset-0" />
      ) : null}
      {children}
    </View>
  );
}

export function ListAccentBar({ color }: { color: ListColor | null }) {
  const { scheme, workspaceAppearance } = useTheme();
  const hue = color ?? workspaceAppearance.accent;
  return (
    <View
      accessible={false}
      style={{
        width: 4,
        alignSelf: 'stretch',
        borderRadius: 2,
        backgroundColor: palette.list[hue][scheme].solid,
      }}
    />
  );
}

export function ListIdentityBadge({
  color,
  icon,
  size = 'md',
}: {
  color: ListColor | null;
  icon?: ListIcon | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const boxClass =
    size === 'sm'
      ? 'w-7 h-7 rounded-lg'
      : size === 'lg'
        ? 'w-12 h-12 rounded-2xl'
        : 'w-9 h-9 rounded-xl';
  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 28 : 20;

  return (
    <View className="flex-row items-center gap-2 shrink-0">
      <ListAccentBar color={color} />
      <View
        className={[
          boxClass,
          'items-center justify-center overflow-hidden border border-line dark:border-line-dark',
          color ? CHIP_CLASS[color] : 'bg-accent-tint dark:bg-accent-tint-dark',
        ].join(' ')}
      >
        <Emoji symbol={listIconEmoji(icon)} size={iconSize} />
      </View>
    </View>
  );
}

export function ListColorPicker({
  value,
  onChange,
  disabled = false,
  allowNone = true,
}: {
  value: ListColor | null;
  onChange: (next: ListColor | null) => void;
  disabled?: boolean;
  allowNone?: boolean;
}) {
  const { scheme } = useTheme();
  return (
    <View className="flex-row flex-wrap gap-3">
      {LIST_COLORS.map((hue) => {
        const selected = value === hue;
        return (
          <Pressable
            key={hue}
            accessibilityRole="button"
            accessibilityLabel={`Color ${hue}`}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(selected && allowNone ? null : hue)}
            className={[
              'w-11 h-11 rounded-full items-center justify-center',
              SWATCH_CLASS[hue],
            ].join(' ')}
          >
            {selected ? (
              <Ionicons
                name="checkmark"
                size={20}
                color={palette.list[hue][scheme]['on-solid']}
                accessible={false}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
