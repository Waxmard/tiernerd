<!-- Generated from docs/src. Run `make docs-build` to update. Do not edit directly. -->

# TierNerd Frontend

React Native mobile app built with Expo SDK 54.

## Browsing and ranking

Choose **New list** or the **Create a list** empty-state action to create a list and add its first item. Home displays compact list cards in one column on phones, two columns from 768px, and three columns from 1280px. Each list shows items best first with relative green preference rails, with **Add item** in its header. Empty lists offer **Add your first item**. Select an item to view its score and rank or resume a ranking draft. Unranked rows and comparison choices have no preference rail.

Previously opened lists show saved items, order, scores, and available list metadata while refreshing from the API. Cached empty lists also appear without waiting for the refresh. You can read cached items, but adding, editing, deleting, or starting a ranking requires successful live validation of the list and its items. Active ranking drafts stay online-only. If a refresh fails, saved content stays visible with a retry action; deleted or inaccessible lists clear when the API confirms they are unavailable. Cache storage is best effort and never confirms a write.

Enter a name and choose **Good**, **Mid**, or **Bad** from the compact category controls. Compare items with the neutral choice rows; ranking saves automatically after the final comparison, or immediately when the destination range is empty. The refreshed list confirms the saved order without an extra success banner or sheet. **Undo last answer** is available before the final answer, not after saving. If saving fails, choose **Retry saving**; if the item refresh fails, choose **Retry refresh**. Category badges identify the starting category without replacing saved scores or ranks.

On phones, forms and item details fill the usable screen height with fixed headings and actions around independently scrolling content. Desktop dialogs stay centered; item details open in a 400px side pane only when you select an item or start a workspace action. The web shell follows the dynamic viewport. Web screens and modal overlays apply `calc(env(safe-area-inset-top, 0px) + 10px)` through the scoped `web-safe-area-top` CSS class, overriding measured inline top padding without counting the safe inset twice. Browser tabs receive the same 10px gutter. Native safe-area handling and the other safe-area edges remain unchanged. After deploying a fresh build, check the installed iPhone web app: the header must clear system chrome without excessive blank space, and **New list** must remain usable. Desktop browser checks of CSS ownership do not verify the installed iPhone layout.

The Home Screen icons and browser favicon use a mascot crop of the existing TierNerd artwork. If iOS retains the old icon after deployment, remove and re-add the Home Screen shortcut.

Edit optional descriptions and list colors in focused views. **Back** and **Done** return to the overview without saving or discarding the draft. Submit from the overview to save. Canceling list creation clears its draft immediately; canceling a changed item asks before discarding it.

If ranking status fails to load, the item stays open with an error and **Retry**. An item without a draft is different from a missing API route; update the dev backend before publishing a frontend that uses the persistent-ranking API.

Inputs keep a neutral border when you type with a pointer or touch. Tab navigation shows a keyboard-only focus outline on inputs and actions.

The default appearance is **Dark**, with neutral navy surfaces and muted secondary text. Choose **Light**, **Dark**, or **System** in **Profile** to save your preference across reloads. Authentication forms use a bounded card; account and appearance settings stay centered within 560px on desktop.

## Prerequisites

- Node.js 18+
- npm
- Xcode (for iOS Simulator)
- Expo Go app (for physical device testing)

## Setup

```bash
npm install --legacy-peer-deps
```

Note: `--legacy-peer-deps` is required due to React 19 peer dependency conflicts.

## Running the App

### Option 1: Expo Go (Physical Device)

```bash
npx expo start
```

Scan the QR code with Expo Go on your iPhone/Android.

### Option 2: iOS Simulator

```bash
npm run ios
```

### Option 3: Android Emulator

```bash
npm run android
```

### Option 4: Web

```bash
npm run web
```

### Frontend (frontend/)

Day-to-day UI work happens in the browser — no Xcode or simulator needed.

Terminal A (backend, once):

```bash
cd fastapi && make dev DETACHED=1
```

Terminal B (web bundle):

```bash
cd frontend
npm run web                       # http://localhost:8081
EXPO_PUBLIC_API_URL=https://<cloud-run-url> npm run web   # target the deployed dev API
```

Open `http://localhost:8081`. Chrome DevTools' device toolbar gives a phone-sized layout, and Fast Refresh applies edits without a rebuild.

To check on your iPhone (no Xcode):

```bash
ipconfig getifaddr en0            # e.g. 192.168.1.50
```

Open `http://<ip>:8081` in Safari. The API base URL follows the host that served the app, so the phone reaches the backend on the same LAN IP.

