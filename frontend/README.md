# TierNerd Frontend

React Native mobile app built with Expo SDK 58.

## Browsing and ranking

User-facing flows live in [README.md](../README.md#ranking-lists).

Home shows the most recently modified lists first, including when displaying cached lists. Editing an item updates its list's modification time; opening a list does not.

Previously opened lists show saved items, order, ranking mode, scores, and available list metadata while refreshing from the API. Cached empty lists also appear without waiting for the refresh. You can read cached items, but changing the ranking mode, adding, editing, deleting, or starting a ranking requires successful live validation of the list and its items. Active ranking drafts stay online-only. If a refresh fails, saved content stays visible with a retry action; deleted or inaccessible lists clear when the API confirms they are unavailable. Cache storage is best effort and never confirms a write.

A saved list position is restored for up to 24 hours as items load. Dragging takes priority over the saved position.

Lists show an emoji, not a cover photo. In **Profile**, **Workspace background** can be the built-in landscape, a solid canvas, or **My photo**, a photo chosen from the device. Your photo is uploaded to private storage on your account, so it follows you to your other devices; choosing another background removes it. Photos created with Apple Intelligence can be imported after saving them to Photos. The app does not include image generation or camera capture.

The background photo is cached on a phone after it loads once, so it still shows offline. If it cannot load, the app shows the device's own background setting and retries when the connection returns.

Forms and item details open as bottom sheets that fill the usable screen height, with fixed headings and actions around independently scrolling content.

The default appearance is **System**, which follows the device's appearance. Choose **Light**, **Dark**, or **System** in **Profile** to save your preference across reloads; existing explicit choices are preserved.

The native launch splash uses the device appearance, with its image and light and dark colors configured in `app.json`. Rebuild the app to apply splash changes; the saved in-app appearance preference applies after launch.

Sign-in is available on iOS with Google. The Google OAuth web client ID in `EXPO_PUBLIC_GOOGLE_CLIENT_ID` must match the backend's `GOOGLE_CLIENT_ID`. iOS also requires an iOS OAuth client ID for `com.maxwellward.tiernerd`; `make ios` and `scripts/build-ios-testflight.sh` supply development defaults for both client IDs.

## Prerequisites

- Node.js 24 ([`mise.toml`](../mise.toml); run `mise install`)
- npm
- An Xcode version compatible with Expo SDK 58 and CocoaPods for native iOS builds
- A paired and trusted iPhone, Developer Mode when requested, and existing provisioning for the app's bundle ID and Apple team for standalone installation

## Setup

```bash
npm install
```

## Running the App

### Option 1: Standalone iOS Release (Physical iPhone)

Run these commands from the repository root. Preserve unsynced data and keep the existing bundle and signing identity before installing. Replacing a TestFlight installation locally may not preserve every local record. If replacement fails, stop and preserve the data; never uninstall the app or clear its storage to fix signing.

```bash
make ios                          # Build, install, and launch on Gengar Phone
make ios IOS_DEVICE="Other Phone" # Choose another paired device
make ios IOS_REUSE=1              # Install and launch the existing build without rebuilding
```

If device names are ambiguous, list devices and use an identifier:

```bash
xcrun devicectl list devices --timeout 10
```

Reuse does not include source or configuration changes. Run `make ios` to build them. Reuse still deploys the backend when its inputs changed, which is the quick way to test a backend-only change against the installed app.

The build uses the hosted development API by default, or the public HTTPS API selected by `EXPO_PUBLIC_API_URL`. It ignores Expo dotenv files and embeds its JavaScript, so it needs no Metro server after installation. `make ios` may deploy the dev backend first; see the [Cloud Dev Loop](../AGENTS.md#cloud-dev-loop-cloud-run--neon). The deploy does not migrate the database. Upgrade the matching database and deploy the matching backend before building the updated app; see [Before any migration](../fastapi/README.md#before-any-migration) and [the background photo](../fastapi/README.md#configure-the-background-photo).

For standalone acceptance, close Xcode and Metro, force-quit the installed app, and relaunch it from the home screen. Check Google sign-in and a saved list against the configured API. Network-backed behavior requires connectivity. This is separate from TestFlight acceptance.

### Option 2: iOS Simulator

```bash
npm run ios
```

### Option 3: iOS development build (physical device)

Expo Go cannot run Google Sign-In because the library requires native code. Install a development build on a paired device:

```bash
npx expo run:ios --device
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

For "Unable to find destination" errors, check Xcode and simulator runtime compatibility, then select an installed compatible simulator first.

For a confirmed missing or incompatible Expo package, install the compatible package from `frontend/`:

```bash
npx expo install <package>
```

For example, if a confirmed Reanimated worklets dependency is missing or incompatible, use `npx expo install react-native-worklets`.

If simulator project regeneration is needed, run from `frontend/`:

```bash
npx expo prebuild --platform ios --no-install
(cd ios && pod install)
npm run ios
```

For a standalone rebuild that regenerates native files, run from the repository root:

```bash
make ios FORCE_PREBUILD=1
```

Regeneration derives native files from Expo config and plugins. Do not routinely use `prebuild --clean`, delete `ios/`, or edit generated project files.
