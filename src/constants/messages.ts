import type { JobAlert, ReopenedJob } from '../notify/types.js';

/** Cap alerts sent per cycle; any beyond the cap stay pending and send on the next cycle. */
export const MAX_ALERTS_PER_CYCLE = 10;

/** Telegram allows ~1 message/sec to a chat; small gap between sends stays well under it. */
export const TELEGRAM_SEND_GAP_MS = 300;

export const APPLY_BUTTON_LABEL = 'Apply';

/** The alert body (no button — the button is attached as reply_markup by the Telegram client). */
export function formatAlert(alert: JobAlert): string {
  const lines = [
    `🟢 New match — ${alert.score}/100`,
    alert.title,
    `${alert.company} · ${alert.location ?? 'Location N/A'}`,
    `Why: ${alert.why}`,
  ];
  if (alert.recruiterLinkedIn) {
    lines.push(`👤 ${alert.recruiterName ?? 'Hiring contact'} — ${alert.recruiterLinkedIn}`);
  }
  return lines.join('\n');
}

/**
 * Notice for jobs that started accepting applications again. Sent only when there IS one — a
 * per-run summary would be ~11 near-empty messages a day on the hourly schedule. New matches are
 * NOT included here: they already get their own alert, and duplicating them would be noise.
 */
export function formatReopenedNotice(jobs: ReopenedJob[]): string {
  const heading =
    jobs.length === 1
      ? '♻️ Reopened — accepting applications again'
      : `♻️ ${jobs.length} reopened — accepting applications again`;
  const blocks = jobs.map((j) => `• ${j.title}\n  ${j.company}\n  ${j.url}`);
  return [heading, '', blocks.join('\n\n')].join('\n');
}
