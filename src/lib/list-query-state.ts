import { useEffect, useMemo, useRef, useState } from "react";
import type { ListFilterValues } from "@/components/list-filters";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const STORAGE_PREFIX = "list-query:";

export type ListQueryState = {
  q?: string;
} & ListFilterValues;

type NavigateSearch = (opts: {
  // TanStack Router's navigate search updater — kept loose so each route can pass
  // its typed navigate without per-page casts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  search: any;
  replace?: boolean;
}) => unknown;

function isEmptyValue(v: unknown): boolean {
  return v === undefined || v === null || v === "";
}

/** True when the URL already carries any list-query field (including empty-ish we keep). */
export function listSearchHasParams(
  search: Record<string, unknown>,
  keys: string[]
): boolean {
  if (typeof search.q === "string" && search.q.length > 0) return true;
  for (const k of keys) {
    if (!isEmptyValue(search[k])) return true;
  }
  return false;
}

/**
 * Parse URL search into a typed list-query object.
 * Booleans arrive as `"true"` / `"false"` strings from the query string.
 */
export function parseListSearch(
  search: Record<string, unknown>,
  facetKeys: string[]
): ListQueryState {
  const out: ListQueryState = {};
  if (typeof search.q === "string" && search.q.trim()) {
    out.q = search.q;
  }
  for (const k of facetKeys) {
    const v = search[k];
    if (v === true || v === "true") out[k] = true;
    else if (v === false || v === "false") out[k] = false;
    else if (typeof v === "string" && v !== "") out[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = String(v);
  }
  return out;
}

/** Strip empties / defaults so the URL stays clean and shareable. */
export function serializeListSearch(
  state: ListQueryState,
  defaults: ListFilterValues = {}
): Record<string, string | boolean | undefined> {
  const out: Record<string, string | boolean | undefined> = {};
  const q = typeof state.q === "string" ? state.q.trim() : "";
  if (q) out.q = q;

  for (const [k, v] of Object.entries(state)) {
    if (k === "q") continue;
    if (isEmptyValue(v)) continue;
    if (defaults[k] !== undefined && v === defaults[k]) continue;
    if (typeof v === "boolean" || typeof v === "string") out[k] = v;
  }
  return out;
}

/**
 * Route `validateSearch` helper — keep only `q` + known facet keys.
 *
 * @example
 * validateSearch: (s) => validateListSearch(s, ["role", "grounded", "groupId"])
 */
export function validateListSearch(
  search: Record<string, unknown>,
  facetKeys: string[]
): ListQueryState {
  return parseListSearch(search, facetKeys);
}

function readStored(storageKey: string): ListQueryState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ListQueryState;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(storageKey: string, state: ListQueryState) {
  if (typeof window === "undefined") return;
  try {
    const clean = serializeListSearch(state);
    if (Object.keys(clean).length === 0) {
      window.localStorage.removeItem(STORAGE_PREFIX + storageKey);
    } else {
      window.localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(clean));
    }
  } catch {
    // private mode / quota
  }
}

/**
 * Sync list search + facets to the URL (shareable) and localStorage (return visits).
 *
 * Priority on first load:
 * 1. URL params if any list fields are present
 * 2. Else restore from localStorage into the URL
 * 3. Else defaults
 *
 * The text field updates immediately; `q` is written to the URL after debounce.
 */
export function useListQueryState({
  storageKey,
  search,
  navigate,
  facetKeys,
  defaults = {},
}: {
  storageKey: string;
  /** Current route search (from `Route.useSearch()`). */
  search: ListQueryState;
  navigate: NavigateSearch;
  facetKeys: string[];
  /** Required facet defaults (e.g. maintenance `view: "open"`). */
  defaults?: ListFilterValues;
}) {
  const urlQ = typeof search.q === "string" ? search.q : "";
  const [input, setInput] = useState(urlQ);
  const debouncedInput = useDebouncedValue(input, 250);
  const hydrated = useRef(false);

  // Browser back/forward or shared link → keep the input in sync.
  useEffect(() => {
    setInput(urlQ);
  }, [urlQ]);

  // First paint: if the URL is bare, restore the last session from localStorage.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    if (listSearchHasParams(search as Record<string, unknown>, facetKeys)) return;
    const stored = readStored(storageKey);
    if (!stored || Object.keys(serializeListSearch(stored, defaults)).length === 0) return;
    navigate({
      search: (prev: ListQueryState) => ({
        ...prev,
        ...serializeListSearch({ ...defaults, ...stored }, defaults),
      }),
      replace: true,
    });
    if (typeof stored.q === "string") setInput(stored.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once on mount
  }, []);

  // Debounced search → URL.
  useEffect(() => {
    const next = debouncedInput.trim();
    if (next === urlQ) return;
    navigate({
      search: (prev: ListQueryState) => {
        const { q: _drop, ...rest } = prev;
        return next ? { ...rest, q: next } : rest;
      },
      replace: true,
    });
  }, [debouncedInput, urlQ, navigate]);

  const facets: ListFilterValues = useMemo(() => {
    const next: ListFilterValues = { ...defaults };
    for (const k of facetKeys) {
      const v = search[k];
      if (!isEmptyValue(v)) next[k] = v as string | boolean;
    }
    return next;
  }, [search, facetKeys, defaults]);

  // Persist whenever URL-backed state changes.
  useEffect(() => {
    writeStored(storageKey, { q: urlQ || undefined, ...facets });
  }, [storageKey, urlQ, facets]);

  function setFacets(next: ListFilterValues | ((prev: ListFilterValues) => ListFilterValues)) {
    const resolved = typeof next === "function" ? next(facets) : next;
    navigate({
      search: (prev: ListQueryState) => {
        const base: Record<string, unknown> = { ...prev };
        // Drop old facet keys so cleared filters leave the URL.
        for (const k of facetKeys) delete base[k];
        const q =
          typeof base.q === "string" && base.q.trim() ? base.q.trim() : undefined;
        return {
          ...base,
          ...(q ? { q } : {}),
          ...serializeListSearch({ ...resolved }, defaults),
        };
      },
      replace: true,
    });
  }

  return {
    /** Immediate search field value. */
    search: input,
    setSearch: setInput,
    /** Debounced `q` for API calls. */
    debouncedQ: debouncedInput.trim() || undefined,
    facets,
    setFacets,
  };
}
