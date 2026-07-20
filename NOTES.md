# NOTES — decision log

Every non-trivial choice, in the shape **Decision → Why → Trade-off**. Written in plain
language so it doubles as an interview script.

---

## Resume feature: simplified to text GUIDANCE (design-capture removed)

- **Decision:** Dropped the whole design-capture / tailored-PDF pipeline. The CV page now just holds
  the uploaded PDF + extracted text + a private context box. Each job page has one AI action —
  **"What should my resume emphasize?"** — that reads the JD against the resume text + context and
  returns a markdown brief (emphasize / cut / match-vs-gaps, honest). The user edits their own
  resume from it. Interview prep unchanged. Removed: capture/tailor/render/pdf services + endpoints,
  the content-JSON schema, `@sparticuz/chromium` + `puppeteer-core`, and (migration 010) the
  `resume` capture columns + `job_tailors` table; added `resume.resume_text` + `job_guidance`.
- **Why:** The user decided the exact-design tailored PDF was more machinery than they wanted — they'd
  rather get guidance and edit the resume themselves. This cut ~10 files, 2 heavy deps, and the whole
  Chromium/Vercel-render risk, while keeping what they actually use (resume knowledge + real-experience
  context feeding honest per-role advice).
- **Trade-off:** No more one-click design-matched resume download — the user hand-edits. Guidance is
  text only. The earlier capture notes below are historical (that pipeline no longer exists).

## Resume tailoring: one-time DESIGN CAPTURE, not PDF editing

- **Decision:** A PDF can't be reflow-edited, so instead of editing the file we capture its design
  ONCE: render pages to images in the browser, have Claude (vision) reconstruct the look as **CSS
  over a fixed HTML skeleton** and extract content as **structured JSON**. Per-job tailoring then
  edits only the content JSON and re-renders through the captured CSS — instant HTML previews and a
  real text-based PDF (via Chromium) on download.
- **Why:** Editing a PDF's baked-in, subsetted fonts/positioning in place is intractable. Splitting
  "design" (captured once) from "content" (tailored per job) gives near-original fidelity while
  keeping every tailored variant cheap and instantly previewable, and the download stays an
  ATS-parseable PDF (real text, not an image).
- **Trade-off:** Fidelity is "very close," not byte-identical; a redesigned resume needs a
  re-capture. Two-column layouts must fit their sidebar on page one (true of ~all resume templates).

## Resume: server-rendered preview HTML + fixed skeleton renderer

- **Decision:** The deterministic renderer (`src/services/resumeRender.ts`) lives server-side only;
  API responses ship the rendered `html`, and the client just sets a sandboxed `<iframe srcDoc>`.
- **Why:** Content only ever changes as the *result* of a server call (capture/refine/tailor), so
  the server can render once per mutation — no duplicated renderer across the Vite/Node boundary, no
  extra function. The iframe is `sandbox=""` because the CSS is LLM-generated (untrusted); Google
  Fonts still load inside srcDoc. Text is HTML-escaped and font links allowlisted to Google Fonts.
- **Trade-off:** Preview needs a round-trip per change — but we're already paying the LLM round-trip.

## Resume: cost-tiered models, all user-initiated

- **Decision:** Capture and tailoring use **Sonnet**, interview prep uses **Haiku** (env-overridable
  per task). Nothing runs automatically — every call is a button press.
- **Why:** The user pushed back hard on Opus cost. Only design capture is vision-hard and it runs
  once per upload; tailoring output goes to real employers (Haiku too risky for no-fabrication
  rewriting — Sonnet is the quality floor); prep is a plain text task Haiku handles. Realistic active
  month ≈ **$2**. A one-off `RESUME_CAPTURE_MODEL=claude-opus-4-8` re-capture (~$0.19) is the escape
  hatch if the design clone isn't faithful enough — it persists, so the premium is paid once.
- **Trade-off:** Sonnet capture may need a manual Opus re-capture on ornate templates.

