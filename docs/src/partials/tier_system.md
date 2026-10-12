## Scores out of 10

Each starting range defines a score band:

- **Great** (`good`): 7.0–10.0
- **Okay** (`mid`): 4.0–7.0
- **Bad** (`bad`): 1.0–4.0

When adding another item in the same range, choose the better item in each comparison until ranking finishes. The list then reloads its scores and order. Select an item to edit it or choose **Delete Item**; confirm deletion to remove it and recalculate the remaining scores.

Deleting an item or list also discards its related active and completed comparison sessions. Sessions unrelated to the deleted item or list remain unchanged.

Within a band, comparisons order items from lowest to highest. Item `i` of `n` ranked items receives `round(low + (high - low) * (i + 0.5) / n, 1)`, where `i` starts at zero. A single Great item scores 8.5; two Great items score 7.8 and 9.2. Scores are relative to the ranked items in each band, not user-entered ratings.

The API stores scores in `rating`. Items without a position remain unranked with a null score and are excluded from scoring. Adding a ranked item or deleting one recalculates the band's scores. Lists display ranked items best first.

Existing development items with null ratings remain hidden until their band is rescored. Removing the old `tier` model field does not require a database wipe: existing nullable columns are ignored.
