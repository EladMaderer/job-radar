import type { Job } from '../ats/types.js';

/** A scored job ready to be announced. */
export interface JobAlert {
  job: Job;
  score: number;
  why: string;
}

/**
 * Send-only notifier. Two implementations: ConsoleNotifier (offline testing) and
 * TelegramNotifier (real alerts). Callers depend on this interface, not either concretion.
 */
export interface Notifier {
  sendAlerts(alerts: JobAlert[]): Promise<void>;
}
