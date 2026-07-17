import type { ResumeContent, ResumeItem, ResumeSection } from './resumeContent.js';

/**
 * Deterministic renderer: content JSON + captured CSS -> self-contained HTML document. This is
 * the single source of truth for the skeleton the captured CSS targets (the class contract is
 * documented in SKELETON_CONTRACT and baked into the capture prompt). Pure and unit-tested.
 *
 * Security: every text value is HTML-escaped (LLM output is untrusted), and font links are
 * allowlisted to Google Fonts. The preview iframe is fully sandboxed on top of this.
 */

export interface PageSize {
  widthPt: number;
  heightPt: number;
}

const FONT_LINK_PREFIX = 'https://fonts.googleapis.com/';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderItem(item: ResumeItem): string {
  const parts: string[] = [];
  if (item.title) parts.push(`<div class="item-title">${escapeHtml(item.title)}</div>`);
  if (item.subtitle) parts.push(`<div class="item-subtitle">${escapeHtml(item.subtitle)}</div>`);
  if (item.meta) parts.push(`<div class="item-meta">${escapeHtml(item.meta)}</div>`);
  if (item.text) parts.push(`<p class="item-text">${escapeHtml(item.text)}</p>`);
  if (item.bullets.length > 0) {
    const lis = item.bullets.map((b) => `<li class="bullet">${escapeHtml(b)}</li>`).join('');
    parts.push(`<ul class="bullets">${lis}</ul>`);
  }
  return `<div class="item">${parts.join('')}</div>`;
}

function renderSection(section: ResumeSection): string {
  // Section id lands in the class name; strip anything outside safe slug characters.
  const idSlug = section.id.replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    `<section class="section section-${idSlug}">` +
    `<h2 class="heading">${escapeHtml(section.heading)}</h2>` +
    section.items.map(renderItem).join('') +
    `</section>`
  );
}

function renderBody(content: ResumeContent): string {
  const sections = content.sections;
  if (content.layout.columns === 2) {
    const sidebarIds = new Set(content.layout.sidebar);
    const sidebar = sections.filter((s) => sidebarIds.has(s.id));
    const main = sections.filter((s) => !sidebarIds.has(s.id));
    return (
      `<div class="body">` +
      `<div class="sidebar">${sidebar.map(renderSection).join('')}</div>` +
      `<div class="main">${main.map(renderSection).join('')}</div>` +
      `</div>`
    );
  }
  return `<div class="body">${sections.map(renderSection).join('')}</div>`;
}

function renderHeader(content: ResumeContent): string {
  const h = content.header;
  const parts = [`<div class="name">${escapeHtml(h.name)}</div>`];
  if (h.title) parts.push(`<div class="title">${escapeHtml(h.title)}</div>`);
  if (h.contacts.length > 0) {
    const spans = h.contacts.map((c) => `<span class="contact">${escapeHtml(c)}</span>`).join('');
    parts.push(`<div class="contacts">${spans}</div>`);
  }
  return `<header class="header">${parts.join('')}</header>`;
}

/**
 * Base rules the captured CSS builds on: exact page size from the original PDF, zero page
 * margins (the design's margin is .resume padding, per the capture contract), print-exact
 * colors, and page-break hygiene (never split an item or orphan a heading; sections MAY split —
 * a long Experience section can legitimately span pages).
 */
function baseCss(pageSize: PageSize): string {
  return `*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
@page { size: ${pageSize.widthPt}pt ${pageSize.heightPt}pt; margin: 0; }
html, body { margin: 0; padding: 0; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.item, .heading { break-inside: avoid; }
.heading { break-after: avoid; }
ul.bullets { list-style-position: outside; }`;
}

export function renderResumeHtml(
  content: ResumeContent,
  css: string,
  fontLinks: string[],
  pageSize: PageSize,
): string {
  const links = fontLinks
    .filter((href) => href.startsWith(FONT_LINK_PREFIX))
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join('');
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
    links +
    `<style>${baseCss(pageSize)}\n/* --- captured design --- */\n${css}</style>` +
    `</head><body>` +
    `<div class="resume">${renderHeader(content)}${renderBody(content)}</div>` +
    `</body></html>`
  );
}
