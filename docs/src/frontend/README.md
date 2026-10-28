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

{{ include:partials/frontend_commands.md }}

{{ include:partials/frontend_troubleshooting.md }}

## Project Structure

```
src/
├── screens/          # Screen components
├── navigation/       # React Navigation setup
├── providers/        # Context providers (Auth)
└── design-system/    # Reusable components and tokens
```

{{ include:partials/docs_automation.md }}
