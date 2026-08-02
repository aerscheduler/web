import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SIZES, pageCount, pageRangeLabel, type PagingState } from "@/lib/paging";
import { cn } from "@/lib/utils";

/**
 * The pager under every table.
 *
 * Reads as a sentence — "1–25 of 4,861" — before it reads as controls, because
 * the count is the part people actually came for. It is also the honest signal
 * that a list is bigger than the screen: before this existed, a table that had
 * been cut off at the API's 1,000-row cap looked exactly like a table that was
 * 1,000 rows long.
 */
export function TablePagination({
  paging,
  total,
  returned,
  loading,
  showPageSize = true,
  className,
}: {
  paging: PagingState;
  total: number;
  /** Rows on screen right now — the last page is usually short. */
  returned: number;
  /**
   * A fetch is in flight. Only marks the range as busy for screen readers —
   * the controls stay live.
   *
   * They used to be disabled while fetching, which read as a dead pager: React
   * Query refetches in the background (window focus, invalidation), so the
   * buttons went inert at moments that had nothing to do with paging. Paging is
   * idempotent state, so a fast second click is simply the next page.
   */
  loading?: boolean;
  showPageSize?: boolean;
  className?: string;
}) {
  const { pageIndex, pageSize, setPageIndex, setPageSize } = paging;
  const pages = pageCount(total, pageSize);
  const first = pageIndex <= 0;
  const last = pageIndex >= pages - 1;

  // Everything fits on one page at the smallest size, so there is nothing to
  // page and no total worth stating. "1–4 of 4" under a four-row settings table
  // is noise. The moment a list outgrows one page the controls appear on their
  // own — every table is paged, whether or not it currently looks like it.
  if (pages === 1 && total <= PAGE_SIZES[0]) return null;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-between gap-3 pt-1 text-sm text-muted-foreground",
        className
      )}
    >
      <div className="flex items-center gap-4">
        <span className="tabular-nums" aria-live="polite" aria-busy={loading || undefined}>
          {pageRangeLabel(pageIndex, pageSize, returned, total)}
        </span>

        {showPageSize && (
          <label className="hidden items-center gap-2 sm:flex">
            <span className="whitespace-nowrap">Rows</span>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="h-8 w-[4.5rem]" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
      </div>

      <div className="flex items-center gap-1">
        <span className="mr-2 whitespace-nowrap tabular-nums">
          Page {(pageIndex + 1).toLocaleString()} of {pages.toLocaleString()}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label="First page"
          disabled={first}
          onClick={() => setPageIndex(0)}
        >
          <ChevronsLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label="Previous page"
          disabled={first}
          onClick={() => setPageIndex(pageIndex - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label="Next page"
          disabled={last}
          onClick={() => setPageIndex(pageIndex + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label="Last page"
          disabled={last}
          onClick={() => setPageIndex(pages - 1)}
        >
          <ChevronsRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
