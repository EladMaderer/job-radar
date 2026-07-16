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

## LLM scorer (Phase 3): Claude Haiku 4.5 behind the Scorer interface

- **Decision:** Add an LLM scorer (Claude Haiku 4.5, structured output) that reads each job against
  the candidate profile and returns `{ score, why, relevant }`. `relevant: false` drops the role
  entirely (non-engineering, backend-primary, DevOps/junior). Selected via `getScorer()`:
  LLM when `ANTHROPIC_API_KEY` is set, else the keyword scorer; a per-job try/catch falls back to
  keyword on any API error. Only NEW jobs are scored — updates never re-score.
- **Why:** Keyword scoring hit its ceiling — it scored a backend-heavy "Payments" role 78 (found
  "full stack"/"react" in the body) and kept non-engineering roles like "Solutions Consultant". An
  LLM reads role focus and the candidate's lean-backend qualification, which keywords can't. Haiku
  is cheap enough (~20¢ to score 100 jobs once, then pennies) that per-job scoring is fine.
  Scoring only new jobs and never re-scoring on update bounds cost to genuinely new roles.
- **Trade-off:** Adds a paid API dependency (separate from any Claude Code subscription) and network
  latency to the poll (baseline run scores every job sequentially — slower but one-time). Mitigated:
  keyword fallback keeps it working (and free) if the key is absent or the API fails. Scores set at
  first sight aren't refreshed if the description later changes materially — acceptable.

## Scorer fix: drop bare `go` from the backend-primary keywords

- **Decision:** Remove `'go'` from `BACKEND_PRIMARY_KEYWORDS`; keep `'golang'` and add the explicit
  phrases `'go developer'`, `'go engineer'`, `'go backend'`.
- **Why:** Word boundaries stop `go` from hitting "good"/"golang", but NOT "go live",
  "go-to-market", "ready to go", "go above and beyond" — all common in ordinary frontend
  descriptions. Each false hit applied a description-weighted −25 to a role I actually want, quietly
  mis-ranking good jobs. (Confirmed empirically: `matchesKeyword('go live','go')` was true.)
- **Trade-off:** A posting that says only "Go" (no "Golang"/"Go developer") for a genuinely
  backend-Go role won't be penalized. Rare, and far better than penalizing frontend roles.

## Scorer fix: drop `api` from the full-stack sweet-spot signal

- **Decision:** Remove `'api'` from `BACKEND_SIGNAL_KEYWORDS` (keep node/backend/server-side/
  microservices/full-stack).
- **Why:** Almost every pure-frontend description says "consume REST APIs", so `hasBackendSignal`
  was true for nearly every role and the +20 FE-oriented-full-stack sweet spot fired for
  *everything* — erasing the exact ranking distinction it exists to make (React+Node should beat
  pure React).
- **Trade-off:** A full-stack role that mentions only "API" (never Node/backend/server-side) misses
  the sweet-spot bonus. Uncommon; the base +40 still applies.

## Scorer fix: bare `lead` → specific lead-role phrases

- **Decision:** Remove bare `'lead'` from `SENIOR_KEYWORDS`; use `'team lead'`, `'tech lead'`,
  `'engineering lead'`, `'group lead'` instead.
- **Why:** `lead` matched body text like "lead the effort" / "leading a project", awarding false
  seniority points to non-senior roles.
