import type { Item } from '../services/itemsService';
import type { RankingAnswer, RankingSession } from '../services/rankingEngine';

export interface ItemFormDraft {
  name: string;
  description: string;
}

export interface ItemWorkspaceState {
  mode: 'closed' | 'add' | 'edit' | 'ranking';
  item: Item | null;
  form: ItemFormDraft;
  fieldErrors: { name?: string };
  ranking: RankingSession | null;
  isBusy: boolean;
  error: string | null;
}

export interface UseItemWorkspaceOptions {
  userId: string | null;
  listId: string;
  listTitle: string;
  items: Item[];
  onItemsChanged: (item?: Item) => Promise<void>;
  onClosed: () => void;
}

export interface RankingView {
  item: Item;
  target: Item | null;
  isDecided: boolean;
  answered: number;
  limit: number;
  canUndo: boolean;
  preview: {
    score: number;
    rank: number;
    rankedCount: number;
  } | null;
}

export interface ItemWorkspace extends ItemWorkspaceState {
  view: RankingView | null;
  openAdd: () => void;
  openEdit: (item: Item) => void;
  resumeRanking: (session: RankingSession) => void;
  setForm: (patch: Partial<ItemFormDraft>) => void;
  submitMetadata: () => Promise<void>;
  startRanking: (item: Item) => Promise<void>;
  answer: (answer: RankingAnswer) => Promise<void>;
  undo: () => Promise<void>;
  cancelRanking: () => Promise<void>;
  deleteItem: (item: Item) => Promise<void>;
  requestClose: () => Promise<boolean>;
  pauseRanking: () => Promise<boolean>;
}
