import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLinkedInJob, linkedInJobId } from './linkedin.js';

test('extracts the trailing job id from a slug URL', () => {
  assert.equal(
    linkedInJobId(
      'https://il.linkedin.com/jobs/view/senior-full-stack-developer-at-miri-headhunter-4440506510',
    ),
    '4440506510',
  );
});

test('digits inside the slug are not mistaken for the id', () => {
  assert.equal(
    linkedInJobId('https://www.linkedin.com/jobs/view/react-18-dev-at-acme-1234567890'),
    '1234567890',
  );
});

test('handles a bare id URL and a trailing slash', () => {
  assert.equal(linkedInJobId('https://www.linkedin.com/jobs/view/9876543210/'), '9876543210');
});

test('non-LinkedIn URLs return null / false', () => {
  const workday = 'https://acme.wd5.myworkdayjobs.com/careers/job/Tel-Aviv/Engineer_JR-1';
  assert.equal(linkedInJobId(workday), null);
  assert.equal(isLinkedInJob(workday), false);
  assert.equal(isLinkedInJob('https://il.linkedin.com/jobs/view/dev-at-acme-42'), true);
});
