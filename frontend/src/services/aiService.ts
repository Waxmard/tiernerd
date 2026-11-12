import { api } from './api';

export type EmojiSuggestionKind = 'list' | 'item';

export const aiService = {
  suggestEmoji: (
    name: string,
    kind: EmojiSuggestionKind,
    token: string
  ): Promise<string> =>
    api
      .post<{ emoji: string }>('/api/ai/emoji', { name, kind }, token)
      .then((response) => response.emoji),
};
