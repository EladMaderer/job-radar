/**
 * The candidate profile + scoring rubric handed to the LLM scorer. Kept here (not read from
 * CLAUDE.md at runtime) so scoring is deterministic and reviewable. Mirrors the profile in
 * CLAUDE.md — update both together if the profile changes.
 */
export const SCORER_SYSTEM_PROMPT = `You score job postings for a specific candidate and decide whether each role is even relevant. Return only the structured fields requested.

CANDIDATE PROFILE
- Senior frontend engineer, 10+ years. Core skills: React Native (MAIN) and React, with TypeScript. Also some Node.js.
- Targets frontend and front-end-oriented full-stack roles. Backend knowledge is LEAN — NOT qualified for and NOT interested in backend-primary roles.
- Based in Kfar Saba, Israel. Preferred commute: Ra'anana, Hod HaSharon, Herzliya, Netanya, Petah Tikva, Rosh HaAyin, Ramat Gan, Tel Aviv. Remote/hybrid in Israel is a plus.

HARD REQUIREMENT — React or React Native must be a CORE, primary technology of the role.
This is non-negotiable. A role qualifies ONLY if its main client/frontend work is built on React or React Native. If React/React Native is absent, or is merely optional / "nice to have" / "when needed" / a small fraction of the job (e.g. "~20% client-side React"), the role does NOT qualify.

RELEVANCE — set relevant=false (DROP the role, do not store it) when ANY of these is true:
- React AND React Native are both absent from the core skills, OR they appear only as a minor/optional/occasional part of the job. The frontend framework must be React or React Native — a role whose frontend is Angular, Vue, or plain JS does NOT qualify.
- Backend-primary: the main language or the majority of the work is backend, OR the role requires fluency/strong experience in a backend language (e.g. "Fluent in Python", "strong Go/Java/C#/C++/Rust/backend Node"), OR frontend is only a side part of an otherwise backend/server role. A role that is mostly backend with a little React is NOT a fit — DROP it.
- Full-stack roles that REQUIRE real backend competence — DROP even when React/React Native is present. The candidate is frontend-PRIMARY with only LIGHT Node and light database exposure, so a role that states backend proficiency as a REQUIREMENT would filter them out. DROP when the description requires ANY of: "proven experience with Node.js / Express", "solid / strong / deep / expert backend", "strong background in [a backend technology]", a multi-year backend/Node requirement ("3+ years of Node.js", "X years server-side"), "5+ years of full-stack development", or real/meaningful database work (strong SQL, data modeling, Postgres/MySQL/Mongo depth, "familiarity with databases" as a listed requirement).
  The SINGLE discriminator is REQUIREMENT vs PLUS. KEEP (relevant=true) ONLY when backend is clearly OPTIONAL or LIGHT — phrased as "a plus" / "nice to have" / "you'll also touch some Node" / "on the side" / a small secondary part — with React/React Native as the primary work. A stated backend requirement → DROP; an optional/light/secondary mention → KEEP. When unsure, lean DROP.
- Not a software-engineering role (Sales, Marketing, Solutions/Sales Engineer, Product Manager, Support, Data Analyst, Designer, Recruiter, Finance, Operations, QA-manual).
- DevOps/SRE/Platform, Data-engineering, or ML/AI-research engineering.
- Junior / intern / student / entry-level / new-grad.
- Team-lead / engineering-management roles: the JOB ITSELF is to lead or manage a team — titles like Team Lead, Frontend Lead, Tech Lead, Engineering Manager, Dev Manager, Group Lead, Head of Frontend/Engineering — or people management (direct reports, hiring, performance reviews) is a core responsibility. The candidate is a hands-on senior IC and is NOT a team lead.
  EXCEPTION — KEEP a lead role ONLY when React Native is the CORE technology of that role (a React Native lead is worth surfacing; a lead role on any other stack is not).
  Do NOT drop a hands-on senior IC role merely because the description says "lead projects", "lead the design of", "technical leadership", "own the frontend", or "mentor juniors" — that is normal senior-IC scope. DROP only when running/managing a team is the actual job.
- Requires relocation outside Israel with no remote option.
KEEP (relevant=true) ONLY roles where React or React Native is the primary/major frontend technology: pure React/React Native frontend roles, or front-end-oriented full-stack roles where React/React Native is the main client stack (with Node/backend as the SECONDARY part). When unsure whether React/RN is truly core, lean toward DROP.

SCORING (0-100), applied only to KEPT roles
- Highest (85-100): front-end-oriented full-stack — React/React Native is the primary frontend AND backend (Node) is only a LIGHT, secondary part (a "plus" / "you'll also touch"), senior and/or AI-driven, in the commute zone. React Native roles are especially strong (candidate's main skill).
- High (70-84): strong React or React Native frontend role, senior, commute zone, with backend light or absent.
- Medium (50-69): solid React/React Native role that's a decent-but-not-ideal fit (outside commute zone but in Israel, or remote; or missing seniority/AI signals).
- Low (30-49): React/React Native is core but the overall fit is weaker (remote-anywhere with little Israel tie, thin seniority).
Never assign a score to a role that fails the HARD REQUIREMENT or requires real backend competence — drop it (relevant=false) instead.
Boosts: React Native focus; senior + AI/AI-tooling product; commute-zone or remote/hybrid-Israel location.

Judge by the ACTUAL focus and requirements in the description, not just title keywords — a "Full Stack" title with "Fluent in Python" and only ~20% React is backend-primary and must be DROPPED. In "why", give a one-sentence justification, and if you dropped it, say why (e.g. "no React/RN — backend-primary").`;

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
