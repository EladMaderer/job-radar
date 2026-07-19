import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from '../ats/types.js';
import {
  AI_KEYWORDS,
  BACKEND_PRIMARY_KEYWORDS,
  BACKEND_SIGNAL_KEYWORDS,
  FRONTEND_KEYWORDS,
  FRONTEND_ONLY_KEYWORDS,
  NEGATIVE_KEYWORDS,
  SENIOR_KEYWORDS,
} from '../constants/scoring.js';
import { keywordScorer } from './keywordScorer.js';
import { matchesKeyword } from './match.js';

function job(partial: Partial<Job>): Job {
  return {
    source: 'test',
    externalId: 'x',
    company: 'Acme',
    title: '',
    location: null,
    url: 'https://example.com',
    description: null,
    postedAt: null,
    remote: false,
    countryCode: null,
    ...partial,
  };
}
const score = (p: Partial<Job>) => keywordScorer.score(job(p));

// --- Ranking behavior (both directions) -----------------------------------------------------

test('React+Node senior in Tel Aviv is highest and fires the sweet spot', async () => {
  const r = await score({
    title: 'Senior Frontend Engineer',
    location: 'Tel Aviv, Israel',
    description:
      'Build our product UI in React and TypeScript, plus some Node.js backend services.',
  });
  assert.match(r.why, /sweet spot/, 'sweet spot should fire for React + Node');
  assert.ok(r.score >= 85, `expected high score, got ${r.score}`);
});

test('pure React senior scores well but below the React+Node sweet-spot role', async () => {
  const sweet = await score({
    title: 'Senior Frontend Engineer',
    location: 'Tel Aviv, Israel',
    description: 'React and TypeScript, and Node.js microservices on the backend.',
  });
  const pure = await score({
    title: 'Senior Frontend Engineer',
    location: 'Tel Aviv, Israel',
    description: 'Build rich UI in React and TypeScript. Strong CSS and accessibility skills.',
  });
  assert.doesNotMatch(pure.why, /sweet spot/, 'pure React must NOT fire the sweet spot');
  assert.ok(pure.score >= 45, `pure React should still score well, got ${pure.score}`);
  assert.ok(sweet.score > pure.score, `sweet(${sweet.score}) should beat pure(${pure.score})`);
});

test('Go/Java backend titled "Full Stack" is penalized and ranks low', async () => {
  const backend = await score({
    title: 'Full Stack Engineer',
    location: 'Tel Aviv, Israel',
    description: 'Backend-heavy role. Strong Go and Java on microservices. Some React on the side.',
  });
  assert.match(backend.why, /backend-primary/, 'backend-primary penalty should apply');
  const pureReact = await score({
    title: 'Frontend Engineer',
    location: 'Tel Aviv, Israel',
    description: 'React and TypeScript UI work.',
  });
  assert.ok(backend.score < pureReact.score, 'backend-heavy full-stack must rank below pure React');
});

test('frontend role with "go live" / "go-to-market" / "REST API" is not penalized and no sweet spot', async () => {
  const r = await score({
    title: 'Frontend Engineer',
    location: 'Tel Aviv, Israel',
    description:
      'React and TypeScript. You will consume REST APIs, help features go live, and support ' +
      'our go-to-market. Ready to go above and beyond for users.',
  });
  assert.doesNotMatch(
    r.why,
    /backend-primary/,
    '"go live"/"go-to-market" must NOT trigger backend penalty',
  );
  assert.doesNotMatch(r.why, /sweet spot/, '"REST API" must NOT trigger the full-stack sweet spot');
  assert.ok(r.score >= 45, `a clean frontend role should score well, got ${r.score}`);
});

// --- Keyword-list integrity (guards the fixes above) ----------------------------------------

test('the false-firing keywords are gone', () => {
  assert.ok(!BACKEND_PRIMARY_KEYWORDS.includes('go'), "bare 'go' must be removed");
  assert.ok(BACKEND_PRIMARY_KEYWORDS.includes('golang'), "'golang' must stay");
  assert.ok(BACKEND_PRIMARY_KEYWORDS.includes('go developer'), "'go developer' should be present");
  assert.ok(!BACKEND_SIGNAL_KEYWORDS.includes('api'), "'api' must be removed from backend signal");
  assert.ok(!SENIOR_KEYWORDS.includes('lead'), "bare 'lead' must be removed");
});

