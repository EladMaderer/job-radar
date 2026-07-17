import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeAndValidatePdf, tailoredPdfFilename } from './resumePdf.js';
import { MAX_PDF_BYTES } from '../constants/resume.js';

test('accepts a real PDF header', () => {
  const pdf = Buffer.from('%PDF-1.7\nsome content');
  const out = decodeAndValidatePdf(pdf.toString('base64'));
  assert.ok(out.equals(pdf));
});

test('rejects non-PDF bytes with the magic-byte message', () => {
  const notPdf = Buffer.from('PK\x03\x04 this is a zip').toString('base64');
  assert.throws(() => decodeAndValidatePdf(notPdf), /Not a PDF file/);
});

test('rejects empty input', () => {
  assert.throws(() => decodeAndValidatePdf(''), /Empty file/);
});

test('rejects oversized files', () => {
  const big = Buffer.alloc(MAX_PDF_BYTES + 1, 0x20);
  big.write('%PDF-1.4', 0, 'latin1');
  assert.throws(() => decodeAndValidatePdf(big.toString('base64')), /too large/i);
});

test('tailoredPdfFilename sanitizes and combines', () => {
  assert.equal(tailoredPdfFilename('Elad CV.pdf', 'Acme / Inc.'), 'Elad-CV--Acme-Inc.pdf');
  assert.equal(tailoredPdfFilename('resume.PDF', 'Wix'), 'resume--Wix.pdf');
  assert.equal(tailoredPdfFilename('.pdf', ''), 'resume.pdf');
  assert.equal(tailoredPdfFilename('my cv.pdf', '  '), 'my-cv.pdf');
});

test('resumeContent: invalid shapes rejected with clear messages', async () => {
  const { parseResumeContent } = await import('./resumeContent.js');
  assert.throws(() => parseResumeContent({}), /Invalid resume content/);
  assert.throws(
    () =>
      parseResumeContent({
        header: { name: 'x', title: null, contacts: [] },
        layout: { columns: 3, sidebar: [] }, // invalid columns
        sections: [],
      }),
    /Invalid resume content: layout/,
  );
});
