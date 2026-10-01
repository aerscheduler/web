import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, PlaneTakeoff, Plus } from "lucide-react";
import { toast } from "sonner";
import { fetchResourceHolds, pageRows, useCurrentJobs, usePlanesPage, useLocations, useResources } from "@/features/queries";
import { TablePagination } from "@/components/table-pagination";
import { usePaging } from "@/lib/paging";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canManageResources, canOpenWorkOrders, canSeeShop } from "@/lib/permissions";
import { returnToServiceDescription } from "@/lib/outstanding-holds";
import type { Resource } from "@/types/api";
import { AircraftCard, type AircraftActions } from "@/components/aircraft/aircraft-card";
import { AircraftListRow } from "@/components/aircraft/aircraft-list-row";
import { AircraftFormModal } from "@/components/aircraft/aircraft-form";
import { GroundModal } from "@/components/aircraft/ground-modal";
import { ApproveRentersSheet } from "@/components/aircraft/approve-renters-sheet";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { ViewModeToggle, type ViewMode } from "@/components/view-mode-toggle";
import { ListSearchBar, type FacetDef } from "@/components/list-filters";
import { AIRCRAFT_CATEGORIES, label as vocabLabel } from "@/components/aircraft/vocabulary";
import { usePersistedState } from "@/hooks/use-persisted-state";
import {
  useListQueryState,
  asFacetInts,
  asFacetStrings,
  validateListSearch,
  type ListQueryState,
} from "@/lib/list-query-state";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { useConfirm } from "@/components/confirm-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const FACET_KEYS = ["grounded", "locationId"] as const;

/**
 * The school's own aeroplanes, or the customers' aeroplanes it is working on.
 *
 * A switch rather than a filter, because these are two different lists of two different
 * things: one is the fleet you fly and bill for, the other is work in the hangar that
 * belongs to somebody else. Filters narrow a list; this changes which list you are on.
 * It lives in the URL so a shop can keep the tab open on the work.
 */
type Scope = "fleet" | "shop";

export const Route = createFileRoute("/_authed/aircraft")({
  //`scope` is carried alongside the list state rather than inside it: it is not a facet,
  //and the list-state helpers would drop any key they do not recognise. Undefined for the
  //fleet so the ordinary case has a clean URL.
  validateSearch: (s): ListQueryState & { scope?: "shop" } => ({
    ...validateListSearch(s, [...FACET_KEYS]),
    //Only present when it is the shop, so `scope` stays OPTIONAL in the route's search
    //type. Returning `scope: undefined` makes the key required, and every existing
    //`<Link to="/aircraft">` in the product stops compiling.
    ...(s.scope === "shop" ? { scope: "shop" as const } : {}),
  }),
  component: AircraftPage,
});

