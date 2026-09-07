import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  BookingOfferingFormModal,
  OfferingRow,
} from "@/components/settings/booking-offerings-tab";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { DocsHint } from "@/components/docs-hint";
import { ListSearchBar } from "@/components/list-filters";
import { TablePagination } from "@/components/table-pagination";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { pageRows } from "@/features/queries";
import { useBookingOfferingsPage, useUpdateBookingOffering } from "@/features/booking-offerings";
import { ApiError } from "@/lib/api";
import { guardRoute } from "@/lib/permissions";
import { usePaging } from "@/lib/paging";
import { useListQueryState, validateListSearch } from "@/lib/list-query-state";
import { cn } from "@/lib/utils";
import type { BookingOffering } from "@/types/booking-offerings";

export const Route = createFileRoute("/_authed/offerings")({
  beforeLoad: guardRoute("/offerings"),
  validateSearch: (s) => validateListSearch(s, []),
  component: OfferingsPage,
});

/**
 * Discovery flights and other bookable products. Public-link on/off, embed hosts,
 * and calendar visibility stay under Settings → Booking links; this is the list.
 *
 * Admin/owner only, matching BookingOfferingService. The manageOrgSettings grant
 * can open Settings without this page, on purpose: the API would 403.
 */
function OfferingsPage() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const { search, setSearch, debouncedQ } = useListQueryState({
    storageKey: "offerings",
    search: routeSearch,
    navigate: navigate as Parameters<typeof useListQueryState>[0]["navigate"],
    facetKeys: [],
  });

  const paging = usePaging({ resetKey: debouncedQ });
  const q = useBookingOfferingsPage(paging);
  const update = useUpdateBookingOffering();
  const { rows: offerings, total } = pageRows(q);
  const needle = (debouncedQ ?? "").trim().toLowerCase();
  const visible = needle
    ? offerings.filter(
        (o) =>
          o.name.toLowerCase().includes(needle) ||
          o.slug.toLowerCase().includes(needle) ||
          (o.description ?? "").toLowerCase().includes(needle)
      )
    : offerings;
  const searching = needle.length > 0;

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BookingOffering | null>(null);

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(offering: BookingOffering) {
    setEditing(offering);
    setFormOpen(true);
  }

  function toggleActive(offering: BookingOffering) {
    update.mutate(
      { id: offering.id, active: !offering.active },
      {
        onSuccess: () =>
          toast.success(
            offering.active ? `"${offering.name}" paused.` : `"${offering.name}" activated.`
          ),
        onError: (e) =>
          toast.error(
            e instanceof ApiError || e instanceof Error
              ? e.message || "Couldn't update this offering."
              : "Couldn't update this offering."
          ),
      }
    );
  }

  return (
    <TableView>
      <TableView.Header>
        <PageHeader
          title="Offerings"
          subtitle={
            <span className="inline-flex flex-wrap items-center gap-1.5">
              Discovery flights and other bookable products. Public requests live under{" "}
              <Link
                to="/settings"
                search={{ tab: "booking-offerings" }}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Settings → Booking links
              </Link>
              .
              <DocsHint topic="booking-offerings" />
            </span>
          }
          actions={
            <Button onClick={openAdd}>
              <Plus className="size-4" /> Add offering
            </Button>
          }
        />
        <ListSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search offerings…"
          aria-label="Search offerings"
        />
      </TableView.Header>

      {q.isPending ? (
        <TableView.Body>
          <CardGridSkeleton />
        </TableView.Body>
      ) : q.isError ? (
        <Card className="flex min-h-0 flex-1 flex-col p-0">
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : total === 0 && !searching ? (
        <Card className="flex min-h-0 flex-1 flex-col p-0">
          <EmptyState
            graphic="booking-offerings"
            title="No offerings yet"
            body="Create a discovery flight or other preset with fixed duration, eligible aircraft, and optional instructor pool."
            docs="public-booking-links"
            action={
              <Button onClick={openAdd}>
                <Plus className="size-4" /> Add offering
              </Button>
            }
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card className="flex min-h-0 flex-1 flex-col p-0">
          <EmptyState
            title="No offerings match"
            body="Try a different name or slug."
          />
        </Card>
      ) : (
        <>
          <TableView.Body>
            <Card className={cn("divide-y divide-border overflow-hidden", q.isFetching && "opacity-60")}>
              {visible.map((offering) => (
                <OfferingRow
                  key={offering.id}
                  offering={offering}
                  onEdit={openEdit}
                  onToggleActive={toggleActive}
                  busy={update.isPending}
                />
              ))}
            </Card>
          </TableView.Body>
          <TablePagination
            paging={paging}
            total={total}
            returned={offerings.length}
            loading={q.isFetching}
          />
        </>
      )}

      <BookingOfferingFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        offering={editing}
      />
    </TableView>
  );
}
