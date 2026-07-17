import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthError } from '../auth.js';
import { useAuth } from '../AuthContext.js';
import { fetchResume, uploadResume } from '../resumeApi.js';
import { loadPdfInfo, readFile } from '../lib/pdf.js';
import type { ResumeMeta } from '../types.js';

const MAX_MB = 3;

/** Persistent top bar: home link, CV upload/status widget, sign out. */
export function Header({ onLogout }: { onLogout: () => void }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [resume, setResume] = useState<ResumeMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchResume()
      .then(setResume)
      .catch((err) => {
        if (err instanceof AuthError) logout('Your session expired — sign in again.');
      });
  }, [logout]);

  async function onFile(file: File) {
    setError(null);
    if (!/\.pdf$/i.test(file.name)) {
      setError('PDF files only.');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Max ${MAX_MB}MB — compress the PDF first.`);
      return;
    }
    setBusy(true);
    try {
      const { buffer, base64 } = await readFile(file);
      const info = await loadPdfInfo(buffer);
      const meta = await uploadResume({
        filename: file.name,
        dataBase64: base64,
        pageCount: info.pageCount,
        pageSize: info.pageSize,
      });
      setResume(meta);
      navigate('/resume');
    } catch (err) {
      if (err instanceof AuthError) logout('Your session expired — sign in again.');
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="app-header">
      <h1>
        <Link to="/">jobs-radar</Link>
      </h1>
      <div className="cv-widget">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />
        {resume ? (
          <Link to="/resume" className="cv-link" title="View / tailor your CV design">
            📄 {resume.filename}
            {!resume.capturedAt && <span className="cv-badge">capture needed</span>}
          </Link>
        ) : (
          <button className="cv-upload" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Uploading…' : 'Upload CV (PDF)'}
          </button>
        )}
        {resume && (
          <button
            className="cv-replace"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            title="Replace CV"
          >
            {busy ? '…' : 'Replace'}
          </button>
        )}
        {error && <span className="cv-error">{error}</span>}
      </div>
      <button className="logout" onClick={onLogout}>
        Sign out
      </button>
    </header>
  );
}