End-to-end smoke test — Playwright drives the **built** web bundle, so the API URL is baked in at export time:

```bash
make frontend-e2e                 # boots a throwaway backend, builds the bundle, runs the spec
```

`make frontend-e2e` starts its own SQLite + uvicorn backend (seeded dev users — the same setup CI uses in `.github/workflows/e2e.yml`), points the bundle at it, and tears it down afterwards, so it needs neither a local container nor a deployed API. Set `EXPO_PUBLIC_API_URL` to target something else instead; the shell value wins over `frontend/.env.local`:

```bash
EXPO_PUBLIC_API_URL=https://tiernerd-api-dev-…run.app make frontend-e2e   # deployed dev API
EXPO_PUBLIC_API_URL=http://localhost:8000 make frontend-e2e               # a running container
```

Reserved for native-only changes and pre-release checks:

```bash
npm run ios                       # Run on iOS simulator
npm run android                   # Run on Android emulator
npx expo start --go               # Expo Go on a physical phone, no simulator
```

Code quality (Biome — single tool for lint + format):

```bash
npm run lint                      # Lint with Biome
npm run lint:fix                  # Fix lint errors
npm run format                    # Format with Biome
npm run format:check              # Check formatting
npm run check                     # Lint + format + import sort (combined)
npm run check:fix                 # Apply all safe fixes
npm run typecheck                 # TypeScript check
```

## Troubleshooting

### Web Page Is Blank

React 19 requires `react` and `react-dom` at exactly the same version. A mismatch throws `Incompatible React versions` at runtime and the page renders nothing (the console shows the error, the page stays empty). `npx expo install --check` reports it; fix with `npx expo install --fix`, then re-run `npm run typecheck`, since aligning versions rewrites the dependency tree.

### `Cannot find module` After a Dependency Change

A package that app code imports — or that `babel.config.js` names as a preset — but `package.json` never declares resolves only by hoisting, and breaks the moment `npx expo install --fix` (or any install) re-resolves the tree and nests it under `node_modules/expo/node_modules/`. Declare it explicitly:

```bash
npx expo install expo-constants          # imported by src/config/api.ts
npx expo install --dev babel-preset-expo # named by babel.config.js
```

Metro reports this as a bundling failure (`Web Bundling failed`, with the missing module named); `tsc` reports it for TypeScript imports.

### Web: Delete / Error Dialogs Do Nothing

`react-native-web` ships `Alert` as a no-op stub, so `Alert.alert` silently does nothing in the browser. Import from `frontend/src/utils/confirm.ts` (`confirmDestructive`, `notifyError`) instead of using `Alert` directly.

### Phone Loads the App but API Calls Fail

The app calls the API on the host that served it, so the LAN URL must be used — `localhost` on the phone is the phone itself. The backend container also needs `CORS_ORIGIN_REGEX` to match that origin; the dev default covers loopback and RFC1918 hosts on port 8081.

### First Web Bundle Is Slow

The initial web bundle takes ~30-60s. Fast Refresh afterward is sub-second, so only the first load feels slow.

### LAN URL Unreachable From Another Device

Restart the web server bound to the LAN interface:

```bash
npx expo start --web --host lan
```

### iOS Simulator Build Fails

If you see "Unable to find destination" errors:

1. Ensure your Xcode version matches your iOS Simulator version
2. Regenerate the iOS project:

   ```bash
   rm -rf ios && npx expo prebuild --platform ios
   ```

### Expo Go Version Mismatch

If Expo Go shows "Project incompatible with this version" — the app requires SDK 54. Update Expo Go from the App Store.

### CocoaPods / Reanimated Errors

If `pod install` fails with reanimated worklets errors:

```bash
npx expo install react-native-worklets -- --legacy-peer-deps
rm -rf ios && npx expo prebuild --platform ios
```

## Project Structure

```
src/
├── screens/          # Screen components
├── navigation/       # React Navigation setup
├── providers/        # Context providers (Auth)
└── design-system/    # Reusable components and tokens
```

## Documentation Automation

`README.md`, `fastapi/README.md`, and `frontend/README.md` are **generated** from templates in `docs/src/` by `scripts/build_docs.py`. Do not edit the generated files directly — edit the template or partial and re-render.

```bash
make docs-build    # render templates → generated files
make docs-check    # fail if generated docs are stale
```

Partials live in `docs/src/partials/` and are included with double-brace `include:partials/<name>.md` directives.

`AGENTS.md` is hand-maintained, not generated — it is the source of truth for agent-facing guidance.
