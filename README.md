# jobs-radar

Personal job-search radar. Polls Israeli tech companies' ATS job boards (Greenhouse, Lever),
detects new frontend / FE-leaning full-stack roles as they publish, scores them against my
profile, and alerts me on Telegram — running entirely on free infrastructure (GitHub Actions
schedule + Neon Postgres).

**Pipeline:** poll ATS boards → normalize → dedup via DB → store → score → Telegram alert.

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

> Note: some corporate networks block `api.telegram.org`. If a local send times out, the
> pipeline still works — it will send fine from the GitHub Actions runner.

## Deployment (free, no card)

1. Create a free Postgres database at [neon.tech](https://neon.tech); copy its connection string.
2. Create a GitHub repository and push this repo. **Make it public** — public repos get
   unlimited free Actions minutes (private repos have a monthly cap; if you keep it private,
   widen the cron to every 30–60 min).
3. In the repo: Settings → Secrets and variables → Actions, add:
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DATABASE_URL` (the Neon string), `SCORE_THRESHOLD`.
4. The workflow in `.github/workflows/poll.yml` runs on schedule; trigger it once manually
   (Actions tab → poll → Run workflow) to baseline-seed and verify.

### Honest caveats

- Scheduled Actions are best-effort: runs can start a few minutes late.
- GitHub disables scheduled workflows after ~60 days without repo activity — an occasional
  commit keeps it alive.

## Project docs

- [CLAUDE.md](CLAUDE.md) — profile, stack, and engineering standards.
- [NOTES.md](NOTES.md) — decision log (Decision → Why → Trade-off) for every non-trivial choice.
