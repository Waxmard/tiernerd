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

See the [screenshots/](screenshots/) directory for all available screenshots.

## Technology

- **Frontend:** React Native with Expo (SDK 54)
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

## Layout

|Path|What|
|---|---|
|`fastapi/`|FastAPI backend — async SQLAlchemy on PostgreSQL, with the comparison and ranking services|
|`frontend/`|Expo / React Native app (iOS)|
|`scripts/`|Repo-wide tooling — line-limit check, iOS and TestFlight builds|
|`screenshots/`|Screenshots referenced above|

## Ranking lists

Choose **Ranked positions** or **Scores out of 10** when creating a list. Scores are the default. Change the choice later in **List options**; switching modes does not change the saved order or start new comparisons.

Add an item and choose the better item in each comparison. Comparisons use neutral surfaces without scores. **Undo last answer** reverses the latest choice and is available only before the final answer. Ranking saves automatically after the final comparison; the first item in an empty list saves immediately. The refreshed list confirms the saved order. If saving fails, choose **Retry saving**. If the item refresh fails after saving, choose **Retry refresh**.

Select a row to view its description, image and overall rank. Score lists also show the score. **Edit** changes its metadata; **Re-rank** starts comparisons without changing the saved rank until they complete and save automatically. **Delete Item** is separate from editing and requires confirmation.

Interrupted ranking drafts persist. Select the item and choose **Resume ranking**, or **Restart ranking** if ranked peers changed. A ready draft saves automatically when resumed. Cancelling a new-item draft discards that item. Cancelling a re-ranking draft preserves the saved item and rank. Unranked items without a draft offer **Rank now**.

Item names are unique within a list, ignoring surrounding whitespace and Unicode case. Different lists can use the same name.

Deleting an item or list also discards its related active and completed comparison sessions. Sessions unrelated to the deleted item or list remain unchanged.

Scores are relative to the order of ranked items in each list, not independent quality ratings. The best item scores 10.0 and the worst scores 0.0; a single ranked item scores 10.0. For best-first rank `r` among `n` ranked items, the score is `round(10 * (n - r) / (n - 1), 1)` when `n > 1`. For example, four items score 10.0, 6.7, 3.3 and 0.0.

The API stores scores in `rating`. Score lists display them to one decimal place without a suffix; position lists display whole-number ranks. An item without a position has a null score and is shown as **Not ranked yet**. Adding, deleting or re-ranking items can change all scores in the list. Lists use position, not rounded scores, to order ranked items best first; unranked items appear last.

Existing PostgreSQL databases require schema upgrades before running the updated application. See [Upgrade the list-ranking mode schema](fastapi/README.md#upgrade-the-list-ranking-mode-schema) for prerequisites and safe cutover. Fresh databases use the current model schema.


## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, commit, and PR conventions.
