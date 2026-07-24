import type { ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { Gauge, MapPin, Wrench } from "lucide-react";
import type { Resource } from "@/types/api";
import { planeRate, planeStatus, planeTitle } from "@/components/aircraft/lib";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatMoney } from "@/lib/utils";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

export function AircraftDetailSheet({
  open,
  onOpenChange,
  resource,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: Resource | null;
}) {
  const p = resource?.type?.plane;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {p && resource ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <span className="font-mono">{p.tailNumber}</span>
                <StatusBadge resource={resource} />
              </SheetTitle>
              <SheetDescription>{planeTitle(p)}</SheetDescription>
            </SheetHeader>

            <div className="px-4 pb-6">
              {p.grounded && p.groundedReason && (
                <div className="mb-4 rounded-lg border border-[color-mix(in_oklch,var(--destructive)_30%,transparent)] bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] px-3 py-2 text-sm text-destructive">
                  <span className="font-medium">Grounded:</span> {p.groundedReason}
                </div>
              )}

              <SectionTitle icon={Gauge}>Times &amp; rate</SectionTitle>
              <div className="divide-y divide-border">
                <Row label="Hobbs">
                  <span className="tnum">{p.hobbsTime.toFixed(1)}</span>
                </Row>
                <Row label="Tach">
                  <span className="tnum">{p.tachTime.toFixed(1)}</span>
                </Row>
                <Row label="Rate">
                  <RateValue resource={resource} />
                </Row>
                <Row label="Billing basis">
                  {p.cost?.billByHobbsTime ? "Hobbs time" : "Tach time"}
                </Row>
                <Row label="Category & class">{p.categoryClass || "—"}</Row>
              </div>

              <Separator className="my-4" />

              <SectionTitle icon={MapPin}>Base</SectionTitle>
              <div className="divide-y divide-border">
                <Row label="Home base">{resource.location?.name ?? "—"}</Row>
                <Row label="Added">
                  {format(parseISO(resource.createdAt), "MMM d, yyyy")}
                </Row>
              </div>

              <Separator className="my-4" />

              <SectionTitle icon={Wrench}>Maintenance</SectionTitle>
              <p className="py-2 text-sm text-muted-foreground">
                Squawks, reminders, and utilization tracking are coming soon.
              </p>
            </div>
          </>
        ) : (
          <SheetHeader>
            <SheetTitle>Aircraft</SheetTitle>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: typeof Gauge;
  children: ReactNode;
}) {
  return (
    <div className="mb-1 mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="size-3.5" />
      {children}
    </div>
  );
}

function StatusBadge({ resource }: { resource: Resource }) {
  const p = resource.type?.plane;
  if (!p) return null;
  const s = planeStatus(p);
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function RateValue({ resource }: { resource: Resource }) {
  const p = resource.type?.plane;
  if (!p) return <>—</>;
  const r = planeRate(p);
  if (!r) return <span className="text-muted-foreground">Not set</span>;
  return (
    <span className="tnum">
      {formatMoney(r.cents)}
      <span className="ml-1 text-xs font-normal text-muted-foreground">
        {r.basis} {r.per}
      </span>
    </span>
  );
}
