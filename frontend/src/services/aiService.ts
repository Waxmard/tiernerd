import { api } from './api';

export interface EmojiSuggestionTarget {
  name: string;
  kind: 'list' | 'item';
  description?: string | null;
  listTitle?: string | null;
}

export const aiService = {
  suggestEmojis: (
    target: EmojiSuggestionTarget,
    token: string
  ): Promise<string[]> =>
    api
      .post<{ emojis: string[] }>(
        '/api/ai/emoji',
        {
          name: target.name.trim(),
          kind: target.kind,
          description: [...(target.description ?? '').trim()]
            .slice(0, 500)
            .join(''),
          list_title: (target.listTitle ?? '').trim(),
        },
        token
      )
      .then((response) => response.emojis),
};
