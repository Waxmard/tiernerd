const LEGACY_ICON_EMOJI = new Map([
  ['layers', '🗂️'],
  ['coffee', '☕'],
  ['film', '🎬'],
  ['mountain', '🏔️'],
  ['star', '⭐'],
  ['heart', '❤️'],
  ['books', '📚'],
]);

export function listIconEmoji(icon: string | null | undefined): string | null {
  if (!icon) return null;
  return LEGACY_ICON_EMOJI.get(icon) ?? icon;
}
