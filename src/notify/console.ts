import { formatAlert } from '../constants/messages.js';
import type { JobAlert, Notifier } from './types.js';

/**
 * Prints one alert to stdout instead of Telegram. Lets the whole pipeline run offline (useful
 * behind a corporate firewall that blocks api.telegram.org).
 */
export const consoleNotifier: Notifier = {
  async sendAlert(alert: JobAlert): Promise<void> {
    console.log('\n' + formatAlert(alert));
    console.log(`[ Apply ] -> ${alert.url}`);
  },
};
