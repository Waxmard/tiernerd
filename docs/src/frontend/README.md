# TierNerd Frontend

React Native mobile app built with Expo SDK 54.

## Browsing and ranking

Choose **New list** or the **Create a list** empty-state action to create a list and add its first item. Home displays compact list cards in one column on phones, two columns from 768px, and three columns from 1280px. Each list shows items best first with relative green preference rails, with **Add item** in its header. Empty lists offer **Add your first item**. Select an item to view its score and rank or resume a ranking draft. Unranked rows and comparison choices have no preference rail.

Previously opened lists show saved items, order, scores, and available list metadata while refreshing from the API. Cached empty lists also appear without waiting for the refresh. You can read cached items, but adding, editing, deleting, or starting a ranking requires successful live validation of the list and its items. Active ranking drafts stay online-only. If a refresh fails, saved content stays visible with a retry action; deleted or inaccessible lists clear when the API confirms they are unavailable. Cache storage is best effort and never confirms a write.

Enter a name and choose **Good**, **Mid**, or **Bad** from the compact category controls. Compare items with the neutral choice rows; ranking saves automatically after the final comparison, or immediately when the destination range is empty. The refreshed list confirms the saved order without an extra success banner or sheet. **Undo last answer** is available before the final answer, not after saving. If saving fails, choose **Retry saving**; if the item refresh fails, choose **Retry refresh**. Category badges identify the starting category without replacing saved scores or ranks.

On phones, forms and item details fill the usable screen height with fixed headings and actions around independently scrolling content. Desktop dialogs stay centered; item details open in a 400px side pane only when you select an item or start a workspace action. The web shell follows the dynamic viewport. Web screens and modal overlays apply `env(safe-area-inset-top, 0px)` directly through the scoped `web-safe-area-top` CSS class, overriding measured inline top padding without adding another inset. Native safe-area handling and the other safe-area edges remain unchanged. After deploying a fresh build, check the installed iPhone web app: the header must clear system chrome without excessive blank space, and **New list** must remain usable. Desktop browser checks of CSS ownership do not verify the installed iPhone layout.

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
