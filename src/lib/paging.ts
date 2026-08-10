import { useCallback, useEffect, useMemo, useRef, useState } from "react";

//---------------------------------------------------------------------------------
// Table paging, shared by every table in the console.
//
// Paging is server-side everywhere, deliberately. The API caps every list at
// 1,000 rows, so a client that renders "everything it was given" is not showing
// a big collection slowly, it is showing a truncated one confidently. Our
// largest school has 7,823 reservations and 4,861 invoices; a month-long date
// range on Billing was fetching every invoice in it to draw fifty.
//
// The same argument settles sorting and searching: both happen on the server,
// beside the slicing. Sorting a page client-side orders the fifty rows the
// browser happens to be holding and presents it as "the largest invoices",
// which is wrong in a way nobody can see.
//---------------------------------------------------------------------------------

/** Rows per page. 25 fits a laptop without scrolling; the rest are for people who scroll. */
export const PAGE_SIZES = [25, 50, 100, 250] as const;
export const DEFAULT_PAGE_SIZE = 25;

const SIZE_STORAGE_KEY = "aer.table-page-size";

export type SortState = { key: string; dir: "asc" | "desc" } | null;

/** What a paged endpoint answers with: `data` plus the `pagination` block beside it. */
export type Paged<T> = {
  rows: T[];
  /** How many there are in all, before the page was taken. */
  total: number;
  hasMore: boolean;
};

export type PagingState = {
  pageIndex: number;
  pageSize: number;
  sort: SortState;
  setPageIndex: (i: number) => void;
  setPageSize: (n: number) => void;
  setSort: (s: SortState) => void;
  /**
   * The query params to hand the API. Spread straight into a hook's filter.
   * `useInvoicesPage({ startDate, q, ...paging.query })`.
   */
  query: { limit: number; offset: number; sort?: string; order?: "asc" | "desc" };
};

function storedPageSize(): number {
  if (typeof window === "undefined") return DEFAULT_PAGE_SIZE;
  const raw = Number.parseInt(window.localStorage.getItem(SIZE_STORAGE_KEY) ?? "", 10);
  return (PAGE_SIZES as readonly number[]).includes(raw) ? raw : DEFAULT_PAGE_SIZE;
}

/**
 * Page state for one table.
 *
 * `resetKey` is the thing this table is currently filtered by, a search box, a
 * date range, a status tab. When it changes the table goes back to page one,
 * because the alternative is the bug everyone has hit: type a search while on
 * page 7, get three results, and stare at an empty table that says there are
 * three of them.
 *
 * Page SIZE is remembered across visits and across tables (someone who wants
 * 100 rows wants 100 rows everywhere); page INDEX is not, because "where you
 * were in a list you have since re-filtered" is not a preference.
 */
export function usePaging({
  resetKey,
  defaultSort = null,
  pageSize: fixedPageSize,
}: {
  resetKey?: unknown;
  defaultSort?: SortState;
  /** Pin the size and hide the size picker, for a table with a deliberate shape. */
  pageSize?: number;
} = {}): PagingState {
  const [pageIndex, setPageIndexRaw] = useState(0);
  const [pageSize, setPageSizeRaw] = useState(() => fixedPageSize ?? storedPageSize());
  const [sort, setSortRaw] = useState<SortState>(defaultSort);

  const serializedKey = useMemo(() => JSON.stringify(resetKey ?? null), [resetKey]);
  const lastKey = useRef(serializedKey);

  useEffect(() => {
    if (lastKey.current === serializedKey) return;
    lastKey.current = serializedKey;
    setPageIndexRaw(0);
  }, [serializedKey]);

  const setPageSize = useCallback((n: number) => {
    setPageSizeRaw(n);
    // Row 60 of 25-per-page is row 60 of 100-per-page too, but there is no
    // honest way to keep someone in place across a resize, so go back to the
    // top rather than land them somewhere they didn't ask to be.
    setPageIndexRaw(0);
    try {
      window.localStorage.setItem(SIZE_STORAGE_KEY, String(n));
    } catch {
      // private mode / quota, the size just won't persist
    }
  }, []);

  const setSort = useCallback((next: SortState) => {
    setSortRaw(next);
    // A new sort is a new collection order, so page 3 means something else now.
    setPageIndexRaw(0);
  }, []);

  const query = useMemo(
    () => ({
      limit: pageSize,
      offset: pageIndex * pageSize,
      ...(sort ? { sort: sort.key, order: sort.dir } : {}),
    }),
    [pageIndex, pageSize, sort]
  );

  return {
    pageIndex,
    pageSize,
    sort,
    setPageIndex: setPageIndexRaw,
    setPageSize,
    setSort,
    query,
  };
}

/**
 * Page an array the client already holds in full.
 *
 * The narrow exception to "paging is server-side". Use it ONLY when the whole
 * result is genuinely in hand, a *report* endpoint that answers one object
 * (rows plus its own computed summary) rather than a capped list. Those are not
 * truncated at 1,000 rows, so slicing locally shows a real page of a real total.
 *
 * Do not reach for this to avoid wiring a list endpoint. On anything served by
 * a list route the array is capped, so a local slice would page confidently
 * through a set that had already been cut off, and the total would be the size
 * of the truncation rather than the size of the collection.
 *
 * Sorting is applied here too, for the same reason it is applied on the server
 * elsewhere: it has to happen before the slice, or it orders one page.
 */
export function useClientPage<T>(
  rows: T[],
  paging: PagingState,
  /** How to read a sort key off a row, when a column's key isn't a plain field. */
  valueAt: (row: T, key: string) => unknown = (row, key) =>
    key.split(".").reduce<unknown>((acc, k) => (acc == null ? acc : (acc as Record<string, unknown>)[k]), row)
): { rows: T[]; total: number } {
  return useMemo(() => {
    const sort = paging.sort;
    const ordered = !sort
      ? rows
      : [...rows].sort((a, b) => {
          const left = valueAt(a, sort.key);
          const right = valueAt(b, sort.key);
          const leftEmpty = left === null || left === undefined || left === "";
          const rightEmpty = right === null || right === undefined || right === "";
          // Blanks sink in both directions, matching the server.
          if (leftEmpty || rightEmpty) return leftEmpty && rightEmpty ? 0 : leftEmpty ? 1 : -1;
          const dir = sort.dir === "desc" ? -1 : 1;
          if (typeof left === "number" && typeof right === "number") return dir * (left - right);
          return dir * String(left).localeCompare(String(right), "en", { numeric: true });
        });

    const start = paging.pageIndex * paging.pageSize;
    return { rows: ordered.slice(start, start + paging.pageSize), total: rows.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- valueAt is a stable default
  }, [rows, paging.pageIndex, paging.pageSize, paging.sort]);
}

/** Page count for a total, never below 1 so "page 1 of 0" can't render. */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

/** "1–25 of 4,861", the range currently on screen. */
export function pageRangeLabel(
  pageIndex: number,
  pageSize: number,
  returned: number,
  total: number
): string {
  if (total === 0) return "No rows";
  const first = pageIndex * pageSize + 1;
  const last = pageIndex * pageSize + returned;
  return `${first.toLocaleString()}–${last.toLocaleString()} of ${total.toLocaleString()}`;
}
