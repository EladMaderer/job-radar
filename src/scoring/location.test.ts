import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from '../ats/types.js';
import { classifyLocation } from './location.js';

function job(partial: Partial<Job>): Job {
  return {
    source: 'test',
    externalId: 'x',
    company: 'Acme',
    title: 'Senior Frontend Engineer',
    location: null,
    url: 'https://x',
    description: null,
    postedAt: null,
    remote: false,
    countryCode: null,
    ...partial,
  };
}

test('an Israel-located job is kept', () => {
  const { keep, inIsrael } = classifyLocation(job({ location: 'Tel Aviv, Israel' }));
  assert.equal(inIsrael, true);
  assert.equal(keep, true);
});

test('remote-in-Israel is kept — inIsrael decides it, not the remote flag', () => {
  const { keep, inIsrael, isRemote } = classifyLocation(
    job({ location: 'Israel (Remote)', remote: true }),
  );
  assert.equal(inIsrael, true);
  assert.equal(isRemote, true);
  assert.equal(keep, true);
});

test('remote-anywhere / global with no Israel tie is DROPPED, not just denied the bonus', () => {
  const { keep, inIsrael, isRemote } = classifyLocation(
    job({ location: 'Remote - Anywhere', remote: true }),
  );
  assert.equal(inIsrael, false);
  assert.equal(isRemote, true);
  assert.equal(keep, false);
});

test('the ATS remote flag alone (no remote-hint text) is also dropped without an Israel tie', () => {
  const { keep } = classifyLocation(job({ location: 'United States', remote: true }));
  assert.equal(keep, false);
});

test('a clearly foreign, non-remote city is dropped', () => {
  const { keep, inIsrael, isRemote } = classifyLocation(job({ location: 'Berlin, Germany' }));
  assert.equal(inIsrael, false);
  assert.equal(isRemote, false);
  assert.equal(keep, false);
});

test('no location text at all is kept as unknown, not dropped', () => {
  const { keep } = classifyLocation(job({ location: null }));
  assert.equal(keep, true);
  const { keep: keepEmpty } = classifyLocation(job({ location: '   ' }));
  assert.equal(keepEmpty, true);
});

test('an Israeli country code alone (no city text) is enough to keep it', () => {
  const { keep, inIsrael } = classifyLocation(job({ location: null, countryCode: 'IL' }));
  assert.equal(inIsrael, true);
  assert.equal(keep, true);
});
