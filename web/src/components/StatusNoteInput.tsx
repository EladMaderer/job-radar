import { useEffect, useState } from 'react';
import { STATUS_NOTE_MAX_LENGTH } from '../types.js';

/**
 * Short free-text note sitting under a status picker — e.g. why a job was rejected.
 * Saves on blur or Enter, never on each keystroke, so typing doesn't fire a request per character.
 */
export function StatusNoteInput({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (note: string) => void | Promise<void>;
}) {
  const [text, setText] = useState(value ?? '');

  // Re-sync when the saved note changes underneath us (reload, or another row reusing this input).
  useEffect(() => setText(value ?? ''), [value]);

  const commit = () => {
    const next = text.trim();
    if (next !== (value ?? '')) void onSave(next);
  };

  return (
    <input
      className="status-note"
      type="text"
      value={text}
      maxLength={STATUS_NOTE_MAX_LENGTH}
      placeholder="note…"
      title={`Short note, e.g. why rejected (max ${STATUS_NOTE_MAX_LENGTH} chars)`}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur(); // blur triggers the save
      }}
    />
  );
}
