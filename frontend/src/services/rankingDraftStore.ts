import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RankingAnswer, RankingSession } from './rankingEngine.ts';

const draftKey = (userId: string): string => `rankingDraft:v1:${userId}`;

export function parseRankingSession(raw: string | null): RankingSession | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = parsed as RankingSession;
  if (
    typeof candidate.itemId !== 'string' ||
    typeof candidate.listId !== 'string' ||
    !Array.isArray(candidate.peersWorstFirst) ||
    !candidate.peersWorstFirst.every((id) => typeof id === 'string') ||
    !Array.isArray(candidate.answers)
  ) {
    return null;
  }
  const answers: RankingAnswer[] = [];
  for (const answer of candidate.answers) {
    if (answer !== 'better' && answer !== 'worse') return null;
    answers.push(answer);
  }
  return {
    itemId: candidate.itemId,
    listId: candidate.listId,
    peersWorstFirst: candidate.peersWorstFirst,
    answers,
  };
}

export async function loadDraft(
  userId: string
): Promise<RankingSession | null> {
  const raw = await AsyncStorage.getItem(draftKey(userId)).catch(() => null);
  return parseRankingSession(raw);
}

export async function saveDraft(
  userId: string,
  session: RankingSession
): Promise<void> {
  await AsyncStorage.setItem(draftKey(userId), JSON.stringify(session));
}

export async function clearDraft(userId: string): Promise<void> {
  await AsyncStorage.removeItem(draftKey(userId));
}
