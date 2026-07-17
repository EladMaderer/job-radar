import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { updateJobStatus } from '../api.js';
import { AuthError } from '../auth.js';
import { useAuth } from '../AuthContext.js';
import { fetchResume } from '../resumeApi.js';
import {
  downloadTailorPdf,
  fetchJob,
  fetchPrep,
  fetchTailor,
  postPrep,
  postTailor,
  resetTailor,
} from '../tailorApi.js';
import { ResumePreview } from '../components/ResumePreview.js';
import {
  STATUSES,
  statusLabel,
  type JobDetail,
  type JobStatus,
  type PrepState,
  type ResumeMeta,
  type TailorState,
} from '../types.js';

export function JobDetailPage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const { logout } = useAuth();

  const [job, setJob] = useState<JobDetail | null | undefined>(undefined);
  const [resume, setResume] = useState<ResumeMeta | null>(null);
  const [tailor, setTailor] = useState<TailorState | null>(null);
  const [prep, setPrep] = useState<PrepState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tailorBusy, setTailorBusy] = useState(false);
  const [prepBusy, setPrepBusy] = useState(false);
  const [message, setMessage] = useState('');

  const onErr = (err: unknown, setter?: (m: string) => void) => {
    if (err instanceof AuthError) logout('Your session expired — sign in again.');
    else (setter ?? setError)(err instanceof Error ? err.message : String(err));
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
    fetchResume()
      .then(setResume)
      .catch(() => {});
    fetchTailor(id)
      .then(setTailor)
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

  async function generateTailor(msg?: string) {
    setTailorBusy(true);
    setError(null);
    try {
      const next = await postTailor(id, msg);
      setTailor(next);
      setMessage('');
    } catch (err) {
      onErr(err);
    } finally {
      setTailorBusy(false);
    }
  }

  async function startOver() {
    setTailorBusy(true);
    try {
      await resetTailor(id);
      setTailor(null);
    } catch (err) {
      onErr(err);
    } finally {
      setTailorBusy(false);
    }
  }

  async function download() {
    try {
      await downloadTailorPdf(id);
    } catch (err) {
      onErr(err);
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

  const resumeReady = !!resume?.capturedAt && !!resume?.html;

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

      {/* ---- Tailored resume ---- */}
      <section className="panel">
        <h3>Tailored resume</h3>
        {!resume ? (
          <div className="state-msg">Upload your CV (top bar) to tailor it to this role.</div>
        ) : !resumeReady ? (
          <div className="state-msg">
            Capture your CV design first — <Link to="/resume">open the CV page</Link>.
          </div>
        ) : !job.description && !tailor ? (
          <div className="state-msg">
            No job description was stored for this role, so it can’t be tailored.
          </div>
        ) : !tailor ? (
          <div className="tailor-empty">
            <p className="muted">
              Generate a version of your resume tuned to this job — same facts, reframed and
              reordered to lead with what they’re looking for.
            </p>
            <button className="primary-btn" disabled={tailorBusy} onClick={() => generateTailor()}>
              {tailorBusy ? 'Tailoring… (~30–60s)' : 'Generate tailored resume'}
            </button>
          </div>
        ) : (
          <div className="tailor-grid">
            <ResumePreview html={tailor.html} pageSize={resume.pageSize} />
            <div className="tailor-side">
              {tailor.note && <p className="tailor-note">{tailor.note}</p>}
              {tailor.changes.length > 0 && (
                <ul className="changes">
                  {tailor.changes.map((c, i) => (
                    <li key={i}>
                      <b>{c.where}:</b> {c.what}
                    </li>
                  ))}
                </ul>
              )}
              <div className="chat-box">
                <textarea
                  placeholder="Ask for changes — e.g. “lead with the React Native experience”, “shorten the summary”, “emphasize the AI work”."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={tailorBusy}
                />
                <div className="chat-actions">
                  <button
                    className="secondary-btn"
                    disabled={tailorBusy || !message.trim()}
                    onClick={() => generateTailor(message.trim())}
                  >
                    {tailorBusy ? 'Working…' : 'Apply changes'}
                  </button>
                  <button className="primary-btn" disabled={tailorBusy} onClick={download}>
                    Download PDF
                  </button>
                  <button className="ghost-btn" disabled={tailorBusy} onClick={startOver}>
                    Start over
                  </button>
                </div>
              </div>
            </div>
          </div>
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
