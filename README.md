# Iron ClawSweeper

Iron ClawSweeper is a conservative maintenance bot configuration for
[`nearai/ironclaw`](https://github.com/nearai/ironclaw). It is ported from the
OpenClaw ClawSweeper workflow, but this branch targets IronClaw by default while
keeping the existing Codex-based review runtime.

The bot keeps one markdown report per reviewed issue or pull request, can publish
one durable automated review comment when explicitly applying decisions, and only
closes items when the evidence is strong and the repository policy allows it.

## Current Scope

- Default target repository: `nearai/ironclaw`
- Default report slug: `nearai-ironclaw`
- Default target checkout directory: `ironclaw`
- Review runtime: Codex CLI (`codex exec`)
- Local agent support: project-local Pi settings in `.pi/settings.json`

The old OpenClaw/ClawHub generated dashboard was removed from this README to
avoid stale status. A fresh dashboard will be generated after the first IronClaw
sweep writes records under `records/nearai-ironclaw/`.

## Guardrails

ClawSweeper may propose a close only when the item is clearly one of these:

- implemented on current `main`
- not reproducible on current `main`
- duplicate or superseded by a canonical issue/PR
- concrete but not actionable in this source repo
- incoherent enough that no action can be taken
- stale issue older than the configured age floor with too little data to verify

Safety defaults:

- Review lanes are proposal-only. They do not comment or close.
- Maintainer-authored items are not auto-closed.
- Protected labels block auto-close: `security`, `beta-blocker`,
  `release-blocker`, `maintainer`.
- Issues with open PRs using closing syntax such as `Fixes #123` stay open until
  the PR is merged or closed.
- Open issue/PR pairs from the same author stay open together unless the paired
  item is already resolved or a maintainer explicitly asks to close one side.
- Apply re-fetches live GitHub state before any comment or close mutation.
- Snapshot or `updated_at` drift blocks apply unless the only change is the
  existing ClawSweeper review comment.
- Codex subprocesses do not receive GitHub, GitHub App, OpenAI, or Codex tokens
  through the environment.

Do not run live apply/close commands unless Firat explicitly asks.

## Repository Layout

- Main code: `src/clawsweeper.ts`
- Repository policy: `src/repository-profiles.ts`
- Review prompt: `prompts/review-item.md`
- Decision schema: `schema/clawsweeper-decision.schema.json`
- Tests: `test/clawsweeper.test.mjs`
- Sweep workflow: `.github/workflows/sweep.yml`
- Target dispatcher docs: `docs/target-dispatcher.md`
- Generated records: `records/<repo-slug>/items/<number>.md`
- Archived records: `records/<repo-slug>/closed/<number>.md`
- Scratch output: `.artifacts/`, `artifacts/`, `apply-report.json`

Preserve the flat `items/` and `closed/` report layout per repository slug. Do
not split reports into issue/PR subtrees.

## Requirements

- Node.js 24+
- pnpm 10+
- GitHub CLI (`gh`) for live GitHub reads/mutations
- Codex CLI for review runs in CI/local review mode
- A local checkout of `nearai/ironclaw` for review runs

Install dependencies:

```bash
cd /Volumes/NVME/iron-clawsweeper
pnpm install
pnpm run build
```

Optional local target checkout:

```bash
cd /Volumes/NVME
git clone --depth=1 https://github.com/nearai/ironclaw.git ironclaw
cd /Volumes/NVME/iron-clawsweeper
```

## Local Pi Usage

This repository includes project-local Pi settings in `.pi/settings.json`.
From the repo root, run `pi` to load `AGENTS.md` context, or use Pi print mode
for one-off maintenance prompts:

```bash
pi -p "Review the IronClaw ClawSweeper profile and identify rollout risks"
```

Pi is for local development assistance. The live sweeper runtime still uses
Codex unless the runtime is ported separately.

## Safe Dry-Run Testing

Use the review path for dry-runs. It writes local artifacts and does not comment,
close, or push.

### 1. Plan candidates only

```bash
GH_TOKEN="$CLAWSWEEPER_GH_TOKEN" pnpm run plan -- \
  --target-repo nearai/ironclaw \
  --batch-size 1 \
  --shard-count 1 \
  --max-pages 1 \
  --codex-model gpt-5.5 \
  --codex-reasoning-effort high \
  --codex-service-tier fast
```

### 2. Review one issue or PR without applying

Replace `123` with the target issue/PR number:

```bash
GH_TOKEN="$CLAWSWEEPER_GH_TOKEN" pnpm run review -- \
  --target-repo nearai/ironclaw \
  --target-dir /Volumes/NVME/ironclaw \
  --artifact-dir .artifacts/dry-run/reviews \
  --batch-size 1 \
  --max-pages 1 \
  --item-number 123 \
  --codex-model gpt-5.5 \
  --codex-reasoning-effort high \
  --codex-sandbox read-only \
  --codex-service-tier fast \
  --codex-timeout-ms 600000 \
  --readonly-openclaw \
  --shard-index 0 \
  --shard-count 1
```

Inspect local artifacts:

```bash
find .artifacts/dry-run/reviews -maxdepth 2 -type f | sort
cat .artifacts/dry-run/reviews/*.md
```

### 3. Import artifacts into a scratch record tree

```bash
rm -rf .artifacts/dry-run/records
mkdir -p .artifacts/dry-run/records/items .artifacts/dry-run/records/closed

GH_TOKEN="$CLAWSWEEPER_GH_TOKEN" pnpm run apply-artifacts -- \
  --target-repo nearai/ironclaw \
  --artifact-dir .artifacts/dry-run/reviews \
  --items-dir .artifacts/dry-run/records/items \
  --closed-dir .artifacts/dry-run/records/closed \
  --skip-dashboard \
  --skip-reconcile
```

This mutates only `.artifacts/dry-run/records`.

### 4. Audit scratch records

```bash
GH_TOKEN="$CLAWSWEEPER_GH_TOKEN" pnpm run audit -- \
  --target-repo nearai/ironclaw \
  --items-dir .artifacts/dry-run/records/items \
  --closed-dir .artifacts/dry-run/records/closed \
  --max-pages 1 \
  --sample-limit 25
```

## Commands That Can Mutate GitHub

Avoid these unless you intend to sync comments and/or close items:

```bash
pnpm run apply-decisions
pnpm run apply-decisions -- --sync-comments-only
```

`apply-decisions` does not currently have a true dry-run mode. Even
`--sync-comments-only` can create or update durable review comments. `--limit 0`
prevents closes, but it is not a safe no-op because comment syncing may still
happen.

## Applying Reviewed Decisions

Only run this after reviewing generated records and confirming live mutation is
intended:

```bash
GH_TOKEN="$CLAWSWEEPER_GH_TOKEN" pnpm run apply-decisions -- \
  --target-repo nearai/ironclaw \
  --limit 20 \
  --apply-kind all
```

Narrowing examples:

```bash
# One item only
pnpm run apply-decisions -- --target-repo nearai/ironclaw --item-number 123 --limit 1

# Issues only
pnpm run apply-decisions -- --target-repo nearai/ironclaw --apply-kind issue --limit 10

# Only sync comments, no closes — still mutates GitHub comments
pnpm run apply-decisions -- \
  --target-repo nearai/ironclaw \
  --sync-comments-only \
  --comment-sync-min-age-days 7 \
  --processed-limit 1000 \
  --limit 0
```

## GitHub Actions Setup

Required for Codex review shards:

- `OPENAI_API_KEY`: OpenAI API key used to log Codex in before review shards run.
- `CODEX_API_KEY`: optional compatibility alias; falls back to `OPENAI_API_KEY`.

GitHub API authentication options:

- `CLAWSWEEPER_GH_TOKEN`: fallback GitHub token for target scans, artifact publish
  reconciliation, comment sync, and closes when GitHub App credentials are not
  configured.
- `OPENCLAW_GH_TOKEN`: legacy compatibility fallback for existing deployments;
  prefer `CLAWSWEEPER_GH_TOKEN` for IronClaw.
- `vars.CLAWSWEEPER_APP_CLIENT_ID`: optional GitHub App client ID.
- `secrets.CLAWSWEEPER_APP_PRIVATE_KEY`: optional private key for the same app.

When app credentials are configured, workflows create short-lived installation
tokens for target repository reads and writes. When they are absent, the workflow
falls back to `CLAWSWEEPER_GH_TOKEN` or legacy `OPENCLAW_GH_TOKEN` where
supported.

Recommended permissions for app/PAT credentials:

- read access for target scan context
- write access to target repository issues and pull requests for apply/comment
  sync lanes
- optional Actions write on `serrrfirat/iron-clawsweeper` for dispatch or run
  cancellation flows

## Event Dispatcher

For lower latency on new/edited issues and PRs, install the dispatcher workflow
from [`docs/target-dispatcher.md`](docs/target-dispatcher.md) into
`nearai/ironclaw`.

The dispatcher sends a `repository_dispatch` event to this repository with the
exact target repo and item number. The receiver runs one review job for that item
and then checks the immediate-safe apply path.

## Checks

Run before handoff:

```bash
pnpm run check
```

This runs:

- TypeScript build
- oxlint
- Node unit tests
- formatting check

Formatting only:

```bash
pnpm run format
```

## Useful Live Probes

```bash
gh run list --repo serrrfirat/iron-clawsweeper --limit 20 \
  --json databaseId,displayTitle,status,conclusion,createdAt,updatedAt

gh api repos/serrrfirat/iron-clawsweeper/readme --jq '.content' | base64 --decode

gh api graphql -f query='query { repository(owner:"nearai", name:"ironclaw") { issues(states: OPEN) { totalCount } pullRequests(states: OPEN) { totalCount } } }'
```

## Development Notes

- Keep `src/clawsweeper.ts` orchestration narrow; put repository-specific policy
  in `src/repository-profiles.ts`.
- Review lane remains proposal-only. Do not reintroduce review-time closes.
- Preserve token stripping in `codexEnv()` when adding new credential names.
- Update tests when changing target defaults, apply policy, workflow fallbacks,
  or public comment text.
- Do not commit generated scratch output from `.artifacts/`, `artifacts/`, or
  local Pi sessions.
