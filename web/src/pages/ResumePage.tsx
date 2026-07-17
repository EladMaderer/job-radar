import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthError } from '../auth.js';
import { useAuth } from '../AuthContext.js';
import { approveResume, captureResume, fetchResume, fetchResumePdfBytes } from '../resumeApi.js';
import { renderPages, extractText, type RenderedPage } from '../lib/pdf.js';
import { ResumePreview } from '../components/ResumePreview.js';
import type { ResumeMeta } from '../types.js';

const MAX_PAGES = 3;

/**
 * Design-capture page: original PDF pages (left) vs the reconstructed HTML preview (right). The
 * user captures the design once, chat-refines it, then approves. Per-job tailoring reuses it.
 */
export function ResumePage() {
  const { logout } = useAuth();
  const [resume, setResume] = useState<ResumeMeta | null | undefined>(undefined);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  const onErr = (err: unknown) => {
    if (err instanceof AuthError) logout('Your session expired — sign in again.');
    else setError(err instanceof Error ? err.message : String(err));
  };

  useEffect(() => {
    fetchResume().then(setResume).catch(onErr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render the original PDF's page images once per uploaded file (for the side-by-side + capture).
  useEffect(() => {
    if (!resume || loadedFor.current === resume.uploadedAt) return;
    loadedFor.current = resume.uploadedAt;
    (async () => {
      try {
        const bytes = await fetchResumePdfBytes();
        setPages(await renderPages(bytes, MAX_PAGES));
        setText(await extractText(bytes, MAX_PAGES));
      } catch (err) {
        onErr(err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume]);

  async function runCapture(refineMessage?: string) {
    if (pages.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const meta = await captureResume(
        pages.map((p) => ({ imageBase64: p.imageBase64 })),
        text,
        refineMessage,
      );
      setResume(meta);
      setMessage('');
    } catch (err) {
      onErr(err);
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    try {
      setResume(await approveResume());
    } catch (err) {
      onErr(err);
    } finally {
      setBusy(false);
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

  const captured = !!resume.html;

  return (
    <div className="page resume-page">
      <div className="page-head">
        <Link to="/" className="back-link">
          ← back to jobs
        </Link>
        <h2>Your CV design</h2>
        <span className="muted">{resume.filename}</span>
        {resume.approvedAt && <span className="ok-badge">approved ✓</span>}
      </div>

      {error && <div className="state-msg error">{error}</div>}

      <p className="muted">
        We reconstruct your PDF’s design once so each tailored resume keeps the exact look. Compare
        the original (left) with the reconstruction (right); refine with a note if anything’s off.
      </p>

      <div className="capture-grid">
        <div className="capture-col">
          <div className="col-title">Original PDF</div>
          {pages.length === 0 ? (
            <div className="state-msg">rendering pages…</div>
          ) : (
            pages.map((p, i) => (
              <img key={i} className="pdf-page" src={p.dataUrl} alt={`page ${i + 1}`} />
            ))
          )}
        </div>
        <div className="capture-col">
          <div className="col-title">Reconstruction</div>
          {captured ? (
            <ResumePreview html={resume.html!} pageSize={resume.pageSize} />
          ) : (
            <div className="state-msg">
              {busy ? 'Capturing the design… (this takes ~30–60s)' : 'Not captured yet.'}
            </div>
          )}
        </div>
      </div>

      {!captured ? (
        <button
          className="primary-btn"
          disabled={busy || pages.length === 0}
          onClick={() => runCapture()}
        >
          {busy ? 'Capturing…' : 'Capture design'}
        </button>
      ) : (
        <div className="capture-actions">
          {resume.captureMessages.length > 0 && (
            <div className="chat-log">
              {resume.captureMessages.map((m, i) => (
                <div key={i} className={`chat-msg ${m.role}`}>
                  {m.text}
                </div>
              ))}
            </div>
          )}
          <div className="chat-box">
            <textarea
              placeholder="Refine the design — e.g. “make the name bigger”, “tighten the spacing”, “use a serif font for headings”."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={busy}
            />
            <div className="chat-actions">
              <button
                className="secondary-btn"
                disabled={busy || !message.trim()}
                onClick={() => runCapture(message.trim())}
              >
                {busy ? 'Working…' : 'Refine design'}
              </button>
              <button className="primary-btn" disabled={busy} onClick={approve}>
                Capture looks good ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
