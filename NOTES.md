# NOTES — decision log

Every non-trivial choice, in the shape **Decision → Why → Trade-off**. Written in plain
language so it doubles as an interview script.

---

## Serverless one-shot poller on GitHub Actions (no server)

- **Decision:** The poller is a stateless script (`npm run poll`) that does one full cycle and
  exits, triggered by a GitHub Actions scheduled workflow — no always-on server.
- **Why:** The hosting constraint is 100% free forever. Free always-on compute doesn't really
  exist; free scheduled compute does (GitHub Actions). A polling job is a natural fit: it has
  no inbound traffic, so nothing needs to be "up" between runs.
- **Trade-off:** No in-process memory between runs — "have I seen this job?" must live in the
  database. Scheduled Actions can also fire a few minutes late, and GitHub pauses schedules
  after ~60 days of repo inactivity. Acceptable for a personal radar; the DB-as-memory design
  is actually more robust (survives restarts and machine changes).

## The database is the dedup memory (and the only state)

- **Decision:** A job is "new" iff its `(source, external_id)` pair is not already in Postgres.
  Every run compares fetched jobs against the DB, inserts the unseen ones, and updates the rest.
- **Why:** Each scheduled run is a fresh process, so state must be external. The DB is already
  there for history/dashboard, so it doubles as the seen-set — one source of truth, no extra
  moving parts (no Redis, no state files).
- **Trade-off:** Every cycle does a read per company batch. At this scale (hundreds of rows) it's
  negligible.

## Baseline-seed on first run (no alert flood)

- **Decision:** If the `jobs` table is empty when a cycle starts, insert everything currently
  on the boards as a silent baseline — zero alerts that cycle. Alerts only fire for jobs that
  appear *after* we started watching.
- **Why:** With DB-based "new" detection, the very first production run would classify every
  pre-existing role as new and fire dozens of Telegram messages at once — noise, not signal.
- **Trade-off:** If a genuinely interesting job was posted five minutes before the first-ever
  run, it lands in the DB but doesn't ping. It's still browsable in the data; one-time cost.

## Thin fetch client for Telegram instead of telegraf

- **Decision:** Send alerts with a ~30-line client calling the Bot API `sendMessage` endpoint
  via Node's native `fetch`. No telegraf.
- **Why:** Phase 1 is send-only. telegraf's value is inbound update handling (commands,
  long-polling/webhooks) which a one-shot serverless script can't use anyway. A URL button on
  the message needs no listener, so "Apply" works without any bot runtime.
- **Trade-off:** If a later phase wants interactive bot commands, telegraf gets added then.
  Deliberately not installing it now (YAGNI).

## Plain SQL migrations + a tiny runner (no migration library)

- **Decision:** Numbered `.sql` files in `/migrations`, applied in order by a ~40-line runner
  that records applied names in a `schema_migrations` table.
- **Why:** One table to start; a library (node-pg-migrate etc.) adds a dependency and DSL for
  functionality we can write transparently in a few lines. For a portfolio project, showing
  the mechanism is a feature.
- **Trade-off:** No down-migrations and no lock coordination. Fine for a single-user DB written
  by one scheduled job; revisit if the schema churns.

## Keyword scorer v1 behind a Scorer interface

- **Decision:** Score with transparent keyword rules over title + description (title at full
  weight, description at ~half), weights in a config object, behind a `Scorer` interface.
- **Why:** Deterministic, free, debuggable — the `why` string falls out of the matched rules.
  The interface means the Phase 3 LLM scorer is a drop-in swap, not a rewrite. Title matches
  weigh more because titles are curated signal; descriptions catch what titles hide (an "AI"
  React role titled "Software Engineer", a Go-heavy role titled "Full Stack").
- **Trade-off:** Keywords miss nuance (e.g. "no React experience required" reads as a React
  match). Accepted for v1; the threshold only gates pings, and the full set is stored.

## Store every relevant job, threshold only gates alerts

- **Decision:** Persist every job that passes the base filter (Israel / remote-friendly, not
  clearly foreign) with its score — not just those above SCORE_THRESHOLD. Never delete rows;
  updates preserve `first_seen_at` and `status`.
- **Why:** The Phase 2 dashboard needs history to browse and re-filter. If we only stored
  alerted jobs, changing the threshold later couldn't resurface past roles.
- **Trade-off:** More rows (still trivial). Delisted jobs are detected via `last_seen_at`
  going stale rather than deletion — which is a dashboard feature, not a cost.

## SCORE_THRESHOLD lowered from 60 to 45

- **Decision:** Set the starting alert threshold to 45.
- **Why:** Sanity-check against the weights: a plain "Frontend Developer, Tel Aviv" scores
  ~55 (40 base + 15 location) — a 60 threshold silently drops it. 45 starts inclusive;
  tightening later is a one-character `.env`/secret change.
- **Trade-off:** A few more pings at first. Better than silently missing real matches.

## ESM + NodeNext modules

- **Decision:** `"type": "module"`, TypeScript `module: NodeNext`, relative imports carry `.js`
  extensions.
- **Why:** It's the current Node standard; native `fetch` and modern tooling (tsx) assume it.
- **Trade-off:** The `.js`-extension-in-TS-imports convention looks odd at first sight, but it's
  spec-correct and `tsc`/`tsx` both enforce/support it.