test('every keyword matches itself (catches punctuation keywords that could never match)', () => {
  const lists = [
    FRONTEND_KEYWORDS,
    FRONTEND_ONLY_KEYWORDS,
    BACKEND_SIGNAL_KEYWORDS,
    BACKEND_PRIMARY_KEYWORDS,
    SENIOR_KEYWORDS,
    AI_KEYWORDS,
    NEGATIVE_KEYWORDS,
  ];
  for (const list of lists) {
    for (const kw of list) {
      assert.ok(matchesKeyword(kw, kw), `keyword "${kw}" fails to match itself`);
      assert.ok(matchesKeyword(`we need ${kw} skills`, kw), `keyword "${kw}" fails in a sentence`);
    }
  }
});

// --- Technology-slug channel (TheirStack) ----------------------------------------------------

test('slug channel: react+nodejs slugs fire the sweet spot at full weight', async () => {
  const r = await score({
    title: 'Software Developer', // generic title — slugs carry the signal
    location: 'Tel Aviv, Israel',
    description: 'Join our product team.',
    technologySlugs: ['react', 'nodejs'],
  });
  assert.match(r.why, /frontend \(tech tags\)/);
  assert.match(r.why, /sweet spot/);
  assert.ok(r.score >= 75, `expected sweet-spot score, got ${r.score}`);
});

test('slug channel: python tag alongside react does NOT trigger backend-primary', async () => {
  const r = await score({
    title: 'Full Stack Developer',
    location: 'Tel Aviv, Israel',
    description: 'Our stack.',
    technologySlugs: ['react', 'nodejs', 'python'],
  });
  assert.doesNotMatch(r.why, /backend-primary/);
});

test('slug channel: backend-only slugs are penalized', async () => {
  const r = await score({
    title: 'Full Stack Developer',
    location: 'Tel Aviv, Israel',
    description: 'Our stack.',
    technologySlugs: ['golang', 'python'],
  });
  assert.match(r.why, /backend-primary \(tech tags\)/);
});

test('source seniority: senior boosts, junior disqualifies', async () => {
  const senior = await score({
    title: 'Frontend Developer',
    location: 'Tel Aviv, Israel',
    technologySlugs: ['react'],
    seniority: 'senior',
  });
  assert.match(senior.why, /senior \(source\)/);
  const junior = await score({
    title: 'Frontend Developer',
    location: 'Tel Aviv, Israel',
    technologySlugs: ['react'],
    seniority: 'junior',
  });
  assert.match(junior.why, /junior \(source\)/);
  assert.ok(junior.score < senior.score);
});

test('punctuation keywords match real usage; boundaries reject substrings', () => {
  for (const [text, kw] of [
    ['strong C++ and Rust', 'c++'],
    ['C# / .NET stack', 'c#'],
    ['experience with .NET core', '.net'],
    ['Sr. Frontend Engineer', 'sr.'],
    ['built on Node.js', 'node.js'],
  ] as const) {
    assert.ok(matchesKeyword(text, kw), `"${kw}" should match "${text}"`);
  }
  // boundary rejections
  assert.ok(!matchesKeyword('a reactive stream', 'react'), '"react" must not hit "reactive"');
  assert.ok(!matchesKeyword('using javascript', 'java'), '"java" must not hit "javascript"');
  assert.ok(!matchesKeyword('send an email', 'ai'), '"ai" must not hit "email"');
  assert.ok(!matchesKeyword('golang backend', 'go developer'), 'phrase must match as a phrase');
});

test('team-lead roles are penalized, unless the role is React Native', async () => {
  const ic = await keywordScorer.score(
    job({ title: 'Senior Frontend Developer', description: 'React, TypeScript' }),
  );
  const lead = await keywordScorer.score(
    job({ title: 'Frontend Team Lead', description: 'React, TypeScript' }),
  );
  assert.match(lead.why, /team-lead role/);
  assert.ok(lead.score < ic.score, 'a lead title must score below the same IC role');

  // React Native waives it — an RN lead is the one lead role worth surfacing.
  const rnLead = await keywordScorer.score(
    job({ title: 'React Native Team Lead', description: 'React Native, TypeScript' }),
  );
  assert.doesNotMatch(rnLead.why, /team-lead role/);

  // "lead the effort" in body text is normal senior-IC scope, not a lead role.
  const icLeading = await keywordScorer.score(
    job({ title: 'Senior Frontend Engineer', description: 'You will lead the redesign effort.' }),
  );
  assert.doesNotMatch(icLeading.why, /team-lead role/);
});
