# TierNerd Frontend

React Native mobile app built with Expo SDK 54.

## Browsing and ranking

Choose **New list** to create a list and add its first item. Home displays lists in a single column. Each list shows saved ranks and scores, with **Add item** in its header. Select an item to view its details or resume a ranking draft.

Enter a name and choose **Good**, **Mid**, or **Bad** from the colored category tiles. Compare items with the large choice cards, then save the ranking. Category badges identify the starting category without replacing saved scores or ranks.

On phones, forms and item details open in bottom sheets with scrolling content and separate action controls. The web shell follows the dynamic viewport, with safe-area insets owned by the screens and modal footers. Desktop item details open in a 400px side pane only when you select an item or start a workspace action.

If ranking status fails to load, the item stays open with an error and **Retry**. An item without a draft is different from a missing API route; update the dev backend before publishing a frontend that uses the persistent-ranking API.

Inputs keep a neutral border when you type with a pointer or touch. Tab navigation shows a keyboard-only focus outline.

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
