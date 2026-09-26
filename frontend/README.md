<!-- Generated from docs/src. Run `make docs-build` to update. Do not edit directly. -->

# TierNerd Frontend

React Native mobile app built with Expo SDK 54.

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
make frontend-e2e                 # builds the bundle, then runs the spec
```

`make frontend-e2e` builds first, so it always tests the current code. The API the bundle targets is `EXPO_PUBLIC_API_URL` (the shell value wins over `frontend/.env.local`), so a run against a local backend is `EXPO_PUBLIC_API_URL=http://localhost:8000 make frontend-e2e`. CI runs the same flow in `.github/workflows/e2e.yml`.

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
