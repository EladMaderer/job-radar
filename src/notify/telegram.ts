import { config } from '../config/env.js';
import {
  APPLY_BUTTON_LABEL,
  formatAlert,
  MAX_ALERTS_PER_CYCLE,
  overflowNote,
  TELEGRAM_SEND_GAP_MS,
} from '../constants/messages.js';
import { HTTP_TIMEOUT_MS, USER_AGENT } from '../constants/http.js';
import type { JobAlert, Notifier } from './types.js';

const API_BASE = 'https://api.telegram.org';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** POST to the Bot API sendMessage endpoint. Throws with the API's description on failure. */
async function sendMessage(text: string, replyMarkup?: unknown): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
      body: JSON.stringify({
        chat_id: config.TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Telegram sendMessage HTTP ${res.status}: ${body}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** A single inline URL button — needs no bot listener, so it works in the serverless model. */
function applyButton(url: string): unknown {
  return { inline_keyboard: [[{ text: APPLY_BUTTON_LABEL, url }]] };
}

/**
 * Sends each alert as its own message with an [ Apply ] URL button. Sequential with a small gap
 * to respect Telegram's per-chat rate limit; caps the batch and appends an overflow note.
 */
export const telegramNotifier: Notifier = {
  async sendAlerts(alerts: JobAlert[]): Promise<void> {
    const shown = alerts.slice(0, MAX_ALERTS_PER_CYCLE);
    for (const alert of shown) {
      await sendMessage(formatAlert(alert), applyButton(alert.job.url));
      await sleep(TELEGRAM_SEND_GAP_MS);
    }
    if (alerts.length > shown.length) {
      await sendMessage(overflowNote(alerts.length - shown.length));
    }
  },
};
