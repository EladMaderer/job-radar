/**
 * Run `worker` over `items` with at most `limit` in flight at once. Preserves input order in the
 * returned array. A small fixed-size worker pool — enough for fan-out network work (LLM scoring)
 * without an external dependency.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function runner(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  }

  const pool = Array.from({ length: Math.min(limit, items.length) }, runner);
  await Promise.all(pool);
  return results;
}
