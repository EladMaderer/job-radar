/**
 * Greenhouse returns job `content` as entity-encoded HTML (e.g. `&lt;p&gt;Build&amp;nbsp;…`).
 * We store plain text for display and keyword scoring, so strip tags AND decode entities —
 * decoding matters because "&amp;" left in place would break a keyword like "R&D".
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = parseInt(entity.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    if (entity.startsWith('#')) {
      const code = parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

/**
 * Convert an HTML fragment to collapsed plain text.
 *
 * Greenhouse `content` arrives entity-encoded (`&lt;p&gt;…`), so we decode FIRST to reveal the
 * real tags, strip them, then decode once more for entities that lived inside the text (e.g.
 * `R&amp;D` → `R&D`). The second decode is a no-op when nothing remains encoded.
 */
export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null;
  const markup = decodeEntities(html);
  const withBreaks = markup
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decodeEntities(withBreaks)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .trim();
  return text.length > 0 ? text : null;
}
