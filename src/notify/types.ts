/** A stored job that is owed an alert. Built from a DB row, not the raw ATS payload. */
export interface JobAlert {
  id: number;
  company: string;
  title: string;
  location: string | null;
  url: string;
  score: number;
  why: string;
  /** Hiring contact when the source provides one (TheirStack); null for ATS-board jobs. */
  recruiterName?: string | null;
  recruiterLinkedIn?: string | null;
}

/** A job that started accepting applications again (was 'halted', now back to 'new'). */
export interface ReopenedJob {
  company: string;
  title: string;
  url: string;
}

/**
 * Send-only notifier. Sends ONE alert at a time and throws on failure, so the caller can mark
 * each job alerted only after its message actually lands (a failed send is retried next cycle,
 * never lost). Two implementations: ConsoleNotifier (offline) and TelegramNotifier (real).
 */
export interface Notifier {
  sendAlert(alert: JobAlert): Promise<void>;
  /** A plain informational message with no Apply button — used for the reopened-jobs notice. */
  sendNotice(text: string): Promise<void>;
}
