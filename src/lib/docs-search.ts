/**
 * Help documentation search, inside the console.
 *
 * The palette already searches a school's own records. What it could not do
 * until now is answer "how do I close out a flight", which is the question
 * somebody actually has when they reach for search and find nothing. That
 * answer is written, published, and searchable on the marketing site, so this
 * module puts the same corpus behind the same box.
 *
 * There is no docs search service and no second index. `website` builds
 * `public/search-index.json` at deploy time from the docs registry and the
 * OpenAPI document, and this fetches that exact file and queries it with the
 * same engine and the same field weights the site uses. One corpus means the
 * console cannot fall behind the docs, and a newly published article is
 * findable here the moment the site deploys, with nothing to do in this repo.
 *
 * Three rules this has to keep:
 *
 *   Never block the palette. The index is a couple of hundred KB from ANOTHER
 *   origin, so it is fetched on first open and every failure is swallowed. If
 *   www is down, or slow, or the CORS header is missing, the docs group is
 *   simply absent and the org's own records behave exactly as before.
 *
 *   Never navigate. These are pages on a different site; a hit opens in a new
 *   tab so nobody loses the half-filled form they were on when the question
 *   came up. See `docsResultUrl`.
 *
 *   Stay a guest in the contract. `SearchRecord` mirrors the site's
 *   `lib/search.ts` and the site's builder owns it. Fields are read
 *   defensively, and an unknown `type` is dropped rather than rendered.
 */

import MiniSearch, { type SearchResult as MiniSearchResult } from "minisearch";
import { SITE_URL } from "@/lib/docs-links";

/**
 * The site indexes five kinds of page. These two are the documentation: help
 * articles under /docs and the API reference under /docs/api.
 *
 * The other three (marketing feature pages, SEO guides, and site pages like
 * /pricing) are deliberately not here. They are written for somebody deciding
 * whether to buy, and this palette belongs to somebody who already did and is
 * mid-task. Widening the set is a one-line change if that ever stops being
 * true; the whole file is downloaded either way.
 */
export const DOCS_SEARCH_TYPES = ["docs", "api"] as const;

export type DocsSearchType = (typeof DOCS_SEARCH_TYPES)[number];

/** One indexed page, or one heading within one. Written by the website's builder. */
export type DocsSearchRecord = {
  id: string;
  type: DocsSearchType;
  title: string;
  /** Site-absolute, e.g. "/docs/billing/close-out-a-flight#hobbs". */
  href: string;
  /** Breadcrumb above the title, e.g. ["Documentation", "Billing", "Invoices"]. */
  path: string[];
  /** Present when the record has a written summary. Otherwise the UI uses `body`. */
  description?: string;
  keywords?: string;
  body?: string;
};

/**
 * Field weights, copied from the site's `lib/search.ts` deliberately.
 *
 * A title in this corpus is a question somebody asked ("Why a flight has no
 * Hobbs") rather than a label, so it dominates. `keywords` carries the docs
 * registry's `seoQuery`, which is literally the phrase people type. Body is the
 * widest net and the weakest signal, and without the gap a passing mention in a
 * long reference article outranks the article about the thing.
 */
const FIELD_BOOST = { title: 6, path: 2, description: 3, keywords: 4, body: 1 };

export type DocsSearchEngine = {
  index: MiniSearch<DocsSearchRecord>;
  byId: Map<string, DocsSearchRecord>;
};

/** Where the index lives. Point at a local `website` dev server to work on it. */
const INDEX_URL = `${SITE_URL}/search-index.json`;

let enginePromise: Promise<DocsSearchEngine> | null = null;

function isIndexable(record: unknown): record is DocsSearchRecord {
  if (!record || typeof record !== "object") return false;
  const r = record as Partial<DocsSearchRecord>;
  return (
    typeof r.id === "string" &&
    typeof r.title === "string" &&
    typeof r.href === "string" &&
    DOCS_SEARCH_TYPES.includes(r.type as DocsSearchType)
  );
}

