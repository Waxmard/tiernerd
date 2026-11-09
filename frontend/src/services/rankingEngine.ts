export type RankingAnswer = 'better' | 'worse';

export interface RankingSession {
  itemId: string;
  listId: string;
  peersWorstFirst: string[];
  answers: RankingAnswer[];
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

export function landingRange(session: RankingSession): {
  best: number;
  worst: number;
  total: number;
} {
  const { low, high } = bounds(session);
  const total = session.peersWorstFirst.length + 1;
  return { best: total - high, worst: total - low, total };
}

const CURVE_ALPHA = 0.7;
const CURVE_BETA = 0.54;
const AUTO_MIN_SCORE = 0.1;
const AUTO_MAX_SCORE = 9.9;

export interface PinnedNeighbor {
  name: string;
  rating: number;
}

export interface ManualRatingBounds {
  upper: PinnedNeighbor | null;
  lower: PinnedNeighbor | null;
}

export function halfEven1(value: number): number {
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

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

export function rankMedal(rank: number | null): string | null {
  return rank === null ? null : (RANK_MEDALS[rank - 1] ?? null);
}

export function formatScore(value: number): string {
  const fixed = value.toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}

export function splitScoreParts(value: number): {
  whole: string;
  decimal: string | null;
} {
  const formatted = formatScore(value);
  const dotIndex = formatted.indexOf('.');
  if (dotIndex === -1) {
    return { whole: formatted, decimal: null };
  }
  return {
    whole: formatted.slice(0, dotIndex),
    decimal: formatted.slice(dotIndex),
  };
}

function scoreFromU(u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 10;
  const uPow = u ** CURVE_ALPHA;
  return (10 * uPow) / (uPow + CURVE_BETA * (1 - u) ** CURVE_ALPHA);
}

function uFromScore(score: number): number {
  if (score <= 0) return 0;
  if (score >= 10) return 1;
  return 1 / (1 + ((10 - score) / (CURVE_BETA * score)) ** (1 / CURVE_ALPHA));
}

export function computeScores(
  manualRatingsBestFirst: readonly (number | null)[]
): number[] {
  const n = manualRatingsBestFirst.length;
  if (n === 0) return [];
  const anchors: Array<[number, number, number]> = [[0, 10, 1]];
  for (let index = 0; index < n; index += 1) {
    const manual = manualRatingsBestFirst[index];
    if (manual !== null && manual !== undefined) {
      const s = halfEven1(manual);
      anchors.push([index + 1, s, uFromScore(s)]);
    }
  }
  anchors.push([n + 1, 0, 0]);

  const scores = new Array<number>(n).fill(0);
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const hi = anchors[i];
    const lo = anchors[i + 1];
    if (!hi || !lo) continue;
    const [rHi, sHi, uHi] = hi;
    const [rLo, sLo, uLo] = lo;
    const span = rLo - rHi;
    const hiCap = rHi === 0 && sLo <= AUTO_MAX_SCORE ? AUTO_MAX_SCORE : sHi;
    const loCap = rLo === n + 1 && sHi >= AUTO_MIN_SCORE ? AUTO_MIN_SCORE : sLo;
    for (let rk = rHi + 1; rk < rLo; rk += 1) {
      const u = uLo + ((uHi - uLo) * (rLo - rk)) / span;
      scores[rk - 1] = Math.min(
        Math.max(halfEven1(scoreFromU(u)), loCap),
        hiCap
      );
    }
    if (rLo >= 1 && rLo <= n) {
      scores[rLo - 1] = sLo;
    }
  }
  return scores;
}

export function scoreForRank(rank: number, rankedCount: number): number {
  return computeScores(new Array<null>(rankedCount).fill(null))[rank - 1] ?? 0;
}

export function manualRatingBounds(
  bestFirstItems: readonly {
    item_id: string;
    name: string;
    manual_rating: number | null;
  }[],
  targetItemId: string
): ManualRatingBounds {
  const targetIndex = bestFirstItems.findIndex(
    (item) => item.item_id === targetItemId
  );
  if (targetIndex === -1) {
    return { upper: null, lower: null };
  }
  let upper: PinnedNeighbor | null = null;
  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const candidate = bestFirstItems[index];
    if (
      candidate &&
      candidate.manual_rating !== null &&
      candidate.manual_rating !== undefined
    ) {
      upper = {
        name: candidate.name,
        rating: halfEven1(candidate.manual_rating),
      };
      break;
    }
  }
  let lower: PinnedNeighbor | null = null;
  for (let index = targetIndex + 1; index < bestFirstItems.length; index += 1) {
    const candidate = bestFirstItems[index];
    if (
      candidate &&
      candidate.manual_rating !== null &&
      candidate.manual_rating !== undefined
    ) {
      lower = {
        name: candidate.name,
        rating: halfEven1(candidate.manual_rating),
      };
      break;
    }
  }
  return { upper, lower };
}

export function manualRatingBoundsError(
  bestFirstItems: readonly {
    item_id: string;
    name: string;
    manual_rating: number | null;
  }[],
  targetItemId: string,
  value: number
): string | null {
  const { upper, lower } = manualRatingBounds(bestFirstItems, targetItemId);
  const rounded = halfEven1(value);
  const violatesUpper = upper !== null && rounded > upper.rating;
  const violatesLower = lower !== null && rounded < lower.rating;
  if (!violatesUpper && !violatesLower) {
    return null;
  }
  if (upper !== null && lower !== null) {
    return `Score must be between ${formatScore(lower.rating)} (${lower.name}) and ${formatScore(upper.rating)} (${upper.name}), or re-rank this item.`;
  }
  if (upper !== null) {
    return `Score must be ${formatScore(upper.rating)} or lower (${upper.name} has a manual score above it), or re-rank this item.`;
  }
  if (lower !== null) {
    return `Score must be ${formatScore(lower.rating)} or higher (${lower.name} has a manual score below it), or re-rank this item.`;
  }
  return null;
}

export function parseManualRatingInput(
  raw: string
): { value: number | null } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { value: null };
  }
  if (/^(?:\d+\.\d{2,}|\.\d{2,})$/.test(trimmed)) {
    return { error: 'Use at most one decimal place (for example, 7.5).' };
  }
  if (!/^(?:\d+(?:\.\d?)?|\.\d)$/.test(trimmed)) {
    return { error: 'Score must be between 0.0 and 10.0.' };
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0 || num > 10) {
    return { error: 'Score must be between 0.0 and 10.0.' };
  }
  return { value: halfEven1(num) };
}

export function autoScoreWithoutPin(
  bestFirstItems: readonly {
    item_id: string;
    manual_rating: number | null;
  }[],
  itemId: string
): number | null {
  const targetIndex = bestFirstItems.findIndex(
    (item) => item.item_id === itemId
  );
  if (targetIndex === -1) {
    return null;
  }
  const manualRatings = bestFirstItems.map((item, index) =>
    index === targetIndex ? null : item.manual_rating
  );
  return computeScores(manualRatings)[targetIndex] ?? null;
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
