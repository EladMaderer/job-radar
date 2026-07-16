import { useEffect, useState } from 'react';
import type { JobsResponse } from './types.js';

// Step 1 placeholder UI: proves the frontend can reach GET /api/jobs and render real rows.
// The filter/search/status-update UI lands in the next steps.
export function App() {
  const [data, setData] = useState<JobsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/jobs?limit=50')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<JobsResponse>;
      })
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>jobs-radar</h1>
      {error && <p style={{ color: 'crimson' }}>Failed to load: {error}</p>}
      {!data && !error && <p>Loading…</p>}
      {data && (
        <>
          <p>
            {data.total} job{data.total === 1 ? '' : 's'} stored
          </p>
          <ul>
            {data.jobs.map((job) => (
              <li key={job.id}>
                <strong>{job.fitScore ?? '—'}</strong> · {job.title} — {job.company}
                {job.location ? ` (${job.location})` : ''} · <em>{job.status}</em>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
