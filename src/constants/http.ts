export const HTTP_TIMEOUT_MS = 20_000;
export const HTTP_RETRIES = 2; // total attempts = 1 + retries; some boards (with ?content=true) are slow
export const HTTP_RETRY_BACKOFF_MS = 1_000;
export const USER_AGENT = 'jobs-radar/0.1 (+personal job-search radar)';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** GET with a timeout; throws a descriptive error on non-2xx. Returns the raw Response. */
async function requestOnce(url: string, accept: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { accept, 'user-agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`GET ${url} -> HTTP ${res.status} ${res.statusText}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Run `fn` with a couple of retries and linear backoff — covers slow/flaky boards. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= HTTP_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < HTTP_RETRIES) await sleep(HTTP_RETRY_BACKOFF_MS * (attempt + 1));
    }
  }
  throw lastErr;
}

/** GET JSON with timeout + retries. Uses native fetch (Node 20+). */
export async function fetchJson<T>(url: string): Promise<T> {
  return withRetry(async () => (await requestOnce(url, 'application/json')).json() as Promise<T>);
}

/** GET text/HTML with timeout + retries (e.g. a Comeet careers page with embedded JSON). */
export async function fetchText(url: string): Promise<string> {
  return withRetry(async () => (await requestOnce(url, 'text/html,*/*')).text());
}
