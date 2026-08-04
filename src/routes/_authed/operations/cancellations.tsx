import { useCallback, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { DateRange } from "react-day-picker";
import { endOfDay, startOfDay } from "date-fns";
import { CalendarX2 } from "lucide-react";
import { CancellationDetailSheet } from "@/components/operations/cancellation-detail-sheet";
import {
  CancellationsDataTable,
  CancellationsSummarySection,
  useCancellationFacetDefs,
  useFilteredCancellationReport,
} from "@/components/operations/cancellations-insights";
import { DateRangePicker, lastNDays } from "@/components/billing/date-range-picker";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { ListSearchBar } from "@/components/list-filters";
import { Card } from "@/components/ui/card";
import { EmptyState, TableSkeleton } from "@/components/states";
import { guardRoute } from "@/lib/permissions";
import { useListQueryState, validateListSearch } from "@/lib/list-query-state";
import type { CancelledReservation } from "@/types/api";

const FACET_KEYS = ["category", "notice"] as const;

export const Route = createFileRoute("/_authed/operations/cancellations")({
  beforeLoad: guardRoute("/operations/cancellations"),
  validateSearch: (s) => validateListSearch(s, [...FACET_KEYS]),
  component: CancellationsPage,
});

function CancellationsPage() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const [range, setRange] = useState<DateRange | undefined>(() => lastNDays(30));
  const [selected, setSelected] = useState<CancelledReservation | null>(null);
  // The page on screen, reported up by the table (which owns the client-side
  // paging), so ↑/↓ can walk it.
  const [pageRows, setPageRows] = useState<CancelledReservation[]>([]);

  /** ↑/↓ to the neighbouring cancellation, clamped at the page edges. */
  const step = useCallback(
    (delta: -1 | 1) => {
      if (!selected) return;
      const i = pageRows.findIndex((x) => x.id === selected.id);
      if (i === -1) return;
      const next = pageRows[Math.min(pageRows.length - 1, Math.max(0, i + delta))];
      if (next && next.id !== selected.id) setSelected(next);
    },
    [pageRows, selected]
  );

  const { setSearch, debouncedQ, facets, setFacets } = useListQueryState({
    storageKey: "operations-cancellations",
    search: routeSearch,
    navigate: navigate as Parameters<typeof useListQueryState>[0]["navigate"],
    facetKeys: [...FACET_KEYS],
  });

  const facetDefs = useCancellationFacetDefs();

  const startISO = range?.from ? startOfDay(range.from).toISOString() : undefined;
  const endISO = range?.to
    ? endOfDay(range.to).toISOString()
    : range?.from
      ? endOfDay(range.from).toISOString()
      : undefined;

  const listQuery = { q: debouncedQ ?? "", facets };
  const { report } = useFilteredCancellationReport(startISO, endISO, listQuery);

  if (!startISO || !endISO) {
    return (
      <TableView>
        <PageHeader
          title="Cancellations"
          subtitle="Why bookings were cancelled — searchable and exportable."
          actions={<DateRangePicker value={range} onChange={setRange} />}
        />
        <EmptyState
          icon={CalendarX2}
          title="Pick a date range"
          body="Choose start and end dates to load cancellations."
        />
      </TableView>
    );
  }

  return (
    <TableView>
      <TableView.Header>
        <PageHeader
          title="Cancellations"
          subtitle="Why bookings were cancelled — searchable and exportable."
          actions={<DateRangePicker value={range} onChange={setRange} />}
        />

        <CancellationsSummarySection
          startDate={startISO}
          endDate={endISO}
          listQuery={listQuery}
          showExport
        />

        <ListSearchBar
          value={listQuery.q}
          onChange={setSearch}
          filterValues={facets}
          onFilterChange={setFacets}
          facets={facetDefs}
          placeholder="Search aircraft, people, notes…"
        />
      </TableView.Header>

      {report.isLoading ? (
        <Card className="min-h-0 flex-1 overflow-hidden p-0">
          <TableSkeleton rows={8} cols={6} />
        </Card>
      ) : (
        <CancellationsDataTable
          startDate={startISO}
          endDate={endISO}
          listQuery={listQuery}
          onRowClick={setSelected}
          selectedId={selected?.id ?? null}
          onRowsChange={setPageRows}
        />
      )}

      <CancellationDetailSheet
        cancellation={selected}
        open={selected != null}
        onOpenChange={(open) => !open && setSelected(null)}
        onStep={step}
      />
    </TableView>
  );
}
