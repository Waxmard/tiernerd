# Contributing to TierNerd

Thanks for contributing. This guide covers how a change flows from a branch to a release.

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
- **CI must be green.** `backend` and `frontend` run lint, typecheck, tests, and module boundaries, path-filtered to `fastapi/**` and `frontend/**`; `security` runs semgrep + trivy on every PR.

## Review & Approval

This is currently a solo-maintained repo, so there is no `.github/CODEOWNERS` and no auto-requested reviewer: open the PR, let CI pass, and merge. If collaborators join, add `CODEOWNERS` and turn on "require review from Code Owners" for the default branch.

## Deploys & Releases

[release-please](https://github.com/googleapis/release-please) runs on every push to `main`. It reads the conventional commits since the last release and opens a release PR that bumps `version.txt` and `CHANGELOG.md`; the PR auto-merges, and the resulting tag publishes a GitHub Release. Publishing that release triggers `deploy-prod`, which builds the web bundle and deploys it to Cloudflare Pages.

Two things ship outside that flow:

- **PR previews** — apply the `deploy-preview` label to a PR to deploy a web-bundle preview.
- **Backend** — deploy Cloud Run from `fastapi/` with `make cloud-deploy` (not triggered by a release).

This is why commit hygiene matters: every commit on `main` is read by the release tooling.
