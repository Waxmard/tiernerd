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
