import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billingPeriod } from './billingPeriod.js';

/** Build a UTC date at noon so a stray timezone offset can't shift the day-of-month. */
const at = (iso: string): Date => new Date(`${iso}T12:00:00Z`);

test('cycleDay=16 boundary: day 15 is still the previous period', () => {
  assert.deepEqual(billingPeriod(at('2026-07-15'), 16), {
    start: '2026-06-16',
    end: '2026-07-16',
  });
});

test('cycleDay=16 boundary: day 16 starts the new period (rolls on the 16th, not the 1st)', () => {
  assert.deepEqual(billingPeriod(at('2026-07-16'), 16), {
    start: '2026-07-16',
    end: '2026-08-16',
  });
});

test('cycleDay=16 boundary: day 17 is in the same period as day 16', () => {
  assert.deepEqual(billingPeriod(at('2026-07-17'), 16), {
    start: '2026-07-16',
    end: '2026-08-16',
  });
});

test('the 1st of the month stays in the period that started on the previous 16th', () => {
  // The exact P0-1 bug: a calendar-month key would reset here; the period must not.
  assert.deepEqual(billingPeriod(at('2026-08-01'), 16), {
    start: '2026-07-16',
    end: '2026-08-16',
  });
});

test('Dec→Jan rollover: end date crosses into the next year', () => {
  assert.deepEqual(billingPeriod(at('2026-12-20'), 16), {
    start: '2026-12-16',
    end: '2027-01-16',
  });
});

test('Jan→Dec rollover: before the cycle day in January, period start is the previous December', () => {
  assert.deepEqual(billingPeriod(at('2026-01-05'), 16), {
    start: '2025-12-16',
    end: '2026-01-16',
  });
});

test('other cycle days work: day 1 and day 28 edges', () => {
  assert.deepEqual(billingPeriod(at('2026-03-01'), 1), { start: '2026-03-01', end: '2026-04-01' });
  assert.deepEqual(billingPeriod(at('2026-02-28'), 28), { start: '2026-02-28', end: '2026-03-28' });
  // Feb before day 28 → January's cycle day (28 exists in every month).
  assert.deepEqual(billingPeriod(at('2026-02-10'), 28), { start: '2026-01-28', end: '2026-02-28' });
});
