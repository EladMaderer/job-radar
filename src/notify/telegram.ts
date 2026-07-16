import { config } from '../config/env.js';
import { APPLY_BUTTON_LABEL, formatAlert } from '../constants/messages.js';
import { HTTP_TIMEOUT_MS, USER_AGENT } from '../constants/http.js';
import type { JobAlert, Notifier } from './types.js';

const API_BASE = 'https://api.telegram.org';

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

/** Sends one alert as a message with an [ Apply ] URL button. Throws if Telegram rejects it. */
export const telegramNotifier: Notifier = {
  async sendAlert(alert: JobAlert): Promise<void> {
    await sendMessage(formatAlert(alert), applyButton(alert.url));
  },
};
