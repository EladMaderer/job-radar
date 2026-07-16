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

/** Backend/full-stack signal — combined with frontend-specific signal => the sweet spot bonus. */
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
  'api',
  'server-side',
  'microservices',
];

export const SENIOR_KEYWORDS = [
  'senior',
  'sr.',
  'staff',
  'principal',
  'lead',
  'team lead',
  'tech lead',
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
 * Boundary matching keeps `java` off "javascript" and `go` off "good"/"golang" (which is
 * listed explicitly).
 */
export const BACKEND_PRIMARY_KEYWORDS = [
  'backend engineer',
  'back-end engineer',
  'backend developer',
  'back-end developer',
  'backend-focused',
  'golang',
  'go',
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