## Resume: per-job tables carry snapshots, no FK to jobs

- **Decision:** `job_tailors` / `interview_preps` key on `job_id` with **no FK**, and snapshot
  company/title/url/**job_description**. `resume` is a single CHECK-(id=1) row (original PDF as BYTEA
  + captured design).
- **Why:** Jobs rows are deleted on manual re-baselines (`DELETE FROM jobs WHERE source=...`); a FK
  cascade would wipe tailoring work. Snapshotting the JD means chat turns keep working after the
  source job is gone.
- **Trade-off:** Mild duplication; a snapshot can drift from a re-posted job (acceptable — the
  tailoring is about the JD you saw).

## Resume: Chromium PDF isolated to one function; no-fabrication guardrails; chat stores summaries

- **Decision:** `@sparticuz/chromium` + `puppeteer-core` are imported ONLY by the download endpoint
  (`api/jobs/[id]/tailor/pdf.ts`) so the ~60MB binary stays out of the other 6 function bundles.
  Page size comes from the renderer's `@page` CSS via `preferCSSPageSize` (page.pdf rejects `pt`
  units). The tailor system prompt hard-forbids inventing employers/dates/skills/metrics. Chat
  history stores SUMMARIES only (never the content JSON), capped at 20, with the base resume + JD
  re-sent each call — flat cost as the chat grows.
- **Why:** Per-function dependency tracing keeps latency down; the money-goes-to-employers nature of
  the output makes the no-fabrication rules load-bearing; summary-only history bounds tokens.
- **Trade-off:** First PDF download pays ~2–4s Chromium cold-start; local dev needs `LOCAL_CHROME_PATH`
  (the Lambda binary can't run on macOS). Deploy needs `ANTHROPIC_API_KEY` in Vercel env + Fluid
  Compute on (for `maxDuration: 300`). SPA rewrite added to vercel.json so `/jobs/:id` deep-links work.

---

## LLM scoring credit safety — four layers + a hard per-run cap

- **Decision:** The LLM scorer's spend is bounded by four stacked guards, ordered so the cheapest
  filter runs first: (1) a **frontend pre-filter** drops obvious non-frontend roles for FREE (no
  API call) — ~95% of the board; (2) **only NEW jobs** are scored (dedup runs before scoring, and
  a scored row is never re-scored); (3) a **1,200-char description cap** + `max_tokens: 400` on
  Claude Haiku 4.5 bound each call to ~$0.0017; (4) a new **hard per-run call ceiling**
  (`MAX_LLM_SCORES_PER_RUN`, default 1500) past which jobs fall back to the free keyword scorer.
- **Why:** Enabling `SCORER=llm` + a re-baseline puts real (if small) money in the loop. A normal
  re-baseline is a few hundred calls (~$1); the concern is a *runaway* — a board bug or a discovery
  explosion returning tens of thousands of frontend jobs in one run. Layers 1–2 make steady-state
  trivially cheap; layer 4 caps the worst single run at ~$2.50 no matter what the boards return.
- **Trade-off:** If the cap ever trips, the overflow jobs get a keyword score (shown, possibly
  noisy) and dedup means they won't be LLM-re-scored later. Acceptable: the cap only fires in a
  runaway the user is meant to notice (it logs loudly) and fix by raising the env var + re-baseline.
- **Note:** Prompt caching wouldn't help here — the ~900-token system prompt is below Haiku's
  2,048-token cache minimum, so there's nothing to cache.

## Dashboard: infinite scroll (10/page), sort by publish date, hide stale postings

- **Decision:** The dashboard loads jobs in pages of 10 via infinite scroll (IntersectionObserver
  on a bottom sentinel, viewport root), defaults to sort by **publish date** (`posted desc`, newest
  first) instead of by score, and hides postings **older than 3 months by default** via a
  "Published within" filter (30d / 90d / 6mo / all-time). The server already supported
  `sort`/`order`/`limit`/`offset`; added `maxAgeDays` to `listJobs` + `fetchJobs offset`.
- **Why:** Loading all matches at once (previously `limit: 500`) doesn't scale and buries fresh
  roles under high-scoring old ones. Sort was first set to `firstSeen`, but after baseline-seeding
  every row shares one first-seen date, so it didn't order anything visibly — `posted` is the real
  recency signal a job-seeker reads by. And ATS boards keep evergreen reqs open for months/years
  (a real row showed a 2021 publish date); those aren't live openings, so hiding >90-day-old posts
  by default cut the list roughly in half (3999 → 2204 locally) and removed the stale noise.
- **Trade-off:** `posted_at` is source-reported, so an inaccurate board date could mis-rank or
  mis-hide a job; rows with an unknown post date are always kept (can't judge their age). The alert
  path is unaffected — a genuinely new posting will have a recent date; only the dashboard view
  filters by age.
- **Trade-off:** A running total still comes back with each page (an extra count query per fetch) —
  cheap, and it's what tells the client when to stop. An auto-fill loop was added because
  IntersectionObserver fires only on transitions: on a very tall viewport a single 10-row page
  wouldn't fill the screen, leaving no scrollbar to trigger the next load; after each page settles
  we re-check the sentinel's position and keep loading until it's below the fold. Mobile hides
  column headers (so no header-tap re-sort there), which is fine now that the default is the
  newest-first order I want anyway.

## Full-stack strictness — drop roles that DEMAND backend/DB depth the candidate lacks

- **Decision:** The LLM scorer now DROPS (`relevant=false`) a full-stack role — even one with React
  present — when it makes a hard requirement of backend depth the candidate doesn't have: a
  multi-year/seniority-grade Node.js/backend requirement ("3+ years Node.js", "strong/deep Node")
  or a meaningful/required database requirement ("strong SQL", "deep Postgres", data modeling,
  query optimization). A role that merely MENTIONS Node/DB as a plus or a light secondary part is
  still kept and scored normally.
- **Why:** The candidate is React/React-Native-primary with *some* Node.js and light DB exposure.
  A role gating on "3 years Node.js" or "significant DB experience" would filter the candidate out
  regardless of the React content — surfacing it is noise. The discriminator is a hard/quantified
  REQUIREMENT vs a mention.
- **Trade-off:** Borderline wording ("solid Node.js a plus") leans toward KEEP, so a few
  backend-leaning full-stack roles still slip through; better than dropping genuine FE-oriented
  full-stack roles that list Node as a secondary skill. Verified live: 3-yr-Node and strong-DB
  roles drop; Node-as-a-mention and pure React Native keep (score 88).

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

## TheirStack: switched to the PAID tier — tuned for recall, not budget (2026-07)

- **Decision:** Subscribed to the paid API tier (1,500 credits/month + 200 base, ~$47 with 20%
  off; credits roll over 12 months). Reconfigured for coverage: **dropped the seniority
  pre-filter**, **broadened the title list** (React/frontend-focused, RN-weighted; + Fullstack,
  Web, UI, Mobile — still not bare "Software Engineer"), **cron every 2h** (Sun–Thu 08:00–18:00,
  Fri 08:00–12:00, no Sat), **60-day backfill**, bigger pages (limit 200, up to 20 pages), overlap
  trimmed 1h→30m, and the credit guard raised to 1,400.
- **Why:** The free tier forced compromises that missed real roles (the Clover Senior Frontend
  Engineer). Measured (blurred probes): broader titles + no seniority filter ≈ 334 credits/month —
  ~22% of 1,500. TheirStack's seniority tags are unreliable (it mislabels senior roles), so the LLM
  scorer — which already drops juniors and weights React Native highest — is the better judge.
  Cadence is nearly free (watermark), so every 2h just means fresher alerts.
- **Trade-off:** Paying permanently ends free-tier eligibility (their policy: "the free plan is
  only for users who have never paid") — so this is a keep-until-you-land decision, not reversible.
  Broader titles pull some native-mobile/backend-web noise, but the frontend pre-filter drops it
  for free and the LLM filters the rest. The notes below document the earlier free-tier design and
  are kept for history — several of their budget constraints no longer apply.

## One-off rescore tool: recalibrate existing rows without re-fetching

- **Decision:** `npm run rescore` (+ a manual `rescore.yml` workflow) re-scores every currently-
  relevant row through the CURRENT scorer and overwrites its fit_score/why/relevant. Guarded to
  `SCORER=llm`; supports `RESCORE_DRY_RUN=1` (preview) and `RESCORE_LIMIT=N` (test subset).
- **Why:** The poller scores each job exactly once (dedup) to avoid re-billing, so a scoring-rubric
  change only affects NEW jobs — the existing dashboard goes stale. Re-scoring in place costs ~1 LLM
  call per relevant row but ZERO TheirStack credits (no re-fetch), so it's the cheap way to apply a
  new rubric (e.g. the backend-depth cap) to what's already stored.
- **Trade-off:** Manual, one-off, never scheduled (re-running re-spends LLM credits). `remote`/
  `countryCode` aren't persisted columns, so they're defaulted on reconstruction — fine, the LLM
  reads the `location` string. Only rows that still have a description (the relevant ones) can be
  re-scored; already-dropped lean rows are gone. A row can flip to irrelevant and drop off.

## Scoring: DROP full-stack roles that REQUIRE backend competence (requirement vs plus)

- **Decision:** A full-stack role is DROPPED (relevant=false) when it states real backend competence
  as a REQUIREMENT — "proven experience with Node.js/Express", "solid/strong/deep backend", "strong
  background in [a backend technology]", a multi-year Node/backend requirement, "5+ years of
  full-stack development", or real database work. It's KEPT and scored normally ONLY when backend is
  a PLUS / optional / "you'll also touch some Node" / "on the side" / a light secondary part, with
  React/RN primary. The single discriminator is REQUIREMENT vs PLUS.
- **Why:** User feedback, iterated. First pass capped these at ~50 and kept them visible; the user
  then said the Autofleet "Senior Full Stack Developer" (proven Node/Express + 5-yr full-stack + DB
  familiarity) should be GONE, not just ranked low — a role that requires backend proficiency
  filters out a frontend-primary candidate, so it's not a real fit. Cap → drop.
- **Trade-off:** Aggressive by design ("when unsure, lean DROP"), so an occasional React-primary
  role that lists Node in a requirements bullet without "plus" framing may be dropped. Acceptable —
  the candidate wants only genuine frontend-first roles. Only affects NEWLY-scored jobs; run
  `npm run rescore` to apply it to what's already stored. Verified live: Autofleet & Palo Alto drop;
  RN/React with Node-as-a-plus keep at 92/88; pure React keeps at 78.

## TheirStack: credit guard keyed by billing period, not calendar month (P0-1)

- **Decision:** The credit meter is keyed by billing-period start (`period_start` 'YYYY-MM-DD'),
  computed from `THEIRSTACK_BILLING_CYCLE_DAY` (default 16), not the calendar month. Migration 007
  renames the column and carries the old free-tier row into the current period as a conservative,
  clearly-flagged-unverified floor.
- **Why:** The paid plan renews on the 16th. The old calendar-month key (`'YYYY-MM'`) would reset to
  0 on the 1st while TheirStack kept counting the 16th→16th window — the guard would show green with
  half the period's spend already gone, and could blow the real cap. Cycle day capped at 1–28 so
  every month has it (no Feb-29/31 edges).
- **Trade-off:** The carried-over 167 predates the paid plan, so it's approximate — the run log
  prints `credits: <used>/<budget> for period <start> → <end>` so it can be reconciled against
  TheirStack's dashboard and corrected. Assumes a fixed monthly anniversary (not a 30-day rolling
  window); fine for standard plans.

## TheirStack: loud guard when the LLM scorer isn't actually on (P0-2)

- **Decision:** `runTheirStackCycle()` emits a loud `::warning::` if `SCORER !== 'llm'`, and
  `getScorer()` emits a loud `::error::` if `SCORER=llm` but `ANTHROPIC_API_KEY` is missing (was a
  quiet `console.warn`). README documents the two settings (a *variable* `SCORER=llm` + a *secret*).
- **Why:** The paid TheirStack query dropped the seniority/precision filter on the premise the LLM
  judges relevance. But `keywordScorer` never drops a role (`relevant:true` always), so if the LLM
  isn't live the source stores unfiltered noise — a silent, whole-design-breaking failure. The
  variable-vs-secret split (SCORER is a repo *variable*, easy to forget) makes this an easy misstep.
- **Trade-off:** Warns but does not block — a run with the keyword scorer still stores rows (as
  before); we surface the problem loudly rather than halt. The ATS poller's keyword default is
  untouched (it must stay free).

## TheirStack: budget guard is now a hard per-run cap, not just a pre-check (P2-2)

- **Decision:** `fetchTheirStackJobs(watermark, maxCredits)` takes the remaining period budget and
  stops paginating before a page would exceed it (trimming the final page's `limit`), logging a
  `::warning::` when it truncates. `runTheirStackCycle` passes `budget - used`.
- **Why:** The guard only refused to *start* an over-budget run; it never limited a run's *size*.
  With limit 200 × 10 pages a single run could fetch up to 2,000 jobs = 2,000 credits — a backfill
  started mid-period could sail past the cap in one go. The cap makes overspend structurally
  impossible.
- **Trade-off:** A truncated run leaves some matching jobs unfetched this period; they're caught
  after the next reset (the watermark only advanced over what was actually fetched). Acceptable — a
  hard money ceiling beats complete coverage in a runaway.

## TheirStack: broad "Software Engineer" titles behind an off-by-default flag (P1)

- **Decision:** `THEIRSTACK_BROAD_TITLES` (default **false**) adds `Software Engineer`,
  `Software Developer`, `Senior Software Engineer` to the query — A/B-able via env, no code change.
- **Why:** The base query uses ~22% of the 1,400 budget; the paid tier was bought for recall, and
  "Software Engineer" is exactly the generic title that hides React roles. But it's also the noisiest,
  so it's gated: only worth enabling with the LLM strainer confirmed live (else see P0-2).
- **Trade-off:** More credits and more LLM-rejected rows when on; kept off by default so nothing
  changes until deliberately enabled. After a week on, report credits/jobs/relevant-count to judge
  the recall-vs-cost trade with real numbers.

## TheirStack: jobs/search consumes NO company credits — nothing to guard (P2-1)

- **Decision:** No company-credit guard or enrichment-exclusion param added. Instead, log unique
  companies per run and keep surfacing any credit/quota response headers.
- **Why:** Verified against the API docs: `jobs/search` bills **1 API credit per job returned and
  nothing else** — company credits belong to the separate company-search/technographics endpoints.
  There is **no** parameter to omit `company_object` (only `blur_company_data`, which is the free
  *preview* blur, useless for ingestion). So the embedded company enrichment is free; the original
  worry was unfounded.
- **Trade-off:** None — we can't exclude `company_object` even if we wanted to, but there's no cost
  to it. The per-run unique-company log gives visibility if TheirStack ever changes billing.

## TheirStack: credits are per JOB RETURNED — design around incremental fetch

- **Decision:** Add TheirStack as a second, market-wide source with an incremental fetch: each run
  passes `discovered_at_gte` derived from our own watermark (latest `first_seen_at` for the
  source, minus 1h overlap), so each job is returned — and billed — roughly once. First run (no
  watermark) uses a short 2-day posted-age window as a silent baseline seed.
- **Why:** The original plan assumed credits were per REQUEST (130 requests/month < 200 credits).
  TheirStack actually bills **1 API credit per job returned** (verified in their docs) — a single
  `limit:50` call can burn a quarter of the free tier, and re-querying a time window pays for the
  same jobs repeatedly. Incremental fetch makes cadence nearly free; only genuinely-new jobs cost.
- **Trade-off:** If the per-run page cap is ever hit, jobs beyond it in that window can be missed
  permanently (the watermark advances past them) — with the tight filters this needs >100 new
  matching IL jobs in 4h, which the budget guard would be tripping on anyway.

## TheirStack: accurate credit meter (count returned, not stored; survive re-baselines)

- **Decision:** Track credits in a dedicated `theirstack_usage(month, credits)` table, incremented
  by the number of jobs **returned** each run (= actual credits). The monthly guard reads this,
  not a count of stored job rows. Keyed by calendar month (UTC); seeded once with the ~167 already
  spent in 2026-07.
- **Why:** The original guard counted `jobs` rows first-seen this month — but TheirStack bills per
  job **returned** (some get location-filtered before storage), and its balance **doesn't reset
  when we delete rows**. So after the re-baseline the guard read "116/180, plenty" while TheirStack
  was actually at 167/200 and emailed a 70%-usage warning. Counting returned jobs in a table that
  survives deletes fixes both blind spots.
- **Trade-off:** Assumes TheirStack resets on the calendar 1st; if the plan resets on a signup
  anniversary the meter can be off near the boundary (over-conservative = lose some coverage, which
  is the safe direction). A run that partially fails mid-pagination under-counts slightly. The
  reconciliation seed (167) is approximate — small drift vs the real balance is acceptable.

## TheirStack: first-run window is 30 days (capture the open backlog, not just fresh posts)

- **Decision:** The first run (fresh seed / no watermark yet) uses a **33-day** posted-age window
  (measured ~116 jobs, safely under the 5-page / 125-job cap), and the page cap is the free-tier
  max of 5. Ongoing runs still use 14 days via the watermark. Re-seed = delete the source's rows so
  the watermark resets, then trigger the workflow.
- **Why:** The first run is the ONLY chance to capture roles that were already open when we started
  — the incremental watermark only sees jobs discovered *after* run #1. The original 2-day window
  (chosen to save credits on a "silent seed") meant the entire standing backlog of open jobs was
  invisible forever. A real miss surfaced it: a correctly-tagged "Senior Frontend Engineer" at
  Clover Security (Tel Aviv, posted 30 days before our first run) never appeared, because TheirStack
  had it but our 2-day window skipped it and the watermark then excluded it permanently. 30 days ≈
  an open role's useful shelf-life and ≈110 credits with the seniority filter — fits the 200/month
  free tier as a one-time cost.
- **Trade-off:** A fresh seed now costs ~110 credits instead of ~11, so two re-baselines in one
  month could approach the 180 monthly guard. Rare (re-baselines are deliberate), and the guard is
  the safety valve. Roles posted >30 days ago but still open remain uncatchable — accepted, since
  "currently open + recently posted" is the useful set for a job search.

## TheirStack: server-side seniority filter is the budget lever

- **Decision:** Query with `job_seniority_or: ['senior','staff','c_level']`, titles without
  "Software Engineer", `job_country_code_or: ['IL']`, and `company_name_not` = our registry
  companies. Hard monthly guard: skip runs after 180 stored TheirStack jobs/month.
- **Why:** Measured with free blurred probes: all seniorities ≈ 136 matching jobs/14d
  (~300–450/month — double the 200-credit free tier); senior/staff ≈ 52/14d (~110/month, inside
  budget). Mid-level is the excluded bulk — acceptable for a senior 10+ yrs profile whose scoring
  disqualifies junior roles anyway. Excluding registry companies means never paying for jobs the
  free ATS poller already catches.
- **Trade-off:** Mid-level and unclassified-seniority TheirStack roles are missed (the ATS poller
  still covers every seniority at its ~105 companies for free). If TheirStack misclassifies a
  senior role, we miss it silently.

## TheirStack: company credits & blur mode (the prompt's investigation, answered)

- **Decision:** No special handling for company credits; use `blur_company_data: true` only as a
  free sizing probe, never for ingestion.
- **Why:** Verified in TheirStack's docs and live headers: the 50 monthly company credits are
  consumed by the separate company-search/technographics endpoints (3 credits each) — the
  `company_object` embedded in job results does NOT consume them. Blur mode is free but blurs
  company name, job URL AND description — useless for real ingestion, perfect for zero-cost query
  sizing (that's how the seniority numbers above were measured). Responses expose request-rate
  headers only (4/s, 10/min, 50/h, 400/day), no credit balance — our per-run "jobs returned ≈
  credits" log plus the monthly DB count is the burn meter.
- **Trade-off:** Credit balance isn't directly observable via API; the DB-derived meter undercounts
  by the overlap re-fetches (~1h window), which is noise at this scale.

## Per-source baseline (replaces the global empty-table check)

- **Decision:** Baseline-seeding is now per-source: a job whose `source` has no rows yet is stored
  pre-marked alerted (silent). `sendPendingAlerts` runs unconditionally in every cycle.
- **Why:** The old global check (`countJobs() === 0`) meant a NEW source added to an
  already-populated DB would alert on all its pre-existing jobs — TheirStack's first run would
  have fired ~20 stale Telegram pings. Per-source, any future source gets the same silent
  first-seed behavior automatically.
- **Trade-off:** None for existing behavior (all current sources have rows, so the ATS path is
  unchanged). A deliberately re-baselined single source (delete its rows) re-seeds silently, which
  is the desired semantics.

## Cross-source duplicate alerts: exclude server-side, suppress fuzzily as backup

- **Decision:** Registry companies are excluded from TheirStack queries (`company_name_not`), and
  a residual fuzzy check (normalized company+title match against other sources) stores — but never
  alerts — duplicates that slip through under company-name variants.
- **Why:** TheirStack indexes Greenhouse/LinkedIn, so the same role can arrive via both pipelines;
  without this the user gets two Telegram pings hours apart for one job. Server-side exclusion
  also saves credits (never pay for jobs the ATS poller fetches free).
- **Trade-off:** The fuzzy match (prefix-tolerant company equality + exact title) can rarely
  suppress a legitimately different job with an identical title at a similarly-named company —
  the row is still stored and visible in the dashboard, only the ping is suppressed.

## Slug channel in the keyword scorer

- **Decision:** When a job carries curated `technology_slugs` (TheirStack), they drive the
  frontend/sweet-spot/backend-primary signals at title-grade confidence; text matching remains the
  fallback for slug-less jobs and for what slugs can't answer (AI, seniority-in-title). Slug rule
  for penalties: backend-primary fires only when backend slugs appear WITHOUT any frontend slug.
  Source-provided seniority maps directly: 'senior' → bonus, 'junior' → disqualifier.
- **Why:** Structured tags beat regexing prose. But a `python` tag alongside `react`+`nodejs` is
  normal for FE-oriented full-stack — penalizing it would sink exactly the sweet-spot roles the
  scorer exists to surface.
- **Trade-off:** When slugs exist they fully decide backend-primary, so a slug-tagged job whose
  description screams backend but whose tags include react won't be penalized — acceptable, since
  tags come from TheirStack's extraction of the same description.

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

## Jobs that stop accepting applications -> `halted` status

- **Decision:** A posting that is no longer accepting applications gets the job status **`halted`**
  (migration 012) and stays **visible** on the dashboard, where it can be overridden by hand. It is
  detected two ways, routed by URL: LinkedIn postings are checked on LinkedIn's public guest page
  (`src/sources/linkedin.ts`), everything else via TheirStack's `closed_at`. Jobs that start
  accepting again go back to `new`. The TheirStack fetch also sends `is_closed: false` so
  already-closed postings never enter at all.
- **Why:** TheirStack's `closed_at` does NOT reflect LinkedIn's "No longer accepting applications" —
  measured: all 11 stored jobs had `closed_at=null` while 3 of them were plainly closed on LinkedIn.
  LinkedIn's public page is the only place that state lives, and it is free to read. The first cut
  *hid* these rows, but silent disappearance is bad UX and hard to trust — a visible status you can
  see and correct is better, and it doubles as a manual triage state.
- **Trade-off:** Only `new`/`interested` jobs are auto-halted — once you've applied/interviewed, or
  manually moved a job off `halted`, your status wins and is never overwritten. The LinkedIn check
  returns `unknown` on any block/error and then never halts (fail-open, so a datacenter IP block
  can't mass-halt the board). GitHub Actions runners may well be blocked by LinkedIn; if the log
  shows `all unknown — IP likely blocked`, LinkedIn detection is dead there and only TheirStack's
  weaker `closed_at` signal remains.

## The scorer was reading only the first 1200 chars of a description

- **Decision:** Raise the scored slice of a description from 1,200 to 8,000 chars, and when a
  posting is still longer, send the **head AND the tail** (with an `[…]` marker) instead of a
  head-only slice. `trimDescriptionForScoring()` in `src/constants/profile.ts`.
- **Why:** Job postings put company boilerplate FIRST and requirements LAST, so a head-only cut
  systematically hides the exact text that decides fit. Measured: **90% of stored jobs (3,630/4,036)
  were being truncated**, median length ~3,000, p90 7,340. A real miss — Unframe "Full Stack
  Software Engineer" — had "Proficiency with JavaScript, Node.js, Vue\React and PostgreSQL" at
  char 1,482, past the cutoff, so it scored as a frontend fit on its intro alone. With the full
  text the scorer drops it as backend-primary. 8,000 covers ~90% of postings whole; head+tail
  guarantees the requirements survive on the rest.
- **Trade-off:** More input tokens per scored job — ~$0.002/job on Haiku 4.5, well under a dollar
  a month at this volume, which is nothing against the cost of a wrong alert. Jobs already scored
  keep their old verdicts until the `rescore` workflow is run (scoring is deliberately once-per-job
  so the LLM is never re-billed on a normal cycle).

## Free-text status note on a job

- **Decision:** A job carries a short `status_note` (migration 013, `VARCHAR(30)`) — a free-text
  line under the status picker, e.g. why a role was rejected. Shown in both places the picker
  appears (the list row and the detail page) via one `StatusNoteInput` component. It saves on blur
  or Enter, never per keystroke.
- **Why:** The status alone ("rejected") loses the reason, which is the part worth remembering when
  looking back over weeks of applications. 30 chars keeps it a label rather than a journal, so it
  stays scannable in a table cell.
- **Trade-off:** The cap is enforced in three places — `maxLength` on the input, a 400 in the API,
  and `VARCHAR(30)` in the DB. Redundant on purpose: the UI limit is a convenience, and the API is
  the real authority since it's reachable directly. Like `status`, the note is user-owned and the
  poller never writes it.

## Telegram notice when a job reopens

- **Decision:** When a `halted` job starts accepting applications again, send a Telegram message
  naming the jobs with links. Sent ONLY when there is at least one reopen — never a per-run summary.
  New matches are deliberately excluded (they already get their own alert). Added `sendNotice(text)`
  to the `Notifier` interface, implemented by both the Telegram and console notifiers.
- **Why:** A reopen is the one state change nothing else surfaces — the job quietly returns to the
  dashboard and you'd never know to look. On the hourly Sun–Thu schedule a per-run summary would be
  ~11 mostly-empty messages a day, which trains you to ignore the channel.
- **Trade-off:** Best-effort, unlike job alerts. There's no pending flag for a notice, so a failed
  send is logged and dropped rather than retried — the status change itself is already committed and
  visible on the dashboard, so the worst case is a missed ping, not lost data.
