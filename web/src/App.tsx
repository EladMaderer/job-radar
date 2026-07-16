import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJobs, updateJobStatus } from './api.js';
import { AuthError, clearToken, getToken, setToken } from './auth.js';
import { Login } from './Login.js';
import {
  STATUSES,
  statusLabel,
  type JobListItem,
  type JobStatus,
  type SortKey,
  type SortOrder,
} from './types.js';

const PAGE_SIZE = 10;

// A header is sortable when it has a `key` (a whitelisted SortKey); Source has no server sort.
type Column = { label: string; key?: SortKey };
const COLUMNS: Column[] = [
  { key: 'score', label: 'Score' },
  { key: 'title', label: 'Role' },
  { key: 'company', label: 'Company' },
  { label: 'Source' },
  { key: 'posted', label: 'Published' },
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
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Publication date + exact local time, when the source gives one. Many boards post date-only
 * (stored as UTC midnight); TheirStack is date-only too. So we show the time only when it's real —
 * a non-midnight-UTC value — and render it in the viewer's local timezone.
 */
function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const dateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  if (dateOnly) return date;
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

/** Which pipeline surfaced the job: the market-wide TheirStack API vs our ATS-board poller. */
function sourceLabel(source: string): string {
  return source === 'theirstack' ? 'TheirStack' : 'Poll service';
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
  const [token, setTokenState] = useState<string | null>(getToken());
  const [authError, setAuthError] = useState<string | undefined>(undefined);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<JobStatus | ''>('');
  const [minScore, setMinScore] = useState(0);
  const [sort, setSort] = useState<SortKey>('firstSeen');
  const [order, setOrder] = useState<SortOrder>('desc');

  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearch = useDebounced(search, 300);
  // Guards against firing a second page fetch while one is already in flight.
  const inFlight = useRef(false);
  // Bumped on every reset; a fetch whose id is stale discards its result so a
  // slow in-flight page can never append rows onto a freshly-reset list.
  const requestId = useRef(0);

  const hasMore = jobs.length < total;

  function logout(message?: string) {
    clearToken();
    setTokenState(null);
    setAuthError(message);
  }

  function handleFetchError(err: unknown) {
    if (err instanceof AuthError) {
      logout('That password was rejected.');
    } else {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Reset + first page: refetch from offset 0 whenever filters/sort/search change.
  useEffect(() => {
    if (!token) return;
    const id = ++requestId.current;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    fetchJobs({
      status,
      minScore,
      search: debouncedSearch,
      sort,
      order,
      limit: PAGE_SIZE,
      offset: 0,
    })
      .then((data) => {
        if (id !== requestId.current) return;
        setJobs(data.jobs);
        setTotal(data.total);
      })
      .catch((err: unknown) => {
        if (id === requestId.current) handleFetchError(err);
      })
      .finally(() => {
        if (id !== requestId.current) return;
        setLoading(false);
        inFlight.current = false;
      });
    // Invalidate this request if the filters change before it resolves.
    return () => {
      requestId.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, status, minScore, debouncedSearch, sort, order]);

  // Append the next page. Called by the IntersectionObserver at the list bottom.
  const loadMore = useCallback(() => {
    if (!token || inFlight.current) return;
    if (jobs.length === 0 || jobs.length >= total) return;
    const id = requestId.current;
    inFlight.current = true;
    setLoadingMore(true);
    fetchJobs({
      status,
      minScore,
      search: debouncedSearch,
      sort,
      order,
      limit: PAGE_SIZE,
      offset: jobs.length,
    })
      .then((data) => {
        if (id !== requestId.current) return;
        setJobs((prev) => [...prev, ...data.jobs]);
        setTotal(data.total);
      })
      .catch((err: unknown) => {
        if (id === requestId.current) handleFetchError(err);
      })
      .finally(() => {
        // A reset (stale id) now owns inFlight — don't release its guard.
        if (id !== requestId.current) return;
        setLoadingMore(false);
        inFlight.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, status, minScore, debouncedSearch, sort, order, jobs.length, total]);

  // Keep the observer callback pointed at the latest loadMore closure.
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  // Callback ref: attaches an IntersectionObserver when the sentinel mounts.
  // root is null (the viewport) because the page scrolls on the window — the
  // .table-wrap container only scrolls horizontally, never vertically.
  const observer = useRef<IntersectionObserver | null>(null);
  const sentinelNode = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    sentinelNode.current = node;
    observer.current?.disconnect();
    if (!node) return;
    observer.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreRef.current();
      },
      { root: null, rootMargin: '200px' },
    );
    observer.current.observe(node);
  }, []);

  // Auto-fill: IntersectionObserver fires only on intersection *transitions*, so a page that
  // doesn't fill a tall viewport would stall — the sentinel stays on-screen but never re-crosses
  // the threshold, and with no scrollbar the user can't trigger the next load. After each page
  // settles, if the sentinel is still within reach, keep loading until it's pushed below the fold
  // or nothing remains. Guarded by inFlight (in loadMore) so it can't race the observer.
  useEffect(() => {
    if (loading || loadingMore || !hasMore) return;
    const node = sentinelNode.current;
    if (!node) return;
    if (node.getBoundingClientRect().top <= window.innerHeight + 200) {
      loadMore();
    }
  }, [jobs.length, hasMore, loading, loadingMore, loadMore]);

  if (!token) {
    return (
      <Login
        error={authError}
        onSubmit={(pw) => {
          setToken(pw);
          setTokenState(pw);
          setAuthError(undefined);
        }}
      />
    );
  }

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
      if (err instanceof AuthError) {
        logout('Your session expired — sign in again.');
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  const arrow = order === 'desc' ? '↓' : '↑';

  return (
    <div className="app">
      <header className="app-header">
        <h1>jobs-radar</h1>
        <span className="count">
          {loading ? 'loading…' : `${total} match${total === 1 ? '' : 'es'}`}
        </span>
        <button className="logout" onClick={() => logout()}>
          Sign out
        </button>
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
            <option value="">all (except not interested)</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
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
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {COLUMNS.map(({ key, label }) =>
                    key ? (
                      <th key={label} onClick={() => toggleSort(key)}>
                        {label}
                        {sort === key && <span className="arrow">{arrow}</span>}
                      </th>
                    ) : (
                      <th key={label} className="no-sort">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td data-label="Score">
                      <span className={`score ${scoreClass(job.fitScore)}`}>
                        {job.fitScore ?? '—'}
                      </span>
                    </td>
                    <td className="title-cell" data-label="Role">
                      <a href={job.url} target="_blank" rel="noreferrer">
                        {job.title}
                      </a>
                      {job.why && <div className="why">{job.why}</div>}
                    </td>
                    <td data-label="Company">
                      <div className="company">{job.company}</div>
                      <div className="location">{job.location ?? '—'}</div>
                    </td>
                    <td data-label="Source">
                      <span
                        className={`source-tag ${job.source === 'theirstack' ? 'theirstack' : 'poll'}`}
                      >
                        {sourceLabel(job.source)}
                      </span>
                    </td>
                    <td className="date" data-label="Published">
                      {formatDateTime(job.postedAt)}
                    </td>
                    <td data-label="Status">
                      <select
                        className={`status-select ${job.status}`}
                        value={job.status}
                        onChange={(e) => void changeStatus(job, e.target.value as JobStatus)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(s)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="date" data-label="First seen">
                      {formatDate(job.firstSeenAt)}
                    </td>
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

          {/* Sentinel: when it scrolls into view the observer loads the next page. */}
          {hasMore && <div ref={sentinelRef} className="scroll-sentinel" aria-hidden="true" />}
          {loadingMore && <div className="state-msg">loading…</div>}
        </>
      )}
    </div>
  );
}
