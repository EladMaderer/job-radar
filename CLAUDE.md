# job-radar — Engineering Standards & Context

## What this is
A personal job-search radar: it polls Israeli tech companies' ATS job boards, detects new
frontend / front-end-oriented full-stack roles as they publish, scores them against my
preferences, and notifies me on Telegram immediately. It also stores match history and
tracks application status. It's both a daily tool and a portfolio project — build it clean.

## Who I am (used for job matching)
- Senior frontend engineer, 10+ yrs: React Native (main skill) / React / TypeScript, plus Node.js.
- Front-end-oriented full-stack — I target frontend and FE-leaning full-stack roles.
- Based in Kfar Saba, Israel. Commute preferred zone: Ra'anana, Hod HaSharon, Herzliya, Netanya,
  Petah Tikva, Rosh HaAyin, Ramat Gan, Tel Aviv. Remote/hybrid in Israel is a plus.
- Boost: senior + AI-driven / AI-tooling product roles.
- Downrank/skip: pure backend, Go/Java/Python-primary, DevOps/SRE/Data-eng, Angular-only,
  junior/intern/student, roles requiring relocation abroad.
- Skip team-lead / engineering-manager roles (I'm a hands-on senior IC, not a lead) — UNLESS the
  role is specifically React Native. "Lead the project" wording in a senior IC role is fine.

## Tech stack
- Node.js + Express + TypeScript (strict), PostgreSQL via `pg` (raw SQL, no ORM),
  `node-cron`, Telegram via `telegraf`, `dotenv`, optional `zod` for env validation.
- Frontend (later phase): React + Vite + TypeScript.

## Architecture & code standards
- Layered: **route → service → repository**. Thin routes (HTTP only), logic in services,
  all SQL in repositories.
- Config from `.env`, validated at boot — fail fast with a clear message. `.env.example`
  committed; real `.env` git-ignored. Never commit secrets.
- One central Express error middleware. Never leak stack traces to responses.
- Strings/constants in dedicated files, never hardcoded inline.
- Small, single-purpose files and functions. Meaningful names. Named exports by default.
- TypeScript strict; ESLint + Prettier enforced. Prefer the boring, standard solution.
- No premature abstraction — extract when used twice or when I ask.

## How to work with me
- **Small steps.** Propose the next step with 1–3 sentences of reasoning, then wait for my
  confirmation. Never generate a whole feature in one shot.
- **Explain trade-offs** as you go (why this approach vs. the alternative).
- **Keep NOTES.md** — a decision log in the shape **Decision → Why → Trade-off** for every
  non-trivial choice. I use it as an interview script, so write it in plain language.
- **Ask before adding libraries** beyond the stack above.
- If I make a mistake, point it out briefly instead of silently fixing it.

## Current phase
Phase 1 (MVP): poll ATS boards → normalize → dedup → store → score → Telegram alert on new
matches. No web UI yet. When it works end to end (a real Telegram message from a real board),
stop and we'll plan Phase 2.