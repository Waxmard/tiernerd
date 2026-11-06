export type RankingAnswer = 'better' | 'worse';

export interface RankingSession {
  itemId: string;
  listId: string;
  peersWorstFirst: string[];
  answers: RankingAnswer[];
}

export interface RankingPreview {
  score: number;
  rank: number;
  rankedCount: number;
}

export function createRankingSession(
  itemId: string,
  listId: string,
  rankedBestFirst: string[]
): RankingSession {
  return {
    itemId,
    listId,
    peersWorstFirst: [...rankedBestFirst].reverse(),
    answers: [],
  };
}

export function bounds(session: RankingSession): {
  low: number;
  high: number;
} {
  let low = 0;
  let high = session.peersWorstFirst.length;
  for (const answer of session.answers) {
    const index = Math.floor((low + high) / 2);
    if (answer === 'better') low = index + 1;
    else high = index;
  }
  return { low, high };
}

export function targetPeerId(session: RankingSession): string | null {
  const { low, high } = bounds(session);
  if (low === high) return null;
  return session.peersWorstFirst[Math.floor((low + high) / 2)] ?? null;
}

export function comparisonLimit(peerCount: number): number {
  return peerCount === 0 ? 0 : peerCount.toString(2).length;
}

export function applyAnswer(
  session: RankingSession,
  answer: RankingAnswer
): RankingSession {
  if (isDecided(session)) return session;
  return { ...session, answers: [...session.answers, answer] };
}

export function undoAnswer(session: RankingSession): RankingSession {
  if (session.answers.length === 0) return session;
  return { ...session, answers: session.answers.slice(0, -1) };
}

export function isDecided(session: RankingSession): boolean {
  const { low, high } = bounds(session);
  return low === high;
}

export function gap(session: RankingSession): number {
  return bounds(session).low;
}

export function insertIndexBestFirst(session: RankingSession): number {
  return session.peersWorstFirst.length - gap(session);
}

function halfEven1(value: number): number {
  const scaled = value * 10;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const rounded =
    diff > 0.5
      ? floor + 1
      : diff < 0.5
        ? floor
        : floor % 2 === 0
          ? floor
          : floor + 1;
  return rounded / 10;
}

export function scoreForRank(rank: number, rankedCount: number): number {
  if (rankedCount === 1) return 10;
  return halfEven1((10 * (rankedCount - rank)) / (rankedCount - 1));
}

export function preview(session: RankingSession): RankingPreview {
  const rankedCount = session.peersWorstFirst.length + 1;
  const rank = rankedCount - gap(session);
  return { score: scoreForRank(rank, rankedCount), rank, rankedCount };
}

export function isDraftCurrent(
  session: RankingSession,
  itemId: string,
  listId: string,
  rankedBestFirst: string[]
): boolean {
  if (
    session.itemId !== itemId ||
    session.listId !== listId ||
    session.peersWorstFirst.length !== rankedBestFirst.length
  ) {
    return false;
  }
  return session.peersWorstFirst.every(
    (peerId, index) =>
      peerId === rankedBestFirst[rankedBestFirst.length - 1 - index]
  );
}
