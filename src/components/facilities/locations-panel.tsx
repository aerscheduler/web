import * as React from "react";
import {
  Globe,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { useDeleteLocation, useLocationDetails, useLocations, useResources } from "@/features/queries";
import type { Location, Resource } from "@/types/api";
import { ApiError } from "@/lib/api";
import { describeZone } from "@/lib/timezone";
import { useAuth } from "@/lib/auth";
import { useConfirm } from "@/components/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/states";
import { ListSearchBar } from "@/components/list-filters";
import { LocationFormModal } from "@/components/facilities/location-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

function errMessage(e: unknown, fallback: string) {
  if (e instanceof ApiError || e instanceof Error) return e.message || fallback;
  return fallback;
}

/** One line of address, skipping the parts this location happens not to have. */
export function addressLabel(location: Location): string {
  const a = location.address;
  if (!a) return "";
  const street = [a.streetAddress1, a.streetAddress2].filter(Boolean).join(", ");
  const town = [a.city, a.state].filter(Boolean).join(", ");
  return [street, town, a.zipCode].filter(Boolean).join(" · ");
}

type Counts = { planes: number; simulators: number; rooms: number };

function countsAt(resources: Resource[], locationId: number): Counts {
  const here = resources.filter((r) => r.location?.id === locationId);
  return {
    planes: here.filter((r) => r.type?.plane).length,
    simulators: here.filter((r) => r.type?.simulator).length,
    rooms: here.filter((r) => r.type?.room).length,
  };
}

function countLabel(counts: Counts): string {
  const parts: string[] = [];
  if (counts.planes) parts.push(`${counts.planes} aircraft`);
  if (counts.simulators) parts.push(`${counts.simulators} simulator${counts.simulators > 1 ? "s" : ""}`);
  if (counts.rooms) parts.push(`${counts.rooms} room${counts.rooms > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

/**
 * The airports and sites a school operates from: the record everything else hangs off.
 *
 * This is first in the Facilities rail because it is genuinely first in the setup order.
 * An aircraft cannot be created without a home base, so a school with no location here is
 * a school that cannot add its fleet, and until this screen existed the only way out was
 * the phone app.
 *
 * Two things the list is careful about:
 *
 * - **The zone is fetched per location.** `GET /locations` does not select `timeZone`, so
 *   the rows alone cannot tell "no zone" from "not asked". The detail calls do, and until
 *   they land the badge says nothing rather than something wrong.
 * - **Delete is a cascade.** The server soft-deletes every resource based here and
 *   cancels its reservations, so the confirmation counts them out loud.
 */
export function LocationsPanel({
  search,
  onSearchChange,
  addOpen,
  onAddOpenChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
}) {
  const { organization } = useAuth();
  const locationsQ = useLocations({ enabled: organization != null });
  const resourcesQ = useResources({ enabled: organization != null });
  const del = useDeleteLocation();
  const confirm = useConfirm();

  const [editing, setEditing] = React.useState<Location | null>(null);

  const locations = React.useMemo(() => locationsQ.data ?? [], [locationsQ.data]);
  const ids = React.useMemo(() => locations.map((l) => l.id), [locations]);
  const details = useLocationDetails(ids, { enabled: locations.length > 0 });

  // Zones, keyed by location id. `undefined` means the detail call hasn't answered yet;
  // `null` means the school genuinely hasn't set one.
  const zoneById = React.useMemo(() => {
    const map = new Map<number, string | null>();
    details.forEach((q, i) => {
      const id = ids[i];
      if (id == null || !q.data) return;
      map.set(id, q.data.timeZone ?? null);
    });
    return map;
  }, [details, ids]);

  const term = search.trim().toLowerCase();
  const shown = term
    ? locations.filter((l) =>
        `${l.name} ${addressLabel(l)}`.toLowerCase().includes(term)
      )
    : locations;

  const resources = resourcesQ.data ?? [];

  async function remove(location: Location) {
    const counts = countsAt(resources, location.id);
    const based = countLabel(counts);
    const ok = await confirm({
      title: `Remove ${location.name}?`,
      description: based
        ? `${based} are based here. Removing this location removes them too, and cancels their bookings. This cannot be undone from the console.`
        : "Nothing is based here, so only the location itself goes. Any booking that referenced it is cancelled.",
      confirmLabel: "Remove location",
      destructive: true,
    });
    if (!ok) return;
    del.mutate(location.id, {
      onSuccess: () => toast.success(`${location.name} removed.`),
      onError: (e) => toast.error(errMessage(e, "Couldn't remove this location.")),
    });
  }

  return (
    <>
      <ListSearchBar
        value={search}
        onChange={onSearchChange}
        placeholder="Search locations…"
        aria-label="Search locations"
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {locationsQ.isPending ? (
          <Card className="space-y-3 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </Card>
        ) : locationsQ.isError ? (
          <Card>
            <ErrorState error={locationsQ.error} onRetry={() => void locationsQ.refetch()} />
          </Card>
        ) : locations.length === 0 ? (
          <Card>
            <EmptyState
              icon={MapPin}
              title="No locations yet"
              body="Add the airport you fly from. Aircraft, simulators and rooms are all based at a location, so this comes first."
              action={
                <Button size="sm" onClick={() => onAddOpenChange(true)}>
                  <Plus className="size-4" /> Add location
                </Button>
              }
            />
          </Card>
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No locations match your search.
          </p>
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {shown.map((l) => (
              <LocationRow
                key={l.id}
                location={l}
                zone={zoneById.get(l.id)}
                counts={countsAt(resources, l.id)}
                onEdit={() => setEditing(l)}
                onDelete={() => void remove(l)}
              />
            ))}
          </Card>
        )}
      </div>

      <LocationFormModal open={addOpen} onOpenChange={onAddOpenChange} location={null} />
      <LocationFormModal
        open={editing != null}
        onOpenChange={(o) => !o && setEditing(null)}
        location={editing}
      />
    </>
  );
}

function LocationRow({
  location,
  zone,
  counts,
  onEdit,
  onDelete,
}: {
  location: Location;
  /** `undefined` while the detail call is in flight, `null` when no zone is set. */
  zone: string | null | undefined;
  counts: Counts;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const address = addressLabel(location);
  const based = countLabel(counts);

  return (
    <div className="flex items-start gap-3 px-3 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <MapPin className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{location.name}</span>
          {zone === null ? (
            <Badge variant="warning">
              <TriangleAlert className="size-3" /> No time zone
            </Badge>
          ) : zone ? (
            <Badge variant="outline">
              <Globe className="size-3" /> {describeZone(zone)}
            </Badge>
          ) : null}
        </div>
        {address && <div className="truncate text-xs text-muted-foreground">{address}</div>}
        {based && <div className="mt-0.5 text-xs text-muted-foreground">{based} based here</div>}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${location.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
