import { COMEET_SOURCE } from '../ats/comeet.js';
import { GREENHOUSE_SOURCE } from '../ats/greenhouse.js';
import { LEVER_SOURCE } from '../ats/lever.js';

/**
 * Scoring weights and keyword sets, all in one place so tuning is a data edit, not a code change.
 *
 * Keywords are matched with word boundaries (see scoring/match.ts), so `ai` won't hit "email",
 * `go` won't hit "good", and `java` won't hit "javascript". Matching runs over the title (full
 * weight) and description (reduced weight).
 *
 * Net ranking goal: React Native (mobile) > FE-oriented full-stack (React + Node) ≈ pure React >
 * backend-heavy "full stack". AI is deliberately NOT a signal.
 */

export const WEIGHTS = {
  frontend: 40, // React / React Native / frontend / full-stack signal
  fullStackSweetSpot: 20, // frontend-specific AND backend signal => my ideal profile
  reactNative: 20, // the candidate's main skill — pushes an RN role to the top of the ranking
  senior: 15,
  commuteLocation: 15, // in my commute zone, or remote/hybrid in Israel
  backendPrimaryPenalty: -50, // backend-primary, DevOps/SRE/data-eng, Angular-only, junior/intern
} as const;

/** A description-only match counts for this fraction of the title weight (title is curated signal). */
export const DESCRIPTION_WEIGHT_FACTOR = 0.5;

/**
 * `why` text for rows dropped WITHOUT an LLM judgment. The revive pass (rescore.ts) matches on
 * these to tell them apart from LLM drops, so each string must live in exactly one place.
 */
export const DROP_WHY = {
  prefilter: 'no frontend/React signal (pre-filter, no LLM call)',
  location: 'not in Israel / remote-anywhere with no Israel tie (location re-check)',
  duplicate: 'duplicate posting (same title + description) — hidden by dedup',
} as const;

/**
 * Rescore's revive window: LLM-dropped rows first seen within this many days are forgotten so the
 * next poll re-scores them under the current rubric. Older roles are likely filled.
 */
export const REVIVE_DROPS_WITHIN_DAYS = 30;

/**
 * Sources that re-list EVERY open job on each poll, so a forgotten row is re-fetched as new. Only
 * these may be revived — TheirStack is incremental and would never return a forgotten row.
 */
export const RELISTING_SOURCES = [GREENHOUSE_SOURCE, LEVER_SOURCE, COMEET_SOURCE] as const;

export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

/**
 * How many new jobs to score concurrently. LLM scoring is a network round-trip per job, so a
 * baseline run (every job new) is dominated by that latency; scoring in parallel cuts it from
 * minutes to seconds. Kept modest to stay well under API rate limits.
 */
export const SCORE_CONCURRENCY = 5;

/** Frontend signal — earns the base +40. */
export const FRONTEND_KEYWORDS = [
  'frontend',
  'front-end',
  'front end',
  'react native',
  'react-native',
  'react',
  'full stack',
  'full-stack',
  'fullstack',
];

/** Frontend-SPECIFIC signal (excludes the ambiguous full-stack terms) — used to detect the sweet spot. */
export const FRONTEND_ONLY_KEYWORDS = [
  'frontend',
  'front-end',
  'front end',
  'react native',
  'react-native',
  'react',
  'vue',
  'next.js',
  'nextjs',
];

/**
 * Backend/full-stack signal — combined with frontend-specific signal => the sweet spot bonus.
 * NOTE: `api` is deliberately excluded — nearly every pure-frontend description says "consume
 * REST APIs", which would make the sweet spot fire for everything and destroy the ranking it
 * exists to make. Only real server-side signals belong here.
 */
export const BACKEND_SIGNAL_KEYWORDS = [
  'node',
  'node.js',
  'nodejs',
  'backend',
  'back-end',
  'back end',
  'full stack',
  'full-stack',
  'fullstack',
  'server-side',
  'microservices',
];

/**
 * Seniority signal. Bare `lead` is excluded — it matches body text like "lead the effort" and
 * awards false seniority points.
 *
 * Lead-ROLE phrases ('team lead', 'tech lead', …) are deliberately NOT here: the candidate is a
 * hands-on senior IC, not a team lead, so a lead title is a negative, not a seniority boost.
 * See LEAD_ROLE_KEYWORDS below.
 */
export const SENIOR_KEYWORDS = ['senior', 'sr.', 'staff', 'principal'];

/**
 * Team-lead / engineering-management ROLE titles. Not a fit — the candidate is a hands-on senior
 * IC — UNLESS the role is specifically React Native, so the penalty is waived when React Native is
 * present (mirrors the EXCEPTION in the LLM scorer's prompt). Phrases only, never bare `lead`,
 * which matches ordinary body text like "lead the effort".
 */
export const LEAD_ROLE_KEYWORDS = [
  'team lead',
  'tech lead',
  'engineering lead',
  'group lead',
  'frontend lead',
  'front-end lead',
  'engineering manager',
  'development manager',
  'dev manager',
  'head of frontend',
  'head of engineering',
];

/**
 * Backend-PRIMARY signal — dominates even when the title says "full stack".
 * Bare `go` is excluded: word boundaries stop "good"/"golang" but NOT "go live", "go-to-market",
 * "ready to go", "go above and beyond" — all common in frontend descriptions, each of which would
 * wrongly apply the backend penalty. Match `golang` and explicit `go <role>` phrases instead.
 */
export const BACKEND_PRIMARY_KEYWORDS = [
  'backend engineer',
  'back-end engineer',
  'backend developer',
  'back-end developer',
  'backend-focused',
  'golang',
  'go developer',
  'go engineer',
  'go backend',
  'java',
  'python',
  'c++',
  '.net',
  'c#',
  'rust',
  'scala',
  'kotlin',
  'ruby',
  'php',
];

/**
 * Curated technology-slug sets (TheirStack `technology_slugs`). Slugs are structured metadata —
 * when present they beat regexing prose, so the scorer consults them first.
 */
export const FRONTEND_SLUGS = ['react', 'react-native', 'reactjs', 'nextjs', 'next-js', 'vue'];

/**
 * React Native signal — the candidate's MAIN skill, and the sole waiver for the lead-role penalty
 * (a React Native lead is the one lead role worth surfacing).
 */
export const REACT_NATIVE_KEYWORDS = ['react native', 'react-native', 'reactnative'];
export const REACT_NATIVE_SLUGS = ['react-native', 'reactnative'];
export const BACKEND_SIGNAL_SLUGS = ['nodejs', 'node-js', 'node', 'express'];
export const BACKEND_PRIMARY_SLUGS = [
  'golang',
  'go',
  'java',
  'python',
  'c-sharp',
  'csharp',
  'dotnet',
  'c-plus-plus',
  'cpp',
  'rust',
  'scala',
  'kotlin',
  'ruby',
  'php',
];

/** Other disqualifying signals => penalty. */
export const NEGATIVE_KEYWORDS = [
  'devops',
  'sre',
  'site reliability',
  'data engineer',
  'data engineering',
  'angular',
  'junior',
  'intern',
  'internship',
  'student',
  'entry level',
  'entry-level',
];
