import groups from 'unicode-emoji-json/data-by-group.json' with {
  type: 'json',
};

export interface EmojiEntry {
  emoji: string;
  name: string;
}

export interface EmojiGroup {
  slug: string;
  name: string;
  emojis: EmojiEntry[];
}

const MAX_EMOJI_VERSION = 15.0;

export const EMOJI_GROUPS: EmojiGroup[] = groups.map((group) => ({
  slug: group.slug,
  name: group.name,
  emojis: group.emojis
    .filter((entry) => Number(entry.emoji_version) <= MAX_EMOJI_VERSION)
    .map(({ emoji, name }) => ({ emoji, name: name.toLowerCase() })),
}));

export function searchEmoji(query: string): EmojiEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return EMOJI_GROUPS.flatMap((group) => group.emojis).filter((entry) =>
    terms.every((term) => entry.name.includes(term))
  );
}

const LEGACY_ICON_EMOJI = new Map([
  ['layers', '🗂️'],
  ['coffee', '☕'],
  ['film', '🎬'],
  ['mountain', '🏔️'],
  ['star', '⭐'],
  ['heart', '❤️'],
  ['books', '📚'],
]);

export function listIconEmoji(icon: string | null | undefined): string {
  if (!icon) return '🗂️';
  return LEGACY_ICON_EMOJI.get(icon) ?? icon;
}
