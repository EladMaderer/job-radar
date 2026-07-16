import { config } from '../config/env.js';
import { consoleNotifier } from './console.js';
import { telegramNotifier } from './telegram.js';
import type { Notifier } from './types.js';

/** Pick the notifier from config: NOTIFIER=console for offline testing, otherwise Telegram. */
export function getNotifier(): Notifier {
  return config.NOTIFIER === 'console' ? consoleNotifier : telegramNotifier;
}

export type { Notifier, JobAlert } from './types.js';
