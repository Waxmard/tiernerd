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
