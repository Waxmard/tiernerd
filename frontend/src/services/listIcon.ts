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
