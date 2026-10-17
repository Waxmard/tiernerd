import type {
  ComparisonSession,
  Item,
  TierSet,
} from '../services/itemsService';

export interface ItemFormDraft {
  name: string;
  description: string;
  tierSet: TierSet | null;
}
export type ItemWorkspaceMode = 'closed' | 'add' | 'edit' | 'range' | 'ranking';
export interface ItemWorkspaceState {
  mode: ItemWorkspaceMode;
  item: Item | null;
  form: ItemFormDraft;
  fieldErrors: { name?: string; range?: string };
  session: ComparisonSession | null;
  isBusy: boolean;
  error: string | null;
}
export interface UseItemWorkspaceOptions {
  listTitle: string;
  token: string | null;
  onItemsChanged: (item?: Item) => Promise<void>;
  onClosed: () => void;
}
export interface ItemWorkspace extends ItemWorkspaceState {
  recoveryRequired: boolean;
  openAdd: () => void;
  openEdit: (item: Item) => void;
  openRange: (item: Item) => void;
  resume: (session: ComparisonSession) => void;
  setForm: (patch: Partial<ItemFormDraft>) => void;
  submitMetadata: () => Promise<void>;
  startRanking: () => Promise<void>;
  answer: (result: 'better' | 'worse') => Promise<void>;
  undo: () => Promise<void>;
  retryCommit: () => Promise<void>;
  restart: () => Promise<void>;
  deleteItem: (item: Item) => Promise<void>;
  retryRefresh: () => Promise<void>;
  requestClose: () => Promise<boolean>;
  pauseRanking: () => boolean;
  reloadSession: () => Promise<void>;
  closeMissingItem: (itemId: string) => boolean;
}
export interface PendingRefresh {
  item?: Item;
  closeAfter: boolean;
  closeOnRefreshFailure?: boolean;
}
