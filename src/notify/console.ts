import { formatAlert, MAX_ALERTS_PER_CYCLE, overflowNote } from '../constants/messages.js';
import type { JobAlert, Notifier } from './types.js';

/**
 * Prints alerts to stdout instead of Telegram. Lets the whole pipeline run offline (useful
 * behind a corporate firewall that blocks api.telegram.org). Mirrors the cap/overflow behavior
 * of the real notifier so what you see locally matches production.
 */
export const consoleNotifier: Notifier = {
  async sendAlerts(alerts: JobAlert[]): Promise<void> {
    if (alerts.length === 0) {
      console.log('[notify:console] no alerts this cycle.');
      return;
    }
    const shown = alerts.slice(0, MAX_ALERTS_PER_CYCLE);
    for (const alert of shown) {
      console.log('\n' + formatAlert(alert));
      console.log(`[ Apply ] -> ${alert.job.url}`);
    }
    if (alerts.length > shown.length) {
      console.log('\n' + overflowNote(alerts.length - shown.length));
    }
  },
};
