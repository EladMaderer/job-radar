/**
 * The billing period that `now` falls in, for a plan that renews on `cycleDay` (1–28) each month.
 * Returns `'YYYY-MM-DD'` start (inclusive) and end (exclusive) — e.g. cycleDay 16 in late July gives
 * { start: '2026-07-16', end: '2026-08-16' }. The usage meter is keyed by `start`.
 *
 * `cycleDay` is capped at 28 by the env schema so every month has that day — no Feb-29/31 edge cases.
 * All math is in UTC so it matches how usage rows are keyed.
 */
export function billingPeriod(now: Date, cycleDay: number): { start: string; end: string } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0–11
  const day = now.getUTCDate();

  // Before the cycle day, we're still in the period that started LAST month.
  const startMonthOffset = day >= cycleDay ? 0 : -1;
  const start = new Date(Date.UTC(year, month + startMonthOffset, cycleDay));
  const end = new Date(Date.UTC(year, month + startMonthOffset + 1, cycleDay));

  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
