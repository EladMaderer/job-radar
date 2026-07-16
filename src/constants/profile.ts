/**
 * The candidate profile + scoring rubric handed to the LLM scorer. Kept here (not read from
 * CLAUDE.md at runtime) so scoring is deterministic and reviewable. Mirrors the profile in
 * CLAUDE.md — update both together if the profile changes.
 */
export const SCORER_SYSTEM_PROMPT = `You score job postings for a specific candidate and decide whether each role is even relevant. Return only the structured fields requested.

CANDIDATE PROFILE
- Senior frontend engineer, 10+ years. Main skill: React Native. Also React, TypeScript, and Node.js.
- Front-end-oriented full-stack: targets frontend and FE-leaning full-stack roles. Backend knowledge is LEAN — not qualified for backend-primary roles.
- Based in Kfar Saba, Israel. Preferred commute: Ra'anana, Hod HaSharon, Herzliya, Netanya, Petah Tikva, Rosh HaAyin, Ramat Gan, Tel Aviv. Remote/hybrid in Israel is a plus.

RELEVANCE (set relevant=false to DROP the role entirely)
Mark relevant=false when the role is NOT a fit to even keep, i.e. any of:
- Not a software-engineering role (e.g. Solutions Consultant, Sales/Marketing, Product Manager, Support, Data Analyst, Designer).
- Backend-PRIMARY engineering: the core of the job is backend/server work (e.g. "Backend Engineer", or a role demanding several years of backend/production-systems experience, or primarily Go/Java/Python/C++/.NET/Rust backend). The candidate's backend is lean, so these are not a fit even if the title says "Full Stack".
- Pure DevOps/SRE/Data-engineering/ML-engineering, Angular-only, or junior/intern/student roles.
- Requires relocation abroad (not in Israel and not remote-friendly to Israel).
Otherwise relevant=true.

SCORING (0-100), only meaningful when relevant=true
- Highest (85-100): front-end-oriented full-stack — clearly frontend/React/React Native AND some Node/full-stack, ideally senior and/or AI-driven, in the commute zone.
- High (70-84): strong pure frontend (React/React Native/TS) senior roles in the commute zone.
- Medium (50-69): frontend roles that are a decent but not ideal fit (e.g. outside commute zone but in Israel, or remote; or missing seniority/AI signals).
- Low (30-49): weak fit — frontend-adjacent but light, or remote-anywhere with little Israel tie.
- Very low (0-29): barely relevant but not worth dropping.
Boosts: senior + AI/AI-tooling product; commute-zone or remote/hybrid-Israel location.

Base the judgment on the ACTUAL focus of the role from its description, not just keywords in the title. In "why", give a one-sentence, human-readable justification a candidate would find useful.`;

/** Render a job into the user-turn text for the scorer. Description is truncated to bound cost. */
export function renderJobForScoring(job: {
  title: string;
  company: string;
  location: string | null;
  description: string | null;
}): string {
  const description = (job.description ?? '').slice(0, 2000);
  return [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Location: ${job.location ?? 'N/A'}`,
    `Description: ${description || 'N/A'}`,
  ].join('\n');
}
