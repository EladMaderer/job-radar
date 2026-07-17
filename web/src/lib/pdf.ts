import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Browser-side PDF helpers for the resume upload/capture flow: read page geometry, render pages
 * to JPEGs (for the vision capture call), and extract text (a content hint). pdfjs neuters the
 * input ArrayBuffer, so every entry point copies it first.
 */

export interface PdfInfo {
  pageCount: number;
  pageSize: { widthPt: number; heightPt: number }; // page 1, in PDF points (72dpi) = mediaBox units
}

export interface RenderedPage {
  imageBase64: string; // JPEG, no data: prefix
  dataUrl: string; // full data URL for on-screen <img>
}

const MAX_LONG_EDGE = 2000;

async function load(data: ArrayBuffer): Promise<pdfjs.PDFDocumentProxy> {
  return pdfjs.getDocument({ data: data.slice(0) }).promise;
}

export async function loadPdfInfo(data: ArrayBuffer): Promise<PdfInfo> {
  const doc = await load(data);
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  const info = { pageCount: doc.numPages, pageSize: { widthPt: vp.width, heightPt: vp.height } };
  await doc.destroy();
  return info;
}

export async function renderPages(data: ArrayBuffer, maxPages: number): Promise<RenderedPage[]> {
  const doc = await load(data);
  const pages: RenderedPage[] = [];
  const count = Math.min(doc.numPages, maxPages);
  for (let i = 1; i <= count; i += 1) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, MAX_LONG_EDGE / Math.max(base.width, base.height));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    pages.push({ dataUrl, imageBase64: dataUrl.split(',')[1]! });
  }
  await doc.destroy();
  return pages;
}

export async function extractText(data: ArrayBuffer, maxPages: number): Promise<string> {
  const doc = await load(data);
  const count = Math.min(doc.numPages, maxPages);
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
