# TierNerd

TierNerd is a cross-platform mobile app for ranking items through 1v1 comparisons. Each list displays either numbered positions or scores out of 10.

```text
your items ──1v1 comparisons──▶ TierNerd ──▶ ranked list, with positions or scores
```

## Key features

- Create custom lists on any topic
- Add items with descriptions and images
- Rank items by choosing the better of two

## Screenshots

| Login | Home |
|:---:|:---:|
| ![Login](screenshots/login.png) | ![Home](screenshots/home-empty.png) |

## Technology

- **Frontend:** React Native with Expo (SDK 58)
- **Backend:** Python with FastAPI
- **Database:** PostgreSQL (async via asyncpg)
- **Auth:** Google sign-in and JWT sessions

## Getting started

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

Choose **Ranked positions** or **Scores out of 10** when creating a list; scores are the default. Switch in **List options** at any time without changing the order.

To rank an item, choose the better item in each comparison. **Undo last answer** takes back your last choice. The rank saves when the comparisons finish; the first item in an empty list saves immediately.

Select an item to see its description, image, rank and, in score lists, its score. **Edit** changes its details. **Re-rank** runs the comparisons again and keeps the old rank until they finish. **Delete Item** removes it after confirmation.

An unfinished ranking stays on the device. Reopen the list or choose **Resume ranking** to continue. Cancelling leaves the item marked **Not ranked yet**; choose **Rank now** to start again.

Scores come from each item's place in the list, not a separate rating. They run from 0.1 to 9.9, and adding, removing or re-ranking an item can change every score. To set a score yourself, edit a ranked item and enter 0 to 10; the items around it adjust. A manual score must fit between the manual scores above and below it.

Item names must be unique within a list, ignoring case and surrounding spaces.

The app works offline. Changes save on the device first and sync in order when the connection returns. If the server rejects a change, the change stays on the device, a notification names the problem field, and it syncs once the server accepts it. Adding a duplicate name uses the existing item. Edits to items deleted on another device are discarded with a notification. Photo uploads and photo search need a connection.

Existing databases upgrade themselves when the backend starts. The [backend README](fastapi/README.md) covers the manual upgrade scripts.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, commit, and PR conventions.
