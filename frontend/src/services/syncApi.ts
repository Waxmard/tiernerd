import { itemsService } from './itemsService.ts';
import { listsService } from './listsService.ts';
import type { SyncOp } from './syncQueue.ts';

export async function applyOpToApi(op: SyncOp, token: string): Promise<void> {
  switch (op.kind) {
    case 'list.create':
      await listsService.createList(op.list, token);
      return;
    case 'list.update':
      await listsService.updateListMetadata(op.listId, op.metadata, token);
      return;
    case 'list.delete':
      await listsService.deleteList(op.listId, token);
      return;
    case 'item.create':
      await itemsService.createItem(
        op.listId,
        {
          item_id: op.itemId,
          name: op.name,
          description: op.description ?? undefined,
        },
        token
      );
      return;
    case 'item.update':
      await itemsService.updateItem(
        op.itemId,
        { name: op.name, description: op.description },
        token
      );
      return;
    case 'item.delete':
      await itemsService.deleteItem(op.itemId, token);
      return;
    case 'ranking.set':
      await listsService.setRanking(op.listId, op.itemId, op.gap, token);
  }
}
