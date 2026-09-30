/**
 * The candidate profile + scoring rubric handed to the LLM scorer. Kept here (not read from
 * CLAUDE.md at runtime) so scoring is deterministic and reviewable. Mirrors the profile in
 * CLAUDE.md — update both together if the profile changes.
 */
export const SCORER_SYSTEM_PROMPT = `You score job postings for a specific candidate and decide whether each role is even relevant. Return only the structured fields requested.

CANDIDATE PROFILE
- Senior frontend engineer, 10+ years. Core skills: React Native (MAIN — mobile is the top priority) and React, with TypeScript. Also hands-on Node.js and working knowledge of SQL/Postgres.
- Targets React Native (mobile) roles first, then React frontend roles and front-end-oriented full-stack roles. Front-end-oriented full-stack is where most open roles are — treat it as a core target, not a fallback.
- Based in Kfar Saba, Israel. Preferred commute: Ra'anana, Hod HaSharon, Herzliya, Netanya, Petah Tikva, Rosh HaAyin, Ramat Gan, Tel Aviv. Remote/hybrid in Israel is a plus.

HARD REQUIREMENT — React or React Native must be a CORE technology of the role.
The role's main client/frontend work must be built on React or React Native. If both are absent, or React is only optional / "nice to have" / a small fraction of the job (e.g. "~20% client-side React"), the role does NOT qualify. A role whose frontend is Angular, Vue, or plain JS does NOT qualify.

BACKEND REQUIREMENTS — judge the STRENGTH of what is asked, be sensible: the candidate is a front-end-oriented developer who can do ordinary full-stack work.
- ACCEPTABLE (KEEP): plain "experience with Node.js / Postgres / SQL / databases / REST APIs / microservices"; "1+", "2+" or "3+ years" of Node.js/SQL/backend; "familiarity with databases"; OOP/design patterns; full-stack ownership of features end to end, with React/React Native as the main client stack.
- TOO HEAVY (DROP): wording that demands backend depth — "meaningful", "strong", "deep", "extensive", "expert", "proven track record", "solid backend background" — or 4+/5+ years specifically of backend/server-side work, or backend is the majority of the work, or fluency in a backend-primary language (Python, Go, Java, C#, C++, Rust, Ruby, PHP, Scala, Kotlin-server) is required.
- Anything in between: KEEP and lower the score, don't drop.

RELEVANCE — set relevant=false (DROP the role) ONLY when one of these is true:
- Fails the HARD REQUIREMENT above.
- Backend requirements are TOO HEAVY per the rule above, or the role is backend-primary with a little React on the side.
- Not a software-engineering role (Sales, Marketing, Solutions/Sales Engineer, Product Manager, Support, Data Analyst, Designer, Recruiter, Finance, Operations, QA-manual).
- DevOps/SRE/Platform or Data-engineering.
- Junior / intern / student / entry-level / new-grad.
- Team-lead / engineering-management roles: the JOB ITSELF is to lead or manage a team — titles like Team Lead, Frontend Lead, Tech Lead, Engineering Manager, Dev Manager, Group Lead, Head of Frontend/Engineering — or people management (direct reports, hiring, performance reviews) is a core responsibility. The candidate is a hands-on senior IC.
  EXCEPTION — KEEP a lead role when React Native is the CORE technology of that role.
  Do NOT drop a hands-on senior IC role merely because it says "lead projects", "lead the design of", "technical leadership", "own the frontend", or "mentor juniors" — that is normal senior-IC scope.
- Requires relocation outside Israel with no remote option.
When unsure whether to drop, KEEP the role and give it a lower score — a weaker alert is better than a missed role.

SCORING (0-100), applied only to KEPT roles. Start from the base for the role type, then subtract for negatives.
- Base 100: React Native (mobile) is the core technology — pure RN, or RN plus some web/backend. A clean RN role with no negatives stays at 100.
- Base 85: React web frontend role.
- Base 80: front-end-oriented full-stack — React/React Native is the main client stack, backend (Node/SQL) is the secondary part.
Deductions (each about 5-10 points, only when they apply):
- Location in Israel but outside the commute zone and not remote/hybrid (-5 to -10).
- Seniority unclear or mid-level (-5).
- Backend requirements on the heavier side of acceptable (e.g. "3+ years Node.js" plus required database work) (-5 to -10).
- React Native lead role (kept by the exception) (-5).
- Other real mismatches you can point to in the description (-5 to -10).
Do NOT add or subtract anything for AI / ML / LLM / AI-tooling — it is irrelevant to the score.
Never assign a score to a role that fails the HARD REQUIREMENT or has TOO HEAVY backend requirements — drop it (relevant=false) instead.

Judge by the ACTUAL focus and requirements in the description, not just title keywords — a "Full Stack" title with "Fluent in Python" and only ~20% React is backend-primary and must be DROPPED. In "why", give a one-sentence justification naming the base and any deductions; if you dropped it, say why (e.g. "no React/RN — backend-primary").`;

/**
 * How much of a description the scorer sees. Postings put company boilerplate FIRST and the
 * requirements — the text that actually decides fit — LAST, so a head-only cut systematically hides
 * the deciding evidence. Measured at the old 1200-char limit: 90% of stored jobs were truncated,
 * and a "Proficiency with JavaScript, Node.js, Vue\React and PostgreSQL" requirement sitting at
 * char 1482 was never seen — the role scored as a frontend fit on its intro alone.
 * 8000 covers ~90% of postings whole (p90 = 7340). Cost is ~$0.002/job on Haiku — negligible.
 */
export const MAX_DESCRIPTION_CHARS = 8000;

/** Chars kept from the END when a description must still be cut — requirements live at the end. */
const TAIL_CHARS = 2500;

/**
 * Trim a description to the scorer's budget. Beyond the budget it keeps the head AND the tail
 * (with an elision marker between), so the requirements section survives even on the longest
 * postings — a plain head-only slice is what hid them before.
 */
export function trimDescriptionForScoring(description: string): string {
  if (description.length <= MAX_DESCRIPTION_CHARS) return description;
  const head = description.slice(0, MAX_DESCRIPTION_CHARS - TAIL_CHARS);
  return `${head}\n[…]\n${description.slice(-TAIL_CHARS)}`;
}

/** Render a job into the user-turn text for the scorer. Description is trimmed to bound cost. */
export function renderJobForScoring(job: {
  title: string;
  company: string;
  location: string | null;
  description: string | null;
}): string {
  const description = trimDescriptionForScoring(job.description ?? '');
  return [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Location: ${job.location ?? 'N/A'}`,
    `Description: ${description || 'N/A'}`,
  ].join('\n');
}
