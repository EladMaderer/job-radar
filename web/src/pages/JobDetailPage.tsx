import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { updateJobStatus } from '../api.js';
import { AuthError } from '../auth.js';
import { useAuth } from '../AuthContext.js';
import { fetchGuidance, fetchJob, fetchPrep, postGuidance, postPrep } from '../guidanceApi.js';
import {
  STATUSES,
  statusLabel,
  type GuidanceState,
  type JobDetail,
  type JobStatus,
  type PrepState,
} from '../types.js';

export function JobDetailPage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const { logout } = useAuth();

  const [job, setJob] = useState<JobDetail | null | undefined>(undefined);
  const [guidance, setGuidance] = useState<GuidanceState | null>(null);
  const [prep, setPrep] = useState<PrepState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guidanceBusy, setGuidanceBusy] = useState(false);
  const [prepBusy, setPrepBusy] = useState(false);

  const onErr = (err: unknown) => {
    if (err instanceof AuthError) logout('Your session expired — sign in again.');
    else setError(err instanceof Error ? err.message : String(err));
  };

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) {
      setJob(null);
      return;
    }
    fetchJob(id)
      .then(setJob)
      .catch((e) => {
        setJob(null);
        onErr(e);
      });
    fetchGuidance(id)
      .then(setGuidance)
      .catch(() => {});
    fetchPrep(id)
      .then(setPrep)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function changeStatus(next: JobStatus) {
    if (!job) return;
    const prev = job.status;
    setJob({ ...job, status: next });
    try {
      await updateJobStatus(job.id, next);
    } catch (err) {
      setJob({ ...job, status: prev });
      onErr(err);
    }
  }

  async function generateGuidance() {
    setGuidanceBusy(true);
    setError(null);
    try {
      setGuidance(await postGuidance(id));
    } catch (err) {
      onErr(err);
    } finally {
      setGuidanceBusy(false);
    }
  }

  async function generatePrep() {
    setPrepBusy(true);
    setError(null);
    try {
      setPrep(await postPrep(id));
    } catch (err) {
      onErr(err);
    } finally {
      setPrepBusy(false);
    }
  }

  if (job === undefined) return <div className="state-msg">loading…</div>;
  if (job === null)
    return (
      <div className="page">
        <Link to="/" className="back-link">
          ← back to jobs
        </Link>
        <div className="state-msg error">{error ?? 'Job not found.'}</div>
      </div>
    );

  return (
    <div className="page detail-page">
      <Link to="/" className="back-link">
        ← back to jobs
      </Link>

      <div className="detail-head">
        <h2>
          <a href={job.url} target="_blank" rel="noreferrer">
            {job.title} ↗
          </a>
        </h2>
        <div className="detail-sub">
          <span className="company">{job.company}</span>
          {job.location && <span className="muted"> · {job.location}</span>}
          {job.fitScore != null && <span className="score-pill"> · {job.fitScore}/100</span>}
        </div>
        {job.why && <div className="why">{job.why}</div>}
        <label className="status-inline">
          Status
          <select
            className={`status-select ${job.status}`}
            value={job.status}
            onChange={(e) => void changeStatus(e.target.value as JobStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="state-msg error">{error}</div>}

      {/* ---- Resume guidance ---- */}
      <section className="panel">
        <h3>Resume guidance</h3>
        {!job.description && !guidance ? (
          <div className="state-msg">No job description stored — can’t analyze this role.</div>
        ) : (
          <>
            {guidance ? (
              <div className="prep-md">
                <ReactMarkdown>{guidance.content}</ReactMarkdown>
              </div>
            ) : (
              <p className="muted">
                Reads this job against your resume + private context and tells you what to
                emphasize, cut, and position honestly — then edit your resume yourself.
              </p>
            )}
            <button className="secondary-btn" disabled={guidanceBusy} onClick={generateGuidance}>
              {guidanceBusy
                ? 'Analyzing…'
                : guidance
                  ? 'Regenerate'
                  : 'What should my resume emphasize?'}
            </button>
          </>
        )}
      </section>

      {/* ---- Interview prep ---- */}
      <section className="panel">
        <h3>Interview prep</h3>
        {!job.description && !prep ? (
          <div className="state-msg">No job description stored — can’t analyze this role.</div>
        ) : (
          <>
            {prep ? (
              <div className="prep-md">
                <ReactMarkdown>{prep.content}</ReactMarkdown>
              </div>
            ) : (
              <p className="muted">
                A strategic breakdown of the hiring manager’s real pain points and the tough
                behavioral questions they’ll likely ask.
              </p>
            )}
            <button className="secondary-btn" disabled={prepBusy} onClick={generatePrep}>
              {prepBusy ? 'Analyzing…' : prep ? 'Regenerate' : 'Generate interview prep'}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
