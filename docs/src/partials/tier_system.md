## Scores out of 10

Choose a starting category: **Good**, **Mid**, or **Bad**. Colored icons and badges identify categories; saved scores and ranks remain separate.

When adding another item in the same range, choose the better item in each comparison. **Undo last answer** reverses the latest choice and is available only before the final answer. Ranking saves automatically after the final comparison; the first item in an empty range saves immediately. The refreshed list confirms the saved score and order, with no extra success banner or sheet. If saving fails, choose **Retry saving**. If the item refresh fails after saving, choose **Retry refresh**.

Select a row to view its description, image, score and overall rank. **Edit** changes its metadata; **Re-rank** lets you choose a destination range without changing the saved rank until comparisons complete and save automatically. An empty destination range saves immediately. **Delete Item** is separate from editing and requires confirmation.

Interrupted ranking drafts persist. Select the item and choose **Resume ranking**, or **Restart ranking** if ranked peers changed. A ready draft saves automatically when resumed. Cancelling a new-item draft discards that item. Cancelling a re-ranking draft preserves the saved item and rank. Unranked items without a draft offer **Rank now**.

Item names are unique within a list across ranges, ignoring surrounding whitespace and Unicode case. Different lists can use the same name.

Deleting an item or list also discards its related active and completed comparison sessions. Sessions unrelated to the deleted item or list remain unchanged.

Each category uses a score band: Good (`good`) spans 7.0–10.0, Mid (`mid`) spans 4.0–6.9, and Bad (`bad`) spans 1.0–3.9. Within a band, comparisons order items from lowest to highest. Item `i` of `n` ranked items receives `round(low + (high - low) * (i + 0.5) / n, 1)`, where `i` starts at zero. A single Good item scores 8.5; two Good items score 7.8 and 9.2. Scores are relative to the ranked items in each band, not user-entered ratings.

The API stores scores in `rating`. An item without a position has a null score and is shown as **Not ranked yet**. Adding, removing or re-ranking items can change scores. Lists display ranked items best first by range and position, with unranked items last. Rounded scores can overlap at range boundaries.

Persistent PostgreSQL databases require the explicit UI-ranking schema migration before you run the updated application. See the backend migration instructions. Fresh test SQLite databases use current model metadata.
