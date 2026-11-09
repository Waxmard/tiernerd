# TierNerd

TierNerd is a cross-platform mobile app for ranking items through 1v1 comparisons. Each list displays either numbered positions or scores out of 10.

```text
your items ──1v1 comparisons──▶ TierNerd ──▶ ranked list, with positions or scores
```

## Key Features

- Create custom lists on any topic
- Add items with descriptions and images
- Rank items through simple better/worse comparisons
- Eliminate arbitrary rating bias
- View ranked items best first with numbered positions or scores out of 10

## Screenshots

| Login | Home |
|:---:|:---:|
| ![Login](screenshots/login.png) | ![Home](screenshots/home-empty.png) |

## Technology

- **Frontend:** React Native with Expo (SDK 58)
- **Backend:** Python with FastAPI
- **Database:** PostgreSQL (async via asyncpg)
- **Auth:** Google sign-in and JWT sessions

## Getting Started

### Frontend

```bash
make ios                          # Build, install, and launch on a paired iPhone
# or
cd frontend && npm run ios        # iOS Simulator
```

### Backend

```bash
cd fastapi
make dev                          # Start with Docker (auto-seeds dev user)
```

See [frontend/README.md](frontend/README.md) and [fastapi/README.md](fastapi/README.md) for detailed setup instructions.

## Ranking lists

Choose **Ranked positions** or **Scores out of 10** when creating a list. Scores are the default. Change the choice later in **List options**; switching modes does not change the saved order or start new comparisons.

Add an item and choose the better item in each comparison. Comparisons use neutral surfaces without scores. **Undo last answer** reverses the latest choice and is available until the last comparison decides. The rank saves and the panel closes as soon as the comparisons finish; the first item in an empty list saves immediately.

Select a row to view its description, image and overall rank. Score lists also show the score. **Edit** changes its metadata; **Re-rank** starts comparisons without changing the saved rank until they finish. **Delete Item** is separate from editing and requires confirmation.

Interrupted ranking drafts persist on the device. Reopening the list resumes the saved draft at the same question, or choose **Resume ranking** on the item. Cancelling a ranking keeps the item unranked. Unranked items without a draft offer **Rank now**.

The app works without a connection. Lists, items and rankings are read from and written to the device first. Changes replay in order once the connection returns, and creates carry client-generated ids so a retry never duplicates a list or item. A change the server refuses as invalid stays on the device and keeps showing in its list; a notification names the field the server complained about, and the change syncs by itself once the server accepts it. A duplicate name resolves to the item already in the list, and an edit to something deleted on another device is discarded with a notification. Uploaded photo covers and photo search need a connection.

Item names are unique within a list, ignoring surrounding whitespace and Unicode case. Different lists can use the same name.

Scores are relative to the order of ranked items in each list, not independent quality ratings. The best item scores 10.0 and the worst scores 0.0; a single ranked item scores 10.0. For best-first rank `r` among `n` ranked items, the score is `round(10 * (n - r) / (n - 1), 1)` when `n > 1`. For example, four items score 10.0, 6.7, 3.3 and 0.0.

The API stores scores in `rating`. Score lists display one decimal place, dropping a trailing `.0` (for example `8.5`, `8`, `0`); position lists display whole-number ranks. An item without a position has a null score and is shown as **Not ranked yet**. Adding, deleting or re-ranking items can change all scores in the list. Lists use position, not rounded scores, to order ranked items best first; unranked items appear last.

Existing PostgreSQL databases require schema upgrades before running the updated application, including dropping the retired `comparison_sessions` table. See [Upgrade the list-ranking mode schema](fastapi/README.md#upgrade-the-list-ranking-mode-schema) for prerequisites and safe cutover. Fresh databases use the current model schema.


## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, commit, and PR conventions.