function AircraftPage() {
  const locationsQ = useLocations();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { roles } = useAuth();
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const { search, setSearch, debouncedQ, facets, setFacets } = useListQueryState({
    storageKey: "aircraft",
    search: routeSearch,
    navigate: navigate as Parameters<typeof useListQueryState>[0]["navigate"],
    facetKeys: [...FACET_KEYS],
  });

  // A second navigate: `Route.useNavigate()` above is bound to this route's own
  // search params, which the detail route doesn't have.
  const goTo = useNavigate();

  const [view, setView] = usePersistedState<ViewMode>("view:aircraft", "grid");
  //A pilot never sees the shop, and never sees its tab. The server refuses the scope for
  //them too, so a hand-typed ?scope=shop lands on the fleet rather than on an error.
  const maySeeShop = canSeeShop(roles);
  const scope: Scope = maySeeShop && routeSearch.scope === "shop" ? "shop" : "fleet";
  const setScope = (next: Scope) =>
    void navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, scope: next === "fleet" ? undefined : next }) });
  // DOES THIS SCHOOL DO SHOP WORK AT ALL? Almost none of them do, and a tab for a thing you
  // have never had is a question you have to answer every time you open the page. So the
  // second list appears once there is something in it, and until then the only trace of the
  // feature is one item in the Add menu.
  const shopProbe = useResources({ scope: "shop" }, { enabled: maySeeShop });
  const hasShopAircraft = (shopProbe.data?.length ?? 0) > 0;
  const showScopeTabs = maySeeShop && (hasShopAircraft || scope === "shop");

  const [addOpen, setAddOpen] = React.useState(false);
  //Which KIND the add form opens on. Set by where you clicked, not by a toggle inside it.
  const [addUse, setAddUse] = React.useState<"fleet" | "shop">("fleet");
  const [editing, setEditing] = React.useState<Resource | null>(null);
  const [grounding, setGrounding] = React.useState<Resource | null>(null);
  const [approving, setApproving] = React.useState<Resource | null>(null);

  const locations = locationsQ.data ?? [];
  const locationIds = asFacetInts(facets.locationId);

  const categories = asFacetStrings(facets.category);

  const fleetFilter = {
    scope,
    q: debouncedQ,
    grounded: typeof facets.grounded === "boolean" ? facets.grounded : undefined,
    locationId: locationIds,
    //Comma-separated, matching how locationId travels. A school flying helicopters and
    //airplanes wants to look at one kind at a time.
    category: categories?.length ? categories.join(",") : undefined,
  };
  const paging = usePaging({ resetKey: fleetFilter });
  const q = usePlanesPage(fleetFilter, paging);
  // What each customer's aircraft is here for, if anything: the chip reads the job, not the
  // fact that the aircraft is a customer's. Only fetched on that tab, and only for the shop.
  // Jobs only for those who may open them; a dispatcher's chip then says "Customer aircraft".
  const jobs = useCurrentJobs({ enabled: scope === "shop" && canOpenWorkOrders(roles) });
  const jobFor = (id: number) => (scope === "shop" && jobs ? (jobs.get(id) ?? null) : undefined);
  const { rows: planes, total } = pageRows(q);
  const lcpIndex = planes.findIndex((p) => p.featuredImage);

  const filtersActive =
    !!debouncedQ ||
    facets.grounded !== undefined ||
    (categories?.length ?? 0) > 0 ||
    (locationIds?.length ?? 0) > 0;

  const facetDefs = React.useMemo<FacetDef[]>(
    () => [
      {
        kind: "boolean",
        key: "grounded",
        label: "Status",
        trueLabel: "Grounded",
        falseLabel: "Available",
      },
      {
        kind: "select",
        key: "category",
        label: "Category",
        allLabel: "All categories",
        multiple: true,
        options: AIRCRAFT_CATEGORIES.map((c) => ({ value: c, label: vocabLabel(c) })),
      },
      {
        kind: "select",
        key: "locationId",
        label: "Location",
        allLabel: "All locations",
        multiple: true,
        options: locations.map((l) => ({ value: String(l.id), label: l.name })),
      },
    ],
    [locations]
  );

  // A one-shot patch against an arbitrary id, since the shared hook is fixed-id. The
  // dedicated grounding route, NOT the generic resource PATCH this used to call: that one is
  // admin-only, so a technician could ground a tail from this menu and then get a 403 trying
  // to release it, and it writes `grounded` straight to the row, which never reaches
  // `ResourceService.unground` and so never told anyone holding a booking the tail was back.
  const unground = useMutation({
    mutationFn: (id: number) =>
      api<Resource>(`/resources/${id}/grounding`, { method: "PATCH", body: { grounded: false } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });

  const actions: AircraftActions = {
    onEdit: (r) => setEditing(r),
    onApprove: (r) => setApproving(r),
    onDetails: (r) =>
      void goTo({ to: "/aircraft/$resourceId", params: { resourceId: String(r.id) } }),
    onToggleGround: async (r) => {
      const p = r.type?.plane;
      if (!p) return;
      if (p.grounded) {
        // The same question the aircraft record asks before a release. Fetched here rather
        // than subscribed to, so it costs two requests for the one tail somebody reached for
        // instead of two for every grounded row on the page.
        const outstanding = await fetchResourceHolds(qc, r.id).catch(() => null);
        const ok = await confirm({
          title: `Return ${p.tailNumber} to service?`,
          // A check that failed must not read as an all-clear: say nothing about what is
          // open rather than claiming nothing is.
          description: outstanding
            ? returnToServiceDescription(outstanding)
            : "This aircraft will be schedulable again.",
          confirmLabel: "Return to service",
          destructive: !!outstanding?.length,
        });
        if (!ok) return;
        unground.mutate(r.id, {
          onSuccess: () => toast.success(`${p.tailNumber} returned to service`),
          onError: (err) =>
            toast.error(err instanceof Error ? err.message : "Couldn't update aircraft"),
        });
      } else {
        setGrounding(r);
      }
    },
  };

  const openAdd = (use: "fleet" | "shop") => {
    setAddUse(use);
    setAddOpen(true);
  };

  // Creating aircraft is admin-only on the server; hide the trigger otherwise.
  //
  // THE BUTTON ADDS WHAT YOU ARE LOOKING AT. Adding one of the school's own aeroplanes is
  // the overwhelming case, so it is the click; a customer's aircraft is one item in a menu
  // beside it. The form no longer asks: it opens on the kind you chose here, which is also
  // how a school that has never done shop work never meets the idea at all.
  const addButton = !canManageResources(roles) ? null : !maySeeShop ? (
    <Button onClick={() => openAdd("fleet")}>
      <Plus className="size-4" /> Add aircraft
    </Button>
  ) : (
    <div className="flex items-center">
      <Button className="rounded-r-none" onClick={() => openAdd(scope === "shop" ? "shop" : "fleet")}>
        <Plus className="size-4" /> {scope === "shop" ? "Add customer aircraft" : "Add aircraft"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="rounded-l-none border-l border-primary-foreground/25 px-2" aria-label="More ways to add an aircraft">
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => openAdd("fleet")}>
            One of yours
            <span className="block text-xs text-muted-foreground">Schedulable, and counted on your plan.</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openAdd("shop")}>
            A customer&rsquo;s aircraft
            <span className="block text-xs text-muted-foreground">In your shop for maintenance. Not scheduled, not billed.</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <TableView>
      <TableView.Header>
        <PageHeader
          title="Aircraft"
          subtitle={
            q.data
              ? scope === "shop"
                ? `${total.toLocaleString()} customer ${total === 1 ? "aircraft" : "aircraft"}`
                : `${total.toLocaleString()} ${total === 1 ? "tail" : "tails"} in the fleet`
              : scope === "shop"
                ? "Aeroplanes you look after for somebody else"
                : "Your fleet"
          }
          actions={
            <>
              {(total > 0 || filtersActive) && (
                <ViewModeToggle value={view} onChange={setView} />
              )}
              {addButton}
            </>
          }
        />
        {/* Two lists, not one list with a filter: the fleet is what the school flies and
            bills for, the other is work in the hangar that belongs to somebody else.
            "Customer aircraft" rather than "In the shop", which is trade language for a
            place and says nothing about whose aeroplanes are in it. */}
        {showScopeTabs && (
          <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <TabsList>
              <TabsTrigger value="fleet">Fleet</TabsTrigger>
              <TabsTrigger value="shop">Customer aircraft</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <ListSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search tail, make, model…"
          aria-label="Search aircraft"
          facets={facetDefs}
          filterValues={facets}
          onFilterChange={setFacets}
        />
      </TableView.Header>

      {q.isPending ? (
        <TableView.Body>
          <CardGridSkeleton />
        </TableView.Body>
      ) : q.isError ? (
        <Card className="flex flex-col min-h-0 flex-1">
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : total === 0 && !filtersActive ? (
        <Card className="flex flex-col min-h-0 flex-1">
          <EmptyState
            graphic="aircraft"
            title={scope === "shop" ? "No customer aircraft" : "No aircraft yet"}
            body={
              scope === "shop"
                ? "Aircraft you are working on for somebody else live here. They keep their own inspections and history, they cannot be booked to fly, and they are not counted toward your plan."
                : "Add your first tail so the schedule, inspections, and checkouts have something to hang off. Meters on the aircraft are what billing reads at close-out."
            }
            docs={scope === "shop" ? "work-on-a-customers-aircraft" : "add-an-aircraft"}
            action={addButton}
          />
        </Card>
      ) : total === 0 ? (
        <Card className="flex flex-col min-h-0 flex-1">
          <EmptyState
            icon={PlaneTakeoff}
            title="No aircraft match"
            body="Try a different tail number, make, or model."
          />
        </Card>
      ) : (
        <>
          <TableView.Body>
            {view === "grid" ? (
              <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", q.isFetching && "opacity-60")}>
                {planes.map((r, i) => (
                  <AircraftCard
                    key={r.id}
                    r={r}
                    actions={actions}
                    priority={i === lcpIndex}
                    job={jobFor(r.id)}
                  />
                ))}
              </div>
            ) : (
              <Card className={cn("divide-y divide-border overflow-hidden", q.isFetching && "opacity-60")}>
                {planes.map((r) => (
                  <AircraftListRow key={r.id} r={r} actions={actions} job={jobFor(r.id)} />
                ))}
              </Card>
            )}
          </TableView.Body>
          <TablePagination paging={paging} total={total} returned={planes.length} loading={q.isFetching} />
        </>
      )}

      <AircraftFormModal
        open={addOpen}
        onOpenChange={setAddOpen}
        locations={locations}
        //Adding while looking at the shop means adding a customer's aircraft.
        defaultUse={addUse}
      />
      <AircraftFormModal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        resource={editing}
        locations={locations}
      />
      <GroundModal
        open={!!grounding}
        onOpenChange={(o) => !o && setGrounding(null)}
        resource={grounding}
      />
      <ApproveRentersSheet
        open={!!approving}
        onOpenChange={(o) => !o && setApproving(null)}
        resource={approving}
      />
    </TableView>
  );
}
