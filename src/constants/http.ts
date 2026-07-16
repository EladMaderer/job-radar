export const HTTP_TIMEOUT_MS = 20_000;
export const HTTP_RETRIES = 2; // total attempts = 1 + retries; some boards (with ?content=true) are slow
export const HTTP_RETRY_BACKOFF_MS = 1_000;
export const USER_AGENT = 'jobs-radar/0.1 (+personal job-search radar)';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJsonOnce<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`GET ${url} -> HTTP ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET JSON with a timeout, a descriptive error on non-2xx, and a couple of retries with linear
 * backoff — large boards fetched with `?content=true` occasionally exceed the timeout. Uses
 * native fetch (Node 20+).
 */
export async function fetchJson<T>(url: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= HTTP_RETRIES; attempt += 1) {
    try {
      return await fetchJsonOnce<T>(url);
    } catch (err) {
      lastErr = err;
      if (attempt < HTTP_RETRIES) await sleep(HTTP_RETRY_BACKOFF_MS * (attempt + 1));
    }
  }
  throw lastErr;
}
