import * as React from "react";

/**
 * Stripe-style match highlight: wrap every case-insensitive occurrence of
 * `query` in a <mark>. Empty query returns the text unchanged.
 *
 * Contiguous substring only — we don't have fuzzy/OpenSearch ranking, so
 * highlighting the typed needle is the honest visual. Multi-word queries
 * highlight the whole phrase, then each token that didn't already match.
 */
export function highlightMatch(text: string, query: string): React.ReactNode {
  const needle = query.trim();
  if (!needle || !text) return text;

  const ranges = matchRanges(text, needle);
  if (ranges.length === 0) return text;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < ranges.length; i++) {
    const [start, end] = ranges[i]!;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={i} className="search-match">
        {text.slice(start, end)}
      </mark>
    );
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

/** Inclusive-start exclusive-end ranges, sorted and non-overlapping. */
function matchRanges(text: string, query: string): Array<[number, number]> {
  const lower = text.toLowerCase();
  const tokens = [query.toLowerCase(), ...query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2)];
  const seen = new Set<string>();
  const unique = tokens.filter((t) => {
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });

  const hits: Array<[number, number]> = [];
  for (const token of unique) {
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(token, from);
      if (idx === -1) break;
      hits.push([idx, idx + token.length]);
      from = idx + token.length;
    }
  }

  if (hits.length === 0) return [];
  hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Merge overlaps so nested phrase+token hits don't double-wrap.
  const merged: Array<[number, number]> = [hits[0]!];
  for (let i = 1; i < hits.length; i++) {
    const [s, e] = hits[i]!;
    const last = merged[merged.length - 1]!;
    if (s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}
