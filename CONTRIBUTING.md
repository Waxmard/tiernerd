# Contributing to TierNerd

Local setup, development commands, and the repo layout live in [AGENTS.md](AGENTS.md) — this file doesn't repeat them.

## Branching

`main` is the default and target branch — branch off the latest `main`, never push to it directly. Every change lands through a pull request.

```bash
git switch main && git pull
git switch -c feat/short-description
```

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <subject>`.
`feat:` → minor, `fix:` → patch, `!` / `BREAKING CHANGE:` → major. `docs`, `chore`, `refactor`, and `test` are used as normal.

These types drive automated versioning (see [Deploys & Releases](#deploys--releases)), and `docs` / `chore` / `test` sections are hidden from the changelog.

Let [git-ai](https://github.com/Waxmard/git-ai) draft the message from staged changes:

```bash
git add -A
git-ai commit                     # prints a Conventional Commits message — review it
git commit -m "$(git-ai commit)"  # …or commit with it in one line
```

Repo-local guidance for it lives in [.git-ai-instructions](.git-ai-instructions).

## Pull Requests

Always open one — even for small changes.

- **Squash on merge.** The branch's WIP commits collapse into a single commit on `main`, so the **squashed title and body must be the real, conventional message** — that line is what the release tooling reads.
- **Keep it focused.** One logical change per PR keeps review and the changelog clean.
- **CI must be green.** `backend` runs lint, format checks, typecheck, tests, and module boundaries; `frontend` runs lint, format checks, typecheck, and unit tests. Each is path-filtered to its project directory and workflow file. `security` runs Semgrep and Trivy on pull requests targeting `main`.

## Review & Approval

This is currently a solo-maintained repo, so there is no `.github/CODEOWNERS` and no auto-requested reviewer: open the PR, let CI pass, and merge. If collaborators join, add `CODEOWNERS` and turn on "require review from Code Owners" for the default branch.

## Deploys & Releases

[release-please](https://github.com/googleapis/release-please) runs on every push to `main`. It reads the conventional commits since the last release and opens a release PR that bumps `version.txt`, `frontend/package.json`, `frontend/app.json`, and `CHANGELOG.md`; the PR auto-merges, and the resulting tag publishes a GitHub Release.

Two things ship on or alongside `main`:

- **TestFlight (`deploy-testflight.yml`)** — A published GitHub Release builds its tag. A manual `workflow_dispatch` run builds the commit captured when the run starts, even if the branch advances. Ordinary pushes do not upload. Both paths build a signed iOS Release archive on `macos-26` against the development Cloud Run API and upload `TierNerd.ipa` using the `preview` environment secrets (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY`, `APPLE_CERTIFICATE_P12_BASE64`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_DEVELOPMENT_CERTIFICATE_P12_BASE64`, `APPLE_DEVELOPMENT_CERTIFICATE_PASSWORD`). Uploads do not wait for CI and do not prove that TestFlight processing or installation succeeded.
- **Backend** — deploy Cloud Run from `fastapi/` with `make cloud-deploy` (not triggered by a release).

This is why commit hygiene matters: every commit on `main` is read by the release tooling.

### Upload to TestFlight locally

Use macOS with Node.js 24, frontend dependencies, Xcode, CocoaPods, Apple team access, an App Store Connect API key, and existing Apple development and distribution certificates with their private keys. The upload uses the development API unless `EXPO_PUBLIC_API_URL` is set.

Create the Keychain items with the commands below. Each command prompts twice without putting the entered value in shell history. The prompt truncates values longer than 128 characters, so enter a short temporary value for the private key and certificate items. For the other items, enter the actual value if it fits; otherwise use a temporary value there too.

```bash
security add-generic-password -s tiernerd:asc-key-id -a "$USER" -T "" -w
security add-generic-password -s tiernerd:asc-issuer-id -a "$USER" -T "" -w
security add-generic-password -s tiernerd:asc-private-key -a "$USER" -T "" -w
security add-generic-password -s tiernerd:apple-certificate-p12-base64 -a "$USER" -T "" -w
security add-generic-password -s tiernerd:apple-certificate-password -a "$USER" -T "" -w
security add-generic-password -s tiernerd:apple-development-certificate-p12-base64 -a "$USER" -T "" -w
security add-generic-password -s tiernerd:apple-development-certificate-password -a "$USER" -T "" -w
```

In Keychain Access, replace each temporary value with the full credential using a private input method. Store the entire `.p8` file as a single-line Base64 value in `tiernerd:asc-private-key`. Store the distribution `.p12` as single-line Base64 in `tiernerd:apple-certificate-p12-base64` and the development `.p12` as single-line Base64 in `tiernerd:apple-development-certificate-p12-base64`. Do not print, log, or save new copies of the encoded values. If you use a clipboard, disable its history and sync first and clear it afterward. In each item's **Access Control**, retain **Confirm before allowing access** with no trusted applications.

To update an existing short item from the terminal, add `-U` before the final `-w`. Use Keychain Access for longer values.

Disable shell tracing, then load the credentials immediately before the upload. Keychain asks for approval on each read.

```bash
set +x
export ASC_KEY_ID="$(security find-generic-password -s tiernerd:asc-key-id -a "$USER" -w)"
export ASC_ISSUER_ID="$(security find-generic-password -s tiernerd:asc-issuer-id -a "$USER" -w)"
export ASC_PRIVATE_KEY="$(security find-generic-password -s tiernerd:asc-private-key -a "$USER" -w | openssl base64 -d -A)"
export APPLE_CERTIFICATE_P12_BASE64="$(security find-generic-password -s tiernerd:apple-certificate-p12-base64 -a "$USER" -w)"
export APPLE_CERTIFICATE_PASSWORD="$(security find-generic-password -s tiernerd:apple-certificate-password -a "$USER" -w)"
export APPLE_DEVELOPMENT_CERTIFICATE_P12_BASE64="$(security find-generic-password -s tiernerd:apple-development-certificate-p12-base64 -a "$USER" -w)"
export APPLE_DEVELOPMENT_CERTIFICATE_PASSWORD="$(security find-generic-password -s tiernerd:apple-development-certificate-password -a "$USER" -w)"
make testflight
unset ASC_KEY_ID ASC_ISSUER_ID ASC_PRIVATE_KEY APPLE_CERTIFICATE_P12_BASE64 APPLE_CERTIFICATE_PASSWORD APPLE_DEVELOPMENT_CERTIFICATE_P12_BASE64 APPLE_DEVELOPMENT_CERTIFICATE_PASSWORD
```

The marketing version comes from `frontend/package.json`. The upload queries App Store Connect for the highest iOS build number for that version and increments its last component. A failed query stops the upload. To use a known-unused build number instead, run `make testflight IOS_BUILD_NUMBER=123`.

A local upload deploys the dev backend first when its inputs changed, like `make ios`; the GitHub release workflow skips that step because it runs in CI.

To use another app identity, set `IOS_BUNDLE_ID` for the TestFlight build. Configure matching Apple provisioning and `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` for that bundle ID.

Do not run local and hosted uploads at the same time: build-number allocation is not atomic. Apple may take time to list an upload. If Apple rejects a duplicate, wait for the previous upload to appear or provide a known-unused override; the script does not retry uploads.
