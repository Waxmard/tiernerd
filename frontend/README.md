# TierNerd Frontend

React Native mobile app built with Expo SDK 54.

## Browsing and ranking

User-facing flows are documented in [README.md](../README.md#scores-out-of-10); this section covers layout, appearance and caching.

Home shows the most recently modified lists first, including when displaying cached lists. Editing an item updates its list's modification time; opening a list does not.

Previously opened lists show saved items, order, scores, and available list metadata while refreshing from the API. Cached empty lists also appear without waiting for the refresh. You can read cached items, but adding, editing, deleting, or starting a ranking requires successful live validation of the list and its items. Active ranking drafts stay online-only. If a refresh fails, saved content stays visible with a retry action; deleted or inaccessible lists clear when the API confirms they are unavailable. Cache storage is best effort and never confirms a write.

On phones, forms and item details fill the usable screen height with fixed headings and actions around independently scrolling content. On larger screens, dialogs stay centered and item details open in a 400px side pane only when you select an item or start a workspace action.

The default appearance is **System**, which follows the device's appearance. Choose **Light**, **Dark**, or **System** in **Profile** to save your preference across reloads; existing explicit choices are preserved. The sign-in screen uses a bounded card; account and appearance settings stay centered within 560px on wide screens.

The native launch splash uses the device appearance, with its image and light and dark colors configured in `app.json`. Rebuild the app to apply splash changes; the saved in-app appearance preference applies after launch.

Sign-in is available on iOS with Google. The Google OAuth web client ID in `EXPO_PUBLIC_GOOGLE_CLIENT_ID` must match the backend's `GOOGLE_CLIENT_ID`. iOS also requires an iOS OAuth client ID for `com.maxwellward.tiernerd`; `make ios` and `scripts/build-ios-testflight.sh` supply development defaults for both client IDs.

## Prerequisites

- Node.js 24 ([`mise.toml`](../mise.toml); run `mise install`)
- npm
- Xcode and CocoaPods for native iOS builds
- A paired and trusted iPhone, Apple team access and provisioning for standalone installation

## Setup

```bash
npm install --legacy-peer-deps
```

Note: `--legacy-peer-deps` is required due to React 19 peer dependency conflicts.

## Running the App

### Option 1: Standalone iOS Release (Physical iPhone)

```bash
make ios                          # Build, install, and launch on Gengar Phone
make ios IOS_REUSE=1              # Install and launch the existing build without rebuilding
```

Reuse does not include source or configuration changes. Run `make ios` to build them.

### Option 2: iOS Simulator

```bash
npm run ios
```

### Option 3: iOS development build (physical device)

Expo Go cannot run Google Sign-In because the library requires native code. Install a development build on a paired device:

```bash
npx expo run:ios --device
```

### Frontend commands

iOS Release configuration: see [AGENTS.md](../AGENTS.md#ios-release). TestFlight release details: see [CONTRIBUTING.md](../CONTRIBUTING.md#deploys--releases). Code-quality commands: see [AGENTS.md](../AGENTS.md#frontend-code-quality).

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

### CocoaPods / Reanimated Errors

If `pod install` fails with reanimated worklets errors:

```bash
npx expo install react-native-worklets -- --legacy-peer-deps
rm -rf ios && npx expo prebuild --platform ios
```

## Project Structure

Frontend source directories: see [Frontend Structure](../AGENTS.md#frontend-structure-frontendsrc).
