import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DESCRIPTION_CHARS,
  renderJobForScoring,
  trimDescriptionForScoring,
} from '../constants/profile.js';

test('short descriptions pass through untouched', () => {
  const d = 'React Native role. Requirements: 5+ years React Native.';
  assert.equal(trimDescriptionForScoring(d), d);
});

test('over-budget descriptions keep the TAIL, where requirements live', () => {
  // The failure this guards: boilerplate first, deciding requirements last.
  const boilerplate = 'company blurb. '.repeat(1200); // ~18k chars, well over budget
  const requirements = 'Requirements: Proficiency with Node.js and PostgreSQL.';
  const out = trimDescriptionForScoring(boilerplate + requirements);

  assert.ok(out.length <= MAX_DESCRIPTION_CHARS + 10, 'stays within budget');
  assert.ok(out.includes(requirements), 'the trailing requirements MUST survive the trim');
  assert.ok(out.startsWith('company blurb.'), 'the head is still included');
  assert.ok(out.includes('[…]'), 'the elision is marked');
});

test('renderJobForScoring includes the trailing requirements of a long posting', () => {
  const rendered = renderJobForScoring({
    title: 'Full Stack Software Engineer',
    company: 'Unframe',
    location: 'Tel Aviv, Israel',
    description:
      'x'.repeat(12000) + ' Proficiency with JavaScript, Node.js, Vue/React and PostgreSQL.',
  });
  assert.ok(rendered.includes('PostgreSQL'), 'requirements must reach the scorer');
});
