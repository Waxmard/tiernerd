import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  LIST_COLORS,
  LIST_ICONS,
  type ListColor,
  type ListCover,
  type ListIcon,
  palette,
} from '../design-system/tokens/colors';
import { useTheme } from '../providers/ThemeProvider';

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

export const LIST_ICON_GLYPHS: Record<
  ListIcon,
  keyof typeof Ionicons.glyphMap
> = {
  layers: 'layers-outline',
  coffee: 'cafe-outline',
  film: 'film-outline',
  mountain: 'trail-sign-outline',
  star: 'star-outline',
  heart: 'heart-outline',
  books: 'book-outline',
};

export const LIST_ICON_LABELS: Record<ListIcon, string> = {
  layers: 'Layers',
  coffee: 'Coffee',
  film: 'Film',
  mountain: 'Outdoors',
  star: 'Star',
  heart: 'Favorites',
  books: 'Books',
};

export function LandscapeBackdrop({
  variant = 'workspace',
  className = '',
}: {
  variant?: 'workspace' | ListColor | null;
  className?: string;
}) {
  const { scheme, workspaceAppearance } = useTheme();
  const isDark = scheme === 'dark';
  const hue: ListColor =
    variant && variant !== 'workspace' ? variant : workspaceAppearance.accent;
  const sunColor =
    variant && variant !== 'workspace'
      ? palette.list[hue][scheme].solid
      : '#F2B89B';
  const skyColor = isDark ? '#183542' : '#CFE4EE';
  const farRidge = isDark ? '#5A7688' : '#8BA9BC';
  const midRidge = isDark ? '#375966' : '#5E8294';
  const nearRidge = isDark ? '#1B3742' : '#385C6C';

  return (
    <View
      accessible={false}
      pointerEvents="none"
      style={{ backgroundColor: skyColor }}
      className={['overflow-hidden', className].filter(Boolean).join(' ')}
    >
      <View
        style={{
          position: 'absolute',
          width: 88,
          height: 88,
          borderRadius: 44,
          right: '16%',
          top: '14%',
          backgroundColor: sunColor,
          opacity: isDark ? 0.85 : 0.9,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: '-12%',
          right: '18%',
          bottom: '-28%',
          height: '78%',
          borderTopLeftRadius: 180,
          borderTopRightRadius: 220,
          backgroundColor: farRidge,
          opacity: 0.72,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: '18%',
          right: '-16%',
          bottom: '-32%',
          height: '72%',
          borderTopLeftRadius: 220,
          borderTopRightRadius: 160,
          backgroundColor: midRidge,
          opacity: 0.88,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: '-8%',
          right: '-8%',
          bottom: '-38%',
          height: '62%',
          borderTopLeftRadius: 240,
          borderTopRightRadius: 240,
          backgroundColor: nearRidge,
        }}
      />
    </View>
  );
}

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
  cover = null,
  size = 'md',
}: {
  color: ListColor | null;
  icon?: ListIcon | null;
  cover?: ListCover | null;
  size?: 'sm' | 'md';
}) {
  const { scheme, colors } = useTheme();
  const resolvedIcon: ListIcon = icon ?? 'layers';
  const glyph = LIST_ICON_GLYPHS[resolvedIcon];
  const chipIconColor = color
    ? palette.list[color][scheme]['on-tint']
    : colors['accent-text'];
  const boxClass = size === 'sm' ? 'w-7 h-7 rounded-lg' : 'w-9 h-9 rounded-xl';
  const iconSize = size === 'sm' ? 16 : 20;

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
        {cover === 'landscape' ? (
          <LandscapeBackdrop
            variant={color}
            className="absolute inset-0 opacity-35"
          />
        ) : null}
        <Ionicons
          name={glyph}
          size={iconSize}
          color={chipIconColor}
          accessible={false}
        />
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

export function ListIconPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: ListIcon | null;
  onChange: (next: ListIcon | null) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-row flex-wrap gap-2">
      {LIST_ICONS.map((iconKey) => {
        const selected = value === iconKey;
        return (
          <Pressable
            key={iconKey}
            accessibilityRole="button"
            accessibilityLabel={`Icon ${LIST_ICON_LABELS[iconKey]}`}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(selected ? null : iconKey)}
            className={[
              'min-h-11 flex-row items-center gap-2 rounded-[10px] border px-3 py-2',
              selected
                ? 'border-accent dark:border-accent-dark bg-accent-tint dark:bg-accent-tint-dark'
                : 'border-control dark:border-control-dark bg-surface dark:bg-surface-dark',
            ].join(' ')}
          >
            <Ionicons
              name={LIST_ICON_GLYPHS[iconKey]}
              size={18}
              color={
                colors[
                  disabled
                    ? 'ink-disabled'
                    : selected
                      ? 'accent-text'
                      : 'ink-muted'
                ]
              }
              accessible={false}
            />
            <Text className="text-body-small font-semibold text-ink dark:text-ink-dark">
              {LIST_ICON_LABELS[iconKey]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ListCoverPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: ListCover | null;
  onChange: (next: ListCover | null) => void;
  disabled?: boolean;
}) {
  const options: { label: string; value: ListCover | null }[] = [
    { label: 'None', value: null },
    { label: 'Built-in landscape', value: 'landscape' },
  ];
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.label}
            accessibilityRole="button"
            accessibilityLabel={`Cover ${option.label}`}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            className={[
              'flex-1 min-h-11 flex-row items-center justify-center gap-2 rounded-[10px] border px-3 py-2',
              selected
                ? 'border-accent dark:border-accent-dark bg-accent-tint dark:bg-accent-tint-dark'
                : 'border-control dark:border-control-dark bg-surface dark:bg-surface-dark',
            ].join(' ')}
          >
            <Text
              className={[
                'text-body-small font-semibold',
                selected
                  ? 'text-accent-text dark:text-accent-text-dark'
                  : 'text-ink-muted dark:text-ink-muted-dark',
              ].join(' ')}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
