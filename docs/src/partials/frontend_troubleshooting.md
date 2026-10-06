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
