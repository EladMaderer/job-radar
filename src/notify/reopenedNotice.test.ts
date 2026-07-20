import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatReopenedNotice } from '../constants/messages.js';

const job = (company: string) => ({
  company,
  title: `Senior Dev at ${company}`,
  url: `https://x/${company}`,
});

test('singular vs plural heading', () => {
  assert.match(formatReopenedNotice([job('Cymphony')]), /^♻️ Reopened —/);
  assert.match(formatReopenedNotice([job('A'), job('B')]), /^♻️ 2 reopened —/);
});

test('every reopened job is named and linked', () => {
  const out = formatReopenedNotice([job('Cymphony'), job('Earnix')]);
  for (const c of ['Cymphony', 'Earnix']) {
    assert.ok(out.includes(c), `${c} must be named`);
    assert.ok(out.includes(`https://x/${c}`), `${c} must be linked`);
  }
  assert.ok(out.includes('\n\n•'), 'jobs are separated by a blank line');
});
