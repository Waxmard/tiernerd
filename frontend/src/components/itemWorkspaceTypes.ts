import type { Item } from '../services/itemsService';
import type { ListRankingMode } from '../services/listsService';
import type {
  LandingRange,
  ManualRatingBounds,
  RankingAnswer,
  RankingSession,
} from '../services/rankingEngine';

export interface ItemFormDraft {
  name: string;
  description: string;
  manualRating: string;
  icon: string | null;
}

export type ItemFormField = 'name' | 'manualRating' | 'description';

export interface RankingResult {
  rank: number;
  total: number;
  score: number;
}

export interface ItemWorkspaceState {
  mode: 'closed' | 'add' | 'edit' | 'ranking' | 'ranked';
  item: Item | null;
  form: ItemFormDraft;
  fieldErrors: { name?: string; manualRating?: string };
  ranking: RankingSession | null;
  isBusy: boolean;
  focusField: ItemFormField;
  result: RankingResult | null;
}

export interface UseItemWorkspaceOptions {
  userId: string | null;
  listId: string;
  listTitle: string;
  rankingMode?: ListRankingMode;
  items: Item[];
  onItemsChanged: (item?: Item) => Promise<void>;
  onClosed: () => void;
}

export interface RankingView {
  item: Item;
  target: Item | null;
  targetRank: number | null;
  rankedCount: number;
  range: LandingRange;
  answered: number;
  limit: number;
  canUndo: boolean;
}

export interface ItemWorkspace extends ItemWorkspaceState {
  view: RankingView | null;
  scoreEdit: { autoScore: number | null; bounds: ManualRatingBounds } | null;
  openAdd: () => void;
  openEdit: (item: Item, focusField?: ItemFormField) => void;
  saveIcon: (item: Item, icon: string) => Promise<boolean>;
  resumeRanking: (session: RankingSession) => void;
  setForm: (patch: Partial<ItemFormDraft>) => void;
  submitMetadata: () => Promise<void>;
  startRanking: (item: Item) => Promise<void>;
  answer: (answer: RankingAnswer) => Promise<void>;
  undo: () => Promise<void>;
  cancelRanking: () => Promise<boolean>;
  deleteItem: (item: Item) => Promise<void>;
  requestClose: () => Promise<boolean>;
  pauseRanking: () => Promise<boolean>;
  dismissResult: () => void;
}
