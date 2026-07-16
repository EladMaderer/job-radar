export const HTTP_TIMEOUT_MS = 15_000;
export const USER_AGENT = 'jobs-radar/0.1 (+personal job-search radar)';

/** GET JSON with a timeout and a descriptive error on non-2xx. Uses native fetch (Node 20+). */
export async function fetchJson<T>(url: string): Promise<T> {
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
