import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeAndValidatePdf } from './resumePdf.js';
import { MAX_PDF_BYTES } from '../constants/resume.js';

test('accepts a real PDF header', () => {
  const pdf = Buffer.from('%PDF-1.7\nsome content');
  assert.ok(decodeAndValidatePdf(pdf.toString('base64')).equals(pdf));
});

test('rejects non-PDF bytes', () => {
  const notPdf = Buffer.from('PK\x03\x04 zip').toString('base64');
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
