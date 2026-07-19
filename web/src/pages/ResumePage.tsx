import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthError } from '../auth.js';
import { useAuth } from '../AuthContext.js';
import {
  fetchResume,
  fetchResumePdfBytes,
  saveResumeContext,
  saveResumeText,
} from '../resumeApi.js';
import { extractText } from '../lib/pdf.js';
import type { ResumeMeta } from '../types.js';

/**
 * Simple CV page: your uploaded resume + a private "real experience" context box. Both feed the
 * per-job resume guidance and interview prep (never shown on the resume). No design capture.
 */
export function ResumePage() {
  const { logout } = useAuth();
  const [resume, setResume] = useState<ResumeMeta | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const [context, setContext] = useState('');
  const [contextDirty, setContextDirty] = useState(false);
  const [contextSaved, setContextSaved] = useState(false);
  const [savingContext, setSavingContext] = useState(false);
  const backfilled = useRef(false);

  const onErr = (err: unknown) => {
    if (err instanceof AuthError) logout('Your session expired — sign in again.');
    else setError(err instanceof Error ? err.message : String(err));
  };

  useEffect(() => {
    fetchResume().then(setResume).catch(onErr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resume && !contextDirty) setContext(resume.context ?? '');
  }, [resume, contextDirty]);

  // Auto-heal: if an already-uploaded resume has no extracted text (e.g. uploaded before this
  // feature), re-extract it in the browser from the stored PDF and save it — no re-upload needed.
  useEffect(() => {
    if (!resume || resume.hasText || backfilled.current) return;
    backfilled.current = true;
    (async () => {
      try {
        const bytes = await fetchResumePdfBytes();
        const text = await extractText(bytes);
        if (text.trim()) setResume(await saveResumeText(text));
      } catch (err) {
        onErr(err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume]);

  async function saveContextNotes() {
    setSavingContext(true);
    setError(null);
    try {
      setResume(await saveResumeContext(context));
      setContextDirty(false);
      setContextSaved(true);
      window.setTimeout(() => setContextSaved(false), 2500);
    } catch (err) {
      onErr(err);
    } finally {
      setSavingContext(false);
    }
  }

  if (resume === undefined) return <div className="state-msg">loading…</div>;
  if (resume === null) {
    return (
      <div className="page">
        <Link to="/" className="back-link">
          ← back to jobs
        </Link>
        <div className="state-msg">No CV uploaded yet. Use “Upload CV (PDF)” in the top bar.</div>
      </div>
    );
  }

  return (
    <div className="page resume-page">
      <div className="page-head">
        <Link to="/" className="back-link">
          ← back to jobs
        </Link>
        <h2>Your CV</h2>
      </div>

      {error && <div className="state-msg error">{error}</div>}

      <section className="panel">
        <h3>Resume file</h3>
        <p className="muted">
          📄{' '}
          <a href="/api/resume?pdf=1" target="_blank" rel="noreferrer">
            {resume.filename}
          </a>
          {resume.hasText ? ' — text read ✓' : ' — reading text…'}
        </p>
        <p className="muted">Replace it any time with “Replace” in the top bar.</p>
      </section>

      <section className="panel context-panel">
        <h3>Private context — your real experience</h3>
        <p className="muted">
          Notes about your actual depth of experience (things the resume doesn’t capture, or
          overstates). The AI uses this — with your resume — to give honest per-role guidance. e.g.{' '}
          <em>
            “Resume says full-stack, but my backend is mostly theoretical with a little practical.”
          </em>{' '}
          <b>Private</b> — never shown on your resume or anywhere else.
        </p>
        <textarea
          className="context-input"
          placeholder="What should the AI know about your real experience?"
          value={context}
          onChange={(e) => {
            setContext(e.target.value);
            setContextDirty(true);
          }}
        />
        <div className="chat-actions">
          <button
            className="secondary-btn"
            disabled={savingContext || !contextDirty}
            onClick={saveContextNotes}
          >
            {savingContext ? 'Saving…' : 'Save context'}
          </button>
          {contextSaved && <span className="ok-badge">saved ✓</span>}
        </div>
      </section>
    </div>
  );
}
