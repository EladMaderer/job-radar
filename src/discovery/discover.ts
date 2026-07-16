import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapWithConcurrency } from '../lib/concurrency.js';
import { probeGreenhouse, probeLever, type DiscoveredBoard } from './probe.js';
import { greenhouseSlugs, leverSlugs } from './slugSource.js';

/**
 * Auto-discovery: probe the public universe of Greenhouse/Lever board slugs and keep every board
 * that currently has Israel-based roles. Writes the result to registry/discovered.json, which the
 * registry merges with the hand-curated list. Meant to run on a schedule (weekly) so newly-launched
 * boards are picked up automatically without hand-editing the registry.
 *
 * This probes ~12k public boards, so it's a heavy one-off job — NOT part of the poll cycle.
 */
const PROBE_CONCURRENCY = 24;
const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'registry', 'discovered.json');

export async function discover(): Promise<DiscoveredBoard[]> {
  console.log('[discover] fetching slug universe…');
  const [gh, lv] = await Promise.all([greenhouseSlugs(), leverSlugs()]);
  console.log(`[discover] probing ${gh.length} Greenhouse + ${lv.length} Lever boards…`);

  const ghResults = await mapWithConcurrency(gh, PROBE_CONCURRENCY, probeGreenhouse);
  const lvResults = await mapWithConcurrency(lv, PROBE_CONCURRENCY, probeLever);

  const boards = [...ghResults, ...lvResults]
    .filter((b): b is DiscoveredBoard => b !== null)
    .sort((a, b) => b.ilCount - a.ilCount);

  // Store only what the registry needs (drop ilCount, which is a point-in-time probe stat).
  const entries = boards.map(({ name, ats, slug }) => ({ name, ats, slug }));
  await writeFile(OUTPUT, JSON.stringify(entries, null, 2) + '\n');

  console.log(`[discover] found ${boards.length} boards with Israel roles -> ${OUTPUT}`);
  return boards;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  discover()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[discover] failed:', err);
      process.exit(1);
    });
}