- **Trade-off:** A title like "Lead Frontend Engineer" no longer gets the +15 seniority (the words
  "lead" and "engineer" aren't adjacent). Minor — "Senior"/"Sr." still catch most senior roles, and
  seniority is only a +15 nudge on top of the frontend + location signal.

## Scorer audit: punctuation keywords already match (no code change)

- **Decision:** After auditing `scoring/match.ts`, leave the boundary logic as-is; lock it with a
  test asserting every keyword matches itself and that `c++`/`c#`/`.net`/`sr.`/`node.js` match real
  usage.
- **Why:** The concern was that `\b`-style boundaries fail on punctuation (`\bc\+\+\b`). But the
  matcher uses lookbehind/lookahead (`(?<![a-z0-9])…(?![a-z0-9])`), not `\b`, so punctuation-bearing
  terms match correctly — verified empirically for all of them. "Fixing" working code would have
  been the real risk.
- **Trade-off:** `.net` still won't match inside "asp.net" (leading `.` is preceded by a letter);
  acceptable — standalone ".NET" matches, and the test documents the behavior.

## Scorer safety: keyword scorer is the default; LLM is explicit opt-in

- **Decision:** `getScorer()` returns the keyword scorer unless `SCORER=llm` is set explicitly
  (dropped the old `auto` mode that enabled the LLM whenever an API key was present). Env default is
  `keyword`; the poll workflow reads `SCORER` from a repo variable (empty → keyword).
- **Why:** The LLM scorer costs real money (one Anthropic call per new job; a baseline run is
  hundreds of calls). Enabling it merely because a key exists risks a surprise bill on the first
  run. Cost must be an explicit choice.
- **Trade-off:** After this change, production silently used keyword scoring until `SCORER=llm` is
  set — a deliberate, safe default. Re-enabling the LLM is a one-line repo-variable change.

## Scorer tests (node:test, no new dependency)

- **Decision:** Add `src/scoring/keywordScorer.test.ts` (run via `npm test` → `tsx --test`) asserting
  the ranking both directions (React+Node > pure React > backend-heavy "full stack"), that "go
  live"/"go-to-market"/"REST API" neither penalize nor trigger the sweet spot, and a keyword-integrity
  audit (every keyword matches itself — catches any that could never match).
- **Why:** These scoring rules are subtle and easy to regress silently; the false-firing bugs above
  shipped unnoticed. Tests lock the intended behavior.
- **Trade-off:** Uses Node's built-in test runner (no Jest/Vitest dependency), so features are
  minimal — fine for pure-function scorer tests. Test files live under `src` so `npm run build`
  compiles them into `dist` (harmless; dist isn't deployed — production runs source via tsx).

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

## Alerting decoupled from storage (alerted_at), failed sends retry

- **Decision:** Add `alerted_at` to `jobs`. A new job is stored immediately with
  `alerted_at = NULL` ("owed an alert"); it's set to `now()` only after its Telegram message
  actually sends. Each cycle scans for un-alerted, above-threshold jobs and sends them; a send
  failure is logged, left pending, and retried next cycle — never fatal, never lost. A cycle
  where *every* alert failed exits non-zero (likely misconfig → red in Actions); partial/no
  failures stay green.
- **Why:** The original design marked a job "seen" on insert and sent alerts in the same step. A
  single failed send (e.g. a wrong Telegram chat id) crashed the whole run AND, because the job
  was already stored, it never re-alerted — the alert was silently lost forever. Found this the
  hard way while wiring up Telegram. Decoupling makes alerts durable and self-healing.
- **Trade-off:** One extra column and a per-cycle "pending" query (indexed, trivial). Baseline
  seed and pre-existing rows are backfilled `alerted_at = now()` so they never ping retroactively.

## Auto-discovery: probe the whole ATS universe, not a hand-typed list

- **Decision:** A weekly `discover` job fetches the public universe of Greenhouse/Lever board slugs
  (~8k + ~4k, from a Common-Crawl-derived public list), probes each for Israel-based roles, and
  writes the hits to `registry/discovered.json`. The registry merges that with the hand-curated
  list (curated wins on dup slug for nicer names). A GitHub Actions workflow re-runs it weekly and
  commits the refreshed file, so newly-launched boards appear with zero manual editing.
- **Why:** A hardcoded 40-company list can't scale to Israel's ~8k hi-tech companies and never
  self-updates. Probing the actual slug universe found ~113–129 Israeli Greenhouse/Lever boards —
  3× the manual list AND the complete set for those two ATSes — and keeps finding new ones over
  time. Names come free from Greenhouse's `company_name`; Lever names are prettified from the slug.
- **Trade-off:** It's a heavy job (~12k public probes, ~6 min) — hence weekly and out of the poll
  cycle. It depends on a third-party slug list (if it vanishes, discovery finds nothing new but the
  committed registry keeps working). It only covers Greenhouse/Lever — Comeet (hidden uid),
  SmartRecruiters (gated API), and Workday (per-tenant) can't be auto-discovered, so those stay
  manual/curated. This is the honest ceiling: ~130 companies, not 8,000 — full market coverage
  needs a paid job-data aggregator, which the ATS-polling design deliberately avoids.

## Comeet adapter: parse the hosted page, not the API

- **Decision:** Poll Comeet companies by fetching the public Comeet-hosted careers page
  (`comeet.com/jobs/{company}/{uid}`) and parsing the `COMPANY_POSITIONS_DATA = [ ... ];` array
  embedded in the HTML. Registry slug is `company/uid`. Since the list has no free-text
  description, synthesize one from department/level/employment/workplace fields.
- **Why:** Comeet's clean JSON positions API requires a per-company server-side token that
  companies don't expose (the API returns "Token is missing"). The hosted page embeds the full
  positions array with no token, so it's the only reliable free source. The embedded array is a
  stable, structured JSON blob — more robust than scraping rendered DOM.
- **Trade-off:** Parsing a JS array out of HTML is more brittle than a documented JSON API (a
  Comeet page-format change could break it) — mitigated by a clear error if the marker is
  missing, and the per-company try/catch keeps one broken board from killing the cycle. No
  per-job description (list payload lacks it); scoring leans on the title + structured fields.
  Adding a Comeet company needs its `company/uid`, read from the company's careers-page links.

## Registry growth: 6 -> 28 companies, verified before adding

- **Decision:** Grew the seed from 6 to 28 by probing candidate Greenhouse/Lever/Comeet boards
  and keeping only those that return live Israel-based roles.
- **Why:** Six companies is a thin funnel; the user compared it to LinkedIn's breadth. More
  companies is the highest-leverage change for coverage.
- **Trade-off:** This is a curated watchlist, not a crawler — it can't discover small/new
  companies, and can't match a full aggregator (LinkedIn/Indeed). That's an inherent limit of
  the ATS-per-company design; the tool's value is precise, free, instant alerts for chosen
  companies. More boards also means a longer poll and (with LLM scoring) a larger baseline cost,
  both bounded by parallelism and scoring-only-new-jobs.

## Per-request retry on ATS fetches

- **Decision:** `fetchJson` retries a couple of times with linear backoff (20s timeout each).
- **Why:** DoubleVerify's Greenhouse board (fetched with `?content=true`) intermittently
  exceeded a single 15s timeout and got dropped for a whole cycle. A retry makes a slow board a
  non-event; the per-company try/catch is still there as the last line of defense.
- **Trade-off:** A genuinely-down board makes a run take a little longer before giving up. Bounded
  by the Action's 10-minute `timeout-minutes`.

## Local Postgres on host port 5433

- **Decision:** docker-compose maps Postgres to host `5433`, not `5432`.
- **Why:** This machine already runs a native Postgres on `5432`; mapping there meant the app
  silently connected to the wrong database (missing role). `5433` sidesteps the clash.
- **Trade-off:** One more thing to remember locally. Production (Neon) is unaffected — it uses a
  full connection string.

## Phase 2 dashboard: Vercel + shared-password auth, same Neon DB

- **Decision:** The dashboard is a React+Vite SPA (`web/`) plus Vercel serverless functions
  (`api/`) that reuse the existing `pg` repository layer and read/write the same Neon DB the
  poller uses. Access is one shared password sent as a Bearer token (stored in localStorage).
- **Why:** Vercel's free tier hosts the static app and Node functions together with no CORS
  setup; Node functions can import our `src/repositories` directly, so no duplicated DB code.
  A single password is enough for a one-person tool and avoids a third-party auth dependency.
  Splitting a DB-only config (`config/db.ts`) means the API needs just `DATABASE_URL`, not the
  poller's Telegram vars.
- **Trade-off:** A bearer token in localStorage is vulnerable to XSS (acceptable for a private,
  single-user dashboard with no third-party scripts). No per-user accounts or audit — out of
  scope. Vercel and GitHub Actions are two independent deployments sharing one database.

## Local dev server for Vercel functions

- **Decision:** `scripts/devApi.ts` (`npm run dev:api`) mounts the real Vercel handlers on a
  plain Node HTTP server at :3000; Vite proxies `/api` to it.
- **Why:** Running Vercel functions locally otherwise needs the Vercel CLI + login. This keeps
  local dev fully offline and dependency-light — the same handler code runs locally and in prod.
- **Trade-off:** The tiny adapter re-implements the sliver of the Vercel req/res contract we use
  (`query`, `body`, `status()`, `json()`). If a handler starts using more of the Vercel API,
  the adapter must grow to match.

## ESM + NodeNext modules

- **Decision:** `"type": "module"`, TypeScript `module: NodeNext`, relative imports carry `.js`
  extensions.
- **Why:** It's the current Node standard; native `fetch` and modern tooling (tsx) assume it.
- **Trade-off:** The `.js`-extension-in-TS-imports convention looks odd at first sight, but it's
  spec-correct and `tsc`/`tsx` both enforce/support it.