function buildEngine(records: DocsSearchRecord[]): DocsSearchEngine {
  const index = new MiniSearch<DocsSearchRecord>({
    fields: ["title", "path", "description", "keywords", "body"],
    extractField: (record, field) => {
      const value = record[field as keyof DocsSearchRecord];
      return Array.isArray(value) ? value.join(" ") : ((value ?? "") as string);
    },
    searchOptions: {
      boost: FIELD_BOOST,
      // Every term must match something: "hobbs meter" should not return every
      // article containing "meter", which is what OR would do.
      combineWith: "AND",
      prefix: true,
      // Fuzziness only past four characters. Below that a typo is less likely
      // than a real word one edit away, and "sim" starts matching "sms".
      fuzzy: (term) => (term.length > 4 ? 0.2 : false),
    },
  });
  index.addAll(records);
  return { index, byId: new Map(records.map((record) => [record.id, record])) };
}

/**
 * Fetch and index the corpus, once per page load.
 *
 * The PROMISE is cached rather than the result, so the palette opening twice
 * before the first fetch lands shares one request. A failure clears the cache
 * so the next open retries rather than serving a permanently empty search.
 */
export function loadDocsIndex(): Promise<DocsSearchEngine> {
  if (!enginePromise) {
    enginePromise = fetch(INDEX_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`docs search index: HTTP ${response.status}`);
        return response.json();
      })
      .then((data: unknown) => {
        const records = (data as { records?: unknown[] } | null)?.records;
        if (!Array.isArray(records)) throw new Error("docs search index: no records");
        return buildEngine(records.filter(isIndexable));
      })
      .catch((error) => {
        enginePromise = null;
        throw error;
      });
  }
  return enginePromise;
}

/** Exposed for tests, which must not share one module-level index between cases. */
export function resetDocsIndexForTests() {
  enginePromise = null;
}

/**
 * The best documentation hits for `query`.
 *
 * Capped hard, and by page rather than by record. Documentation is indexed one
 * record per heading, so an uncapped list on a term like "billing" is the same
 * three articles eight times over, sitting on top of the aircraft and people
 * the member was actually looking for. The palette is the school's records
 * first; this is the answer waiting underneath them.
 */
export function searchDocs(
  engine: DocsSearchEngine,
  query: string,
  limit = 4
): DocsSearchRecord[] {
  const text = query.trim();
  if (!text) return [];

  const bestPerPage = new Map<string, DocsSearchRecord>();
  for (const hit of engine.index.search(text) as MiniSearchResult[]) {
    const record = engine.byId.get(String(hit.id));
    if (!record) continue;
    // Same article, different anchor. Keep the first, which scored best.
    const page = record.href.split("#")[0]!;
    if (!bestPerPage.has(page)) bestPerPage.set(page, record);
    if (bestPerPage.size >= limit) break;
  }
  return [...bestPerPage.values()];
}

/** The absolute URL of a hit, anchor included, for opening in a new tab. */
export function docsResultUrl(record: DocsSearchRecord): string {
  return `${SITE_URL}${record.href.startsWith("/") ? "" : "/"}${record.href}`;
}

/**
 * Open a documentation page in a new tab.
 *
 * A synthesised anchor click rather than `window.open`. Passing a features
 * string to `window.open` asks for a popup WINDOW rather than a tab, which is
 * both the wrong thing and the shape popup blockers stop; omitting the string
 * gets a tab but hands the new page a live `window.opener` back into a
 * signed-in console. An anchor carrying `rel="noopener noreferrer"` is the one
 * form that means what it says, and it behaves the same for a click and for
 * Enter on a keyboard-selected row.
 */
export function openDocsPage(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * The line under a result.
 *
 * Heading and FAQ records carry no `description`, because on the site it would
 * have been a prefix of `body` and storing both doubles a thousand records. So
 * the snippet comes from whichever field the record actually has.
 */
export function docsSnippet(record: DocsSearchRecord, max = 120): string {
  const source = record.description ?? record.body ?? "";
  if (source.length <= max) return source;
  const cut = source.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}...`;
}

/**
 * The breadcrumb shown beside a hit, without the leading "Documentation".
 *
 * The group heading already says Help docs, so repeating it on every row spends
 * the width that tells you WHICH article a heading came from.
 */
export function docsResultPath(record: DocsSearchRecord): string[] {
  const path = Array.isArray(record.path) ? record.path : [];
  return path[0] === "Documentation" ? path.slice(1) : path;
}
