/**
 * Scoring weights and keyword sets, all in one place so tuning is a data edit, not a code change.
 *
 * Keywords are matched with word boundaries (see scoring/match.ts), so `ai` won't hit "email",
 * `go` won't hit "good", and `java` won't hit "javascript". Matching runs over the title (full
 * weight) and description (reduced weight).
 *
 * Net ranking goal: FE-oriented full-stack (React + Node) > pure React > backend-heavy "full stack".
 */

export const WEIGHTS = {
  frontend: 40, // React / React Native / frontend / full-stack signal
  fullStackSweetSpot: 20, // frontend-specific AND backend signal => my ideal profile
  senior: 15,
  ai: 15,
  commuteLocation: 15, // in my commute zone, or remote/hybrid in Israel
  backendPrimaryPenalty: -50, // backend-primary, DevOps/SRE/data-eng, Angular-only, junior/intern
} as const;

/** A description-only match counts for this fraction of the title weight (title is curated signal). */
export const DESCRIPTION_WEIGHT_FACTOR = 0.5;

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
 * awards false seniority points; use the specific lead-role phrases instead.
 */
export const SENIOR_KEYWORDS = [
  'senior',
  'sr.',
  'staff',
  'principal',
  'team lead',
  'tech lead',
  'engineering lead',
  'group lead',
];

export const AI_KEYWORDS = [
  'ai',
  'a.i.',
  'artificial intelligence',
  'machine learning',
  'ml',
  'llm',
  'genai',
  'gen ai',
  'generative',
  'gpt',
  'copilot',
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
