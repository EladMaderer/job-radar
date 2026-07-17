import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

/**
 * HTML -> real text-based PDF via headless Chromium. This module is imported ONLY by the
 * download endpoint so @sparticuz/chromium's ~60MB binary stays out of every other function
 * bundle (Vercel traces dependencies per function).
 *
 * Local dev: the Lambda-packaged binary doesn't run on macOS — set LOCAL_CHROME_PATH in .env
 * (e.g. /Applications/Google Chrome.app/Contents/MacOS/Google Chrome).
 */
export async function renderPdf(html: string): Promise<Buffer> {
  const localPath = process.env.LOCAL_CHROME_PATH;
  const executablePath = localPath ?? (await chromium.executablePath());
  if (!executablePath) {
    throw new Error(
      'No Chromium available. On local dev set LOCAL_CHROME_PATH to your Chrome binary.',
    );
  }

  const browser = await puppeteer.launch({
    args: localPath ? [] : chromium.args,
    executablePath,
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    // Web fonts load asynchronously after 'load' — wait for them explicitly before printing.
    await page.evaluate('document.fonts.ready');
    // Page dimensions come from the renderer's `@page { size: ...pt ...pt }` — page.pdf's own
    // width/height don't accept pt units, so we defer entirely to preferCSSPageSize.
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close(); // never leak a Chromium on a warm serverless instance
  }
}
