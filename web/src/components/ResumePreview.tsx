/** Sandboxed preview of the server-rendered resume HTML. The CSS is LLM-generated (untrusted),
 * so the iframe runs with no privileges; Google Fonts still load fine inside srcDoc. */
export function ResumePreview({
  html,
  pageSize,
}: {
  html: string;
  pageSize?: { widthPt: number; heightPt: number };
}) {
  const aspect = pageSize ? pageSize.widthPt / pageSize.heightPt : 0.7727;
  return (
    <iframe
      className="resume-preview"
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={html}
      title="resume preview"
      style={{ aspectRatio: String(aspect) }}
    />
  );
}
