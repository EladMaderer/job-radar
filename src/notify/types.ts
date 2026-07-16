/** A stored job that is owed an alert. Built from a DB row, not the raw ATS payload. */
export interface JobAlert {
  id: number;
  company: string;
  title: string;
  location: string | null;
  url: string;
  score: number;
  why: string;
}

/**
 * Send-only notifier. Sends ONE alert at a time and throws on failure, so the caller can mark
 * each job alerted only after its message actually lands (a failed send is retried next cycle,
 * never lost). Two implementations: ConsoleNotifier (offline) and TelegramNotifier (real).
 */
export interface Notifier {
  sendAlert(alert: JobAlert): Promise<void>;
}
