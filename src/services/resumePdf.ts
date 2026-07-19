import { MAX_PDF_BYTES } from '../constants/resume.js';

/** Pure PDF-upload validation (unit-tested; no I/O). */

/** Decode a base64 upload and validate it is a real, size-capped PDF. Throws a clear message. */
export function decodeAndValidatePdf(dataBase64: string): Buffer {
  let buffer: Buffer;
  try {
    buffer = Buffer.from(dataBase64, 'base64');
  } catch {
    throw new Error('Invalid file encoding — expected base64.');
  }
  if (buffer.length === 0) throw new Error('Empty file.');
  if (buffer.length > MAX_PDF_BYTES) {
    throw new Error(
      `File too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB) — max is ${MAX_PDF_BYTES / 1024 / 1024}MB. Compress the PDF first.`,
    );
  }
  // Magic bytes: every PDF starts with "%PDF-".
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error('Not a PDF file — only PDF resumes are supported.');
  }
  return buffer;
}
