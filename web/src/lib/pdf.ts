import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Browser-side PDF helpers: read a File and extract its text (so the AI knows the resume content).
 * pdfjs neuters the input ArrayBuffer, so we copy it before parsing.
 */

const MAX_PAGES = 5;

export async function extractText(data: ArrayBuffer): Promise<string> {
  const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
  const count = Math.min(doc.numPages, MAX_PAGES);
  const chunks: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    chunks.push(text);
  }
  await doc.destroy();
  return chunks.join('\n\n');
}

/** Read a File into an ArrayBuffer + base64 (for the upload body). */
export async function readFile(file: File): Promise<{ buffer: ArrayBuffer; base64: string }> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return { buffer, base64: btoa(binary) };
}
