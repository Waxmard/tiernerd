<!-- Generated from docs/src. Run `make docs-build` to update. Do not edit directly. -->

# TierNerd Frontend

React Native mobile app built with Expo SDK 54.

## Browsing and ranking

Choose **New list** or the **Create a list** empty-state action to create a list and add its first item. Home displays compact list cards in one column on phones, two columns from 768px, and three columns from 1280px. Each list shows items best first with relative green preference rails, with **Add item** in its header. Empty lists offer **Add your first item**. Select an item to view its score and rank or resume a ranking draft. Unranked rows and comparison choices have no preference rail.

Previously opened lists show saved items, order, scores, and available list metadata while refreshing from the API. Cached empty lists also appear without waiting for the refresh. You can read cached items, but adding, editing, deleting, or starting a ranking requires successful live validation of the list and its items. Active ranking drafts stay online-only. If a refresh fails, saved content stays visible with a retry action; deleted or inaccessible lists clear when the API confirms they are unavailable. Cache storage is best effort and never confirms a write.

Enter a name and choose **Good**, **Mid**, or **Bad** from the compact category controls. Compare items with the neutral choice rows; ranking saves automatically after the final comparison, or immediately when the destination range is empty. The refreshed list confirms the saved order without an extra success banner or sheet. **Undo last answer** is available before the final answer, not after saving. If saving fails, choose **Retry saving**; if the item refresh fails, choose **Retry refresh**. Category badges identify the starting category without replacing saved scores or ranks.

On phones, forms and item details fill the usable screen height with fixed headings and actions around independently scrolling content. On larger screens, dialogs stay centered and item details open in a 400px side pane only when you select an item or start a workspace action.

Edit optional descriptions and list colors in focused views. **Back** and **Done** return to the overview without saving or discarding the draft. Submit from the overview to save. Canceling list creation clears its draft immediately; canceling a changed item asks before discarding it.

If ranking status fails to load, the item stays open with an error and **Retry**. An item without a draft is different from a missing API route; update the dev backend before publishing a frontend that uses the persistent-ranking API.

The default appearance is **Dark**, with neutral navy surfaces and muted secondary text. Choose **Light**, **Dark**, or **System** in **Profile** to save your preference across reloads. The sign-in screen uses a bounded card; account and appearance settings stay centered within 560px on wide screens.

Sign-in is available on iOS with Google. The Google OAuth web client ID in `EXPO_PUBLIC_GOOGLE_CLIENT_ID` must match the backend's `GOOGLE_CLIENT_ID`. iOS also requires an iOS OAuth client ID for `com.maxwellward.tiernerd`; `make ios` and `scripts/build-ios-testflight.sh` supply development defaults for both client IDs. Android sign-in is not supported.

## Prerequisites

- Node.js 18+
- npm
- Xcode and CocoaPods for native iOS builds
- A paired iPhone, Apple team access and provisioning for standalone installation
- Expo Go app (for development on a physical device)

## Setup

```bash
npm install --legacy-peer-deps
```

Note: `--legacy-peer-deps` is required due to React 19 peer dependency conflicts.

## Running the App

### Option 1: Standalone iOS Release (Physical iPhone)

```bash
make ios                          # Build, install, and launch on Gengar Phone
```

### Option 2: iOS Simulator

```bash
npm run ios
```

### Option 3: Android Emulator

```bash
npm run android
```

### Option 4: Expo Go (Physical Device)

```bash
npx expo start
```

### Frontend (frontend/)

To build and install a standalone iOS Release app, install Xcode and CocoaPods, pair and trust the iPhone, and configure Apple team `48TY2FP59S` for signing. Run from the repository root:

```bash
make ios                          # build, install and launch on Gengar Phone
make ios IOS_DEVICE="Other Phone" # choose another paired device
```

The command uses development Google OAuth web and iOS client IDs by default. To use another iOS client for bundle ID `com.maxwellward.tiernerd`, set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` in the environment. To use another web client, set `EXPO_PUBLIC_GOOGLE_CLIENT_ID` to the same client ID as the backend's `GOOGLE_CLIENT_ID`.

The Release app uses the hosted development API by default and embeds its JavaScript, so it needs no Metro server after installation. Set `EXPO_PUBLIC_API_URL` to another public HTTPS API if needed. The command ignores Expo dotenv files. Re-running it replaces the app without deliberately removing its data. `npm run ios` remains the separate Expo development command.

Pushing to `main` (or dispatching `.github/workflows/deploy-testflight.yml`) runs `scripts/build-ios-testflight.sh` on `macos-26` in the `preview` environment to archive, export, and upload `TierNerd.ipa` to App Store Connect / TestFlight using `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY`, `APPLE_CERTIFICATE_P12_BASE64`, and `APPLE_CERTIFICATE_PASSWORD`.

Simulator and development commands:

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

### `Cannot find module` After a Dependency Change

A package that app code imports — or that `babel.config.js` names as a preset — but `package.json` never declares resolves only by hoisting, and breaks the moment `npx expo install --fix` (or any install) re-resolves the tree and nests it under `node_modules/expo/node_modules/`. Declare it explicitly:

```bash
npx expo install expo-constants          # imported by src/config/api.ts
npx expo install --dev babel-preset-expo # named by babel.config.js
```

Metro reports this as a bundling failure with the missing module named; `tsc` reports it for TypeScript imports.
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
