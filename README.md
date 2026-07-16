# jobs-radar

Personal job-search radar. Polls Israeli tech companies' ATS job boards (Greenhouse, Lever),
detects new frontend / FE-leaning full-stack roles as they publish, scores them against my
profile, and alerts me on Telegram — running entirely on free infrastructure (GitHub Actions
schedule + Neon Postgres).

**Pipeline:** poll ATS boards → normalize → dedup via DB → store → score → Telegram alert.

Watches **~130 Israeli tech companies** across Greenhouse, Lever, and Comeet — a hand-curated seed
plus an **auto-discovery** step. `npm run discover` probes the public universe of Greenhouse/Lever
board slugs (~12k), keeps every board with Israel-based roles, and writes them to
[src/registry/discovered.json](src/registry/discovered.json); a weekly workflow re-runs it and
commits new boards, so the list self-updates. The registry merges the discovered set with the
curated one in [src/registry/companies.ts](src/registry/companies.ts) (add a company manually with
a one-line `{ name, ats, slug }` — Comeet's slug is `company/uid`). Honest ceiling: auto-discovery
covers Greenhouse/Lever only (~130 companies) — Comeet/SmartRecruiters/Workday can't be enumerated
for free, so this stays a broad-but-not-exhaustive radar, complementing a site like LinkedIn.

There's also a **web dashboard** (Phase 2) to browse the full job history and manage application
status — a React app + serverless API on Vercel, reading the same Neon database. See
[Dashboard](#dashboard-phase-2).

## How it runs

There is no server. A GitHub Actions scheduled workflow runs `npm run poll` — a stateless
one-shot cycle — every ~20 minutes. Postgres (Neon free tier in production, Docker locally)
is both the job history and the "seen" memory, so dedup works across stateless runs.

## Local development

```bash
docker compose up -d      # local Postgres 16 on :5432
cp .env.example .env      # fill in values (see comments in the file)
npm install
npm run migrate           # apply SQL migrations
npm run poll              # one poll cycle, then exit
npm run start             # local-only: cron loop every POLL_INTERVAL_MIN
```

The first run against an empty DB **baseline-seeds**: it stores everything currently on the
boards and sends no alerts. Alerts fire only for jobs that appear after that.

> **Corporate network note.** Some networks (e.g. Zscaler) intercept TLS with their own root
> CA, which Node's `fetch` won't trust by default — job-board fetches fail with
> `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, and `api.telegram.org` may be blocked outright. For local
> runs behind such a proxy, point Node at a CA bundle that includes the corporate root:
> `NODE_EXTRA_CA_CERTS=/path/to/corp-roots.pem npm run poll`. None of this affects production —
> the GitHub Actions runner has a clean network and needs no such setup.

## Deployment (free, no card)

1. Create a free Postgres database at [neon.tech](https://neon.tech); copy its connection string.
2. Create a GitHub repository and push this repo. **Make it public** — public repos get
   unlimited free Actions minutes (private repos have a monthly cap; if you keep it private,
   widen the cron to every 30–60 min).
3. In the repo: Settings → Secrets and variables → Actions, add:
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DATABASE_URL` (the Neon string), and
   `SCORE_THRESHOLD` (e.g. `45` — jobs scoring at or above it trigger an alert).
4. The workflow in `.github/workflows/poll.yml` runs on schedule and applies migrations first.
   Trigger it once manually (Actions tab → poll → Run workflow) — this **first run
   baseline-seeds**: it stores everything currently on the boards and sends **no** alerts.
   Every run after that alerts only on roles that appear later. So expect silence on run #1;
   that's correct, not a failure.

### LLM scoring (Phase 3, optional)

By default jobs are scored by a free keyword scorer. To score with **Claude Haiku 4.5** instead
— which reads each role's actual focus and drops non-engineering / backend-primary roles the
keyword scorer can't judge — set an Anthropic API key:

1. Create a key at [console.anthropic.com](https://console.anthropic.com) and add a few dollars of
   credit (this is pay-as-you-go, separate from any Claude Code subscription). Scoring ~100 jobs
   once costs roughly 20¢; ongoing cycles are pennies.
2. Add `ANTHROPIC_API_KEY` to your GitHub Actions secrets (and local `.env` for local runs).

Only **new** jobs are LLM-scored; already-seen jobs are never re-scored. If the key is unset or a
call fails, it falls back to the keyword scorer automatically. To apply the new scoring to jobs
already in the DB, re-baseline: `DELETE FROM jobs;` in Neon, then run the workflow — the next run
re-seeds every current role with LLM scores and drops the irrelevant ones.

### Honest caveats

- Scheduled Actions are best-effort: runs can start a few minutes late.
- GitHub disables scheduled workflows after ~60 days without repo activity — an occasional
  commit keeps it alive.

## Dashboard (Phase 2)

A web dashboard to browse every stored job and manage status (Applied / Interested / Rejected /
Interview). It's a React + Vite SPA (`web/`) plus Vercel serverless functions (`api/`) that read
and update the same Neon DB the poller writes to. Access is gated by a shared password.

- `GET /api/jobs` — list with filters (`status`, `minScore`, `search`, `sort`, `order`, paging).
- `PATCH /api/jobs/:id` — update a job's status.
- Both require `Authorization: Bearer <DASHBOARD_PASSWORD>`.

### Run the dashboard locally

Two terminals (Postgres from `docker compose up -d` should be running, migrations applied):

```bash
npm run dev:api                 # serves the API functions on http://localhost:3000
cd web && npm install && npm run dev   # Vite dev server; it proxies /api to :3000
```

Open the Vite URL, sign in with the `DASHBOARD_PASSWORD` from your `.env` (`localdev` by default).

### Deploy to Vercel (free)

1. Create a project at [vercel.com](https://vercel.com) and import this GitHub repo. Vercel reads
   `vercel.json` — it builds the `web/` app and serves the `api/` functions automatically.
2. In the Vercel project → Settings → Environment Variables, add:
   - `DATABASE_URL` — the same Neon connection string used by the poller.
   - `DASHBOARD_PASSWORD` — a strong password (this is what you log in with).
3. Deploy. The dashboard is your Vercel URL; the API lives under `/api` on the same domain (so no
   CORS setup needed).

> The poller (GitHub Actions) and the dashboard (Vercel) are independent deployments that share
> one Neon database. Neither needs the other running.

## Project docs

- [CLAUDE.md](CLAUDE.md) — profile, stack, and engineering standards.
- [NOTES.md](NOTES.md) — decision log (Decision → Why → Trade-off) for every non-trivial choice.
