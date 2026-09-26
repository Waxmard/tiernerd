## Development Notes for AI Agents

- Check for TypeScript errors after frontend changes.
- Google sign-in is real: the web client obtains a Google ID token and exchanges it at `POST /api/users/google`. Setting `EXPO_PUBLIC_USE_MOCK_AUTH=true` switches auth to mocks for frontend-only work.
- Comparison sessions are stored in-memory (not persistent).
- API endpoints are prefixed with `/api/`.
- Do **not** run `npm run ios`, `npm run android`, or `npx expo start` — the user runs these in a separate terminal.
- The browser target (`npm run web`, served at `http://localhost:8081`) is the primary frontend loop. If it is already serving, use it to verify UI changes instead of asking for a simulator run.
- The deployed dev API is the default backend for frontend work; point `npm run web` at it with `EXPO_PUBLIC_API_URL` instead of starting containers locally.
- Do **not** run `make cloud-deploy` unless asked — it mutates shared cloud state.
- Run `make frontend-e2e` after changing frontend behavior (the backend must be running).
- Do **not** run `git commit`, `git add`, or `git push` — the user handles staging, committing, and pushing.
- Do **not** run `make clean`, `make dev`, `make fresh`, `make restart`, or `make reset` — the user runs these themselves.
- Backend package management: use `uv`, not `pip`.
