/**
 * Keyword matching with word boundaries, so short/ambiguous keywords don't hit substrings:
 * `ai` misses "email", `go` misses "good", `java` misses "javascript", `react` misses "reactive".
 * Boundaries are "not preceded/followed by an alphanumeric", which also works for keywords with
 * punctuation like `c++`, `.net`, `node.js`.
 */

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const patternCache = new Map<string, RegExp>();

function patternFor(keyword: string): RegExp {
  let re = patternCache.get(keyword);
  if (!re) {
    re = new RegExp(`(?<![a-z0-9])${escapeRegExp(keyword.toLowerCase())}(?![a-z0-9])`, 'i');
    patternCache.set(keyword, re);
  }
  return re;
}

/** True if `text` contains `keyword` as a bounded token. */
export function matchesKeyword(text: string, keyword: string): boolean {
  return patternFor(keyword).test(text);
}

/** True if `text` contains any of `keywords`. */
export function matchesAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((k) => matchesKeyword(text, k));
}
