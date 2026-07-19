import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchJobs, updateJobStatus, updateJobStatusNote } from '../api.js';
import { AuthError } from '../auth.js';
import { StatusNoteInput } from '../components/StatusNoteInput.js';
import { useAuth } from '../AuthContext.js';
import {
  STATUSES,
  statusLabel,
  type JobListItem,
  type JobStatus,
  type SortKey,
  type SortOrder,
} from '../types.js';

const PAGE_SIZE = 10;

const MAX_AGE_OPTIONS: { value: number; label: string }[] = [
  { value: 30, label: 'last 30 days' },
  { value: 90, label: 'last 3 months' },
  { value: 180, label: 'last 6 months' },
  { value: 0, label: 'all time' },
];
const DEFAULT_MAX_AGE_DAYS = 90;

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

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const dateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  if (dateOnly) return date;
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

function sourceLabel(source: string): string {
  return source === 'theirstack' ? 'TheirStack' : 'Poll service';
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** The jobs table. Rows navigate to the detail page; the title link + status select don't. */
export function JobsList() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<JobStatus | ''>('');
  const [minScore, setMinScore] = useState(0);
  const [maxAgeDays, setMaxAgeDays] = useState(DEFAULT_MAX_AGE_DAYS);
  const [sort, setSort] = useState<SortKey>('posted');
  const [order, setOrder] = useState<SortOrder>('desc');

  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearch = useDebounced(search, 300);
  const inFlight = useRef(false);
  const requestId = useRef(0);
  const hasMore = jobs.length < total;

  function handleFetchError(err: unknown) {
    if (err instanceof AuthError) logout('That password was rejected.');
    else setError(err instanceof Error ? err.message : String(err));
  }

  useEffect(() => {
    const id = ++requestId.current;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    fetchJobs({
      status,
      minScore,
      search: debouncedSearch,
      maxAgeDays,
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
    return () => {
      requestId.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, minScore, maxAgeDays, debouncedSearch, sort, order]);

  const loadMore = useCallback(() => {
    if (inFlight.current) return;
    if (jobs.length === 0 || jobs.length >= total) return;
    const id = requestId.current;
    inFlight.current = true;
    setLoadingMore(true);
    fetchJobs({
      status,
      minScore,
      search: debouncedSearch,
      maxAgeDays,
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
        if (id !== requestId.current) return;
        setLoadingMore(false);
        inFlight.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, minScore, maxAgeDays, debouncedSearch, sort, order, jobs.length, total]);

  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

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

  useEffect(() => {
    if (loading || loadingMore || !hasMore) return;
    const node = sentinelNode.current;
    if (!node) return;
    if (node.getBoundingClientRect().top <= window.innerHeight + 200) loadMore();
  }, [jobs.length, hasMore, loading, loadingMore, loadMore]);

  function toggleSort(key: SortKey) {
    if (sort === key) setOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    else {
      setSort(key);
      setOrder('desc');
    }
  }

  async function changeStatus(job: JobListItem, next: JobStatus) {
    const prev = job.status;
    setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, status: next } : j)));
    try {
      await updateJobStatus(job.id, next);
    } catch (err) {
      setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, status: prev } : j)));
      if (err instanceof AuthError) logout('Your session expired — sign in again.');
      else setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function changeStatusNote(job: JobListItem, note: string) {
    const prev = job.statusNote;
    const next = note || null;
    setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, statusNote: next } : j)));
    try {
      await updateJobStatusNote(job.id, note);
    } catch (err) {
      setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, statusNote: prev } : j)));
      if (err instanceof AuthError) logout('Your session expired — sign in again.');
      else setError(err instanceof Error ? err.message : String(err));
    }
  }

  const arrow = order === 'desc' ? '↓' : '↑';

  return (
    <>
      <div className="list-caption">
        {loading ? 'loading…' : `${total} match${total === 1 ? '' : 'es'}`}
      </div>

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
        <label>
          Published
          <select value={maxAgeDays} onChange={(e) => setMaxAgeDays(Number(e.target.value))}>
            {MAX_AGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
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
                  <tr key={job.id} className="row-link" onClick={() => navigate(`/jobs/${job.id}`)}>
                    <td data-label="Score">
                      <span className={`score ${scoreClass(job.fitScore)}`}>
                        {job.fitScore ?? '—'}
                      </span>
                    </td>
                    <td className="title-cell" data-label="Role">
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
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
                    <td data-label="Status" onClick={(e) => e.stopPropagation()}>
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
                      <StatusNoteInput
                        value={job.statusNote}
                        onSave={(note) => changeStatusNote(job, note)}
                      />
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
          {hasMore && <div ref={sentinelRef} className="scroll-sentinel" aria-hidden="true" />}
          {loadingMore && <div className="state-msg">loading…</div>}
        </>
      )}
    </>
  );
}
