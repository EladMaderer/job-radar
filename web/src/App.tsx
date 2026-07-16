import { useEffect, useMemo, useState } from 'react';
import { fetchJobs, updateJobStatus } from './api.js';
import { STATUSES, type JobListItem, type JobStatus, type SortKey, type SortOrder } from './types.js';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Score' },
  { key: 'title', label: 'Role' },
  { key: 'company', label: 'Company' },
  { key: 'status', label: 'Status' },
  { key: 'firstSeen', label: 'First seen' },
];

function scoreClass(score: number | null): string {
  if (score == null) return 'low';
  if (score >= 70) return 'high';
  if (score >= 45) return 'mid';
  return 'low';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Debounce a rapidly-changing value (used for the search box). */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function App() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<JobStatus | ''>('');
  const [minScore, setMinScore] = useState(0);
  const [sort, setSort] = useState<SortKey>('score');
  const [order, setOrder] = useState<SortOrder>('desc');

  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearch = useDebounced(search, 300);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchJobs({ status, minScore, search: debouncedSearch, sort, order, limit: 500 })
      .then((data) => {
        if (cancelled) return;
        setJobs(data.jobs);
        setTotal(data.total);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, minScore, debouncedSearch, sort, order]);

  function toggleSort(key: SortKey) {
    if (sort === key) {
      setOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    } else {
      setSort(key);
      setOrder('desc');
    }
  }

  async function changeStatus(job: JobListItem, next: JobStatus) {
    const prev = job.status;
    // Optimistic: reflect the change immediately, revert if the request fails.
    setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, status: next } : j)));
    try {
      await updateJobStatus(job.id, next);
    } catch (err) {
      setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, status: prev } : j)));
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const arrow = useMemo(() => (order === 'desc' ? '↓' : '↑'), [order]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>jobs-radar</h1>
        <span className="count">
          {loading ? 'loading…' : `${total} match${total === 1 ? '' : 'es'}`}
        </span>
      </header>

      <div className="controls">
        <input
          type="text"
          placeholder="Search title or company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as JobStatus | '')}>
            <option value="">all</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Min score
          <input
            type="number"
            min={0}
            max={100}
            step={5}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value) || 0)}
            style={{ width: 70 }}
          />
        </label>
      </div>

      {error && <div className="state-msg error">Failed to load: {error}</div>}

      {!error && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key} onClick={() => toggleSort(col.key)}>
                    {col.label}
                    {sort === col.key && <span className="arrow">{arrow}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <span className={`score ${scoreClass(job.fitScore)}`}>{job.fitScore ?? '—'}</span>
                  </td>
                  <td className="title-cell">
                    <a href={job.url} target="_blank" rel="noreferrer">
                      {job.title}
                    </a>
                    {job.why && <div className="why">{job.why}</div>}
                  </td>
                  <td>
                    <div className="company">{job.company}</div>
                    <div className="location">{job.location ?? '—'}</div>
                  </td>
                  <td>
                    <select
                      className={`status-select ${job.status}`}
                      value={job.status}
                      onChange={(e) => void changeStatus(job, e.target.value as JobStatus)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="date">{formatDate(job.firstSeenAt)}</td>
                </tr>
              ))}
              {!loading && jobs.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length}>
                    <div className="state-msg">No jobs match these filters.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
