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

`make frontend-e2e` starts its own SQLite + uvicorn backend (seeded dev users — the same setup CI uses in `.github/workflows/e2e.yml`), points the bundle at it, and tears it down afterwards, so it needs neither a local container nor a deployed API. It creates a test-only app token for the disposable backend. To target an external API instead, supply a valid `E2E_AUTH_TOKEN` for that API securely in the environment and set `EXPO_PUBLIC_API_URL`; the shell value wins over `frontend/.env.local`:

```bash
EXPO_PUBLIC_API_URL=https://tiernerd-api-dev-…run.app make frontend-e2e   # deployed dev API
EXPO_PUBLIC_API_URL=http://localhost:8000 make frontend-e2e               # a running container
```

To build and install a standalone iOS Release app, install Xcode and CocoaPods, pair and trust the iPhone, and configure Apple team `48TY2FP59S` for signing. Run from the repository root:

```bash
make ios                          # build, install and launch on Gengar Phone
make ios IOS_DEVICE="Other Phone" # choose another paired device
```

The command uses development Google OAuth web and iOS client IDs by default. To use another iOS client for bundle ID `com.maxwellward.tiernerd`, set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` in the environment. To use another web client, set `EXPO_PUBLIC_GOOGLE_CLIENT_ID` to the same client ID as the backend's `GOOGLE_CLIENT_ID`.

The Release app uses the hosted development API by default and embeds its JavaScript, so it needs no Metro server after installation. Set `EXPO_PUBLIC_API_URL` to another public HTTPS API if needed. The command ignores Expo dotenv files and disables mock authentication. Re-running it replaces the app without deliberately removing its data. `npm run ios` remains the separate Expo development command.

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
