import type { JobAlert } from '../notify/types.js';

/** Cap alerts per cycle so a burst never floods the chat; the rest stay browsable in the DB. */
export const MAX_ALERTS_PER_CYCLE = 10;

/** Telegram allows ~1 message/sec to a chat; small gap between sends stays well under it. */
export const TELEGRAM_SEND_GAP_MS = 300;

export const APPLY_BUTTON_LABEL = 'Apply';

/** The alert body (no button — the button is attached as reply_markup by the Telegram client). */
export function formatAlert({ job, score, why }: JobAlert): string {
  const location = job.location ?? (job.remote ? 'Remote' : 'Location N/A');
  return [
    `🟢 New match — ${score}/100`,
    job.title,
    `${job.company} · ${location}`,
    `Why: ${why}`,
  ].join('\n');
}

/** Trailing line when more matches were found than we alert on in one cycle. */
export function overflowNote(hiddenCount: number): string {
  return `➕ +${hiddenCount} more new match${hiddenCount === 1 ? '' : 'es'} stored — browse in the DB.`;
}
