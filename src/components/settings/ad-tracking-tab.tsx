import * as React from "react";
import { DocsHint } from "@/components/docs-hint";
import { Loader2, Pencil, Plane, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  useAdTracking,
  useLocations,
  useResource,
  useSetAdTracking,
} from "@/features/queries";
import { AircraftFormModal } from "@/components/aircraft/aircraft-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AdTrackingMode, AircraftAdReadiness } from "@/types/api";

/**
 * The four places a school actually sits on Airworthiness Directives.
 *
 * Written as choices a person recognises rather than as feature toggles. "Off" is first and is
 * the default, because plenty of schools use this product for oil changes and annuals and would
 * be actively harmed by a wall of candidate directives they did not ask for.
 */
/**
 * Modes with nothing behind them yet.
 *
 * "Watch for new ones" describes a catalogue that does not exist. A school that chose it would
 * believe it was being warned about newly published directives, stop watching for them itself,
 * and be wrong until somebody noticed. Shown but not selectable, so the plan is visible and the
 * promise is not made. The server refuses it too; this card is not the only door.
 */
const NOT_YET: AdTrackingMode[] = ["catalogue"];

const MODES: { value: AdTrackingMode; label: string; blurb: string; detail: string }[] = [
  {
    value: "off",
    label: "Not here",
    blurb: "We do nothing about Airworthiness Directives.",
    detail:
      "Maintenance works exactly as it does now. You can still label an inspection as coming from an AD if you want the record, but nothing is proposed, nothing is watched, and nobody is notified.",
  },
  {
    value: "manual",
    label: "I track them here",
    blurb: "You enter the ADs. We keep the compliance records.",
    detail:
      "The AD badge, the permanent compliance record, the log and the Airworthiness compliance report. We do not tell you which ADs apply to your aircraft; you add the ones your IA or your AD subscription identifies.",
  },
  {
    value: "catalogue",
    label: "Watch for new ones",
    blurb: "Not available yet. Keep watching for new ADs the way you do now.",
    detail:
      "This is not built. When it is, it will read newly published Airworthiness Directives and flag the ones naming your make, model or serial, and somebody at your school will decide for each one whether it applies. Until then nothing here watches for new directives, so whatever you use today to find out about them, keep using it.",
  },
  {
    value: "external",
    label: "Somewhere else",
    blurb: "ADlog, AVTRAK, Tdata, a spreadsheet, your mechanic's subscription.",
    detail:
      "We propose nothing and watch nothing. Any AD document we produce says on its face that applicability is tracked in the system you name, so nobody mistakes our records for the authoritative list.",
  },
];

export function AdTrackingTab() {
  const q = useAdTracking();
  const save = useSetAdTracking();

  const data = q.data;
  const [mode, setMode] = React.useState<AdTrackingMode>("off");
  const [external, setExternal] = React.useState("");
  //Fleet filter for the readiness list below. A school with fifty tails was being asked to
  //find the four missing a serial number by eye.
  const [fleetQuery, setFleetQuery] = React.useState("");
  /**
   * WHICH AEROPLANE THE EDIT FORM IS OPEN ON.
   *
   * The readiness list is where a school finds out a tail has no serial number, so it is also
   * where the serial number should be typed. The row therefore opens the ordinary aircraft
   * form rather than sending anybody off to the fleet page to find the same aeroplane again.
   *
   * The list rows carry only a resourceId, and the form needs the whole record to prefill, so
   * the resource is fetched on click and the modal stays shut until it lands. Opening it early
   * would show an EMPTY form in "Add aircraft" mode, which saves a second aeroplane.
   */
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const editingQ = useResource(editingId);
  const locationsQ = useLocations();

  React.useEffect(() => {
    if (!data) return;
    setMode(data.mode);
    setExternal(data.externalSystem ?? "");
  }, [data?.mode, data?.externalSystem]);

  const dirty = !!data && (mode !== data.mode || (external.trim() || null) !== (data.externalSystem ?? null));
  const blocked = mode === "external" && !external.trim();

  async function submit() {
    try {
      await save.mutateAsync({ mode, externalSystem: mode === "external" ? external.trim() : null });
      toast.success("Saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that.");
    }
  }

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const counts = data?.counts;
  const chosen = MODES.find((m) => m.value === mode);

  const fleet = data?.aircraft ?? [];
  //Only worth the row of chrome once the list is long enough to hunt through.
  const searchable = fleet.length > 6;
  const matches = searchable ? fleet.filter((a) => matchesFleetQuery(a, fleetQuery)) : fleet;

  return (
    <div className="space-y-5">
      <Card data-doc-shot="ad-tracking-modes">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            Airworthiness Directives
            <DocsHint topic="ad-tracking-mode" />
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            An Airworthiness Directive is binding under 14 CFR Part 39, and how much of that you
            want us involved in is your call. Nothing here is on by default, and nothing here
            tells you a directive exists: finding the ones that apply to your fleet is still
            yours to do.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {MODES.map((m) => {
              const unavailable = NOT_YET.includes(m.value);
              return (
                <button
                  key={m.value}
                  type="button"
                  disabled={unavailable}
                  aria-pressed={mode === m.value}
                  onClick={() => setMode(m.value)}
                  className={cn(
                    "rounded-lg border border-border p-3.5 text-left transition-colors",
                    unavailable && "cursor-not-allowed opacity-60",
                    mode === m.value ? "border-primary bg-primary/5" : !unavailable && "hover:bg-accent/50"
                  )}
                >
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {m.label}
                    {unavailable && (
                      <span className="rounded border border-border px-1.5 py-px text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                        Not yet
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{m.blurb}</p>
                </button>
              );
            })}
          </div>

          {chosen && (
            <p className="rounded-lg border border-border bg-muted/40 px-3.5 py-3 text-xs text-muted-foreground">
              {chosen.detail}
            </p>
          )}

          {mode === "external" && (
            <div className="space-y-1.5">
              <Label htmlFor="ad-external">Which system?</Label>
              <Input
                id="ad-external"
                value={external}
                onChange={(e) => setExternal(e.target.value)}
                placeholder="ADlog"
                maxLength={60}
              />
              <p className="text-xs text-muted-foreground">
                Printed on the Airworthiness compliance report, so a reader knows where the
                authoritative list lives.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={submit} disabled={!dirty || blocked || save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* WHAT WE COULD ACTUALLY DO, per aeroplane. Shown for every mode, not only when the
          catalogue is on: a school deciding whether to turn it on needs to see this first, and
          a school with it on needs to know when a new aeroplane arrives without a serial. */}
      <Card data-doc-shot="ad-readiness-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="size-4 text-muted-foreground" />
            What we could match
            <DocsHint topic="ad-match-quality" />
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            An AD names the aircraft it applies to by make, model and usually a serial number
            range. This is how precisely we could match each of your aeroplanes.
          </p>
          {/* THE QUESTION THIS PANEL KEPT PROVOKING: matched, and then what? Nothing, today.
              Saying so here is better than letting an admin fill in eleven serial numbers and
              go hunting for the screen that changed. */}
          <p className="text-sm text-muted-foreground">
            Matching is what <em>Watch for new ones</em> will do, and that is not built yet, so
            nothing in the product proposes a directive to you today. A serial number recorded
            now is worth having, and it also prints on the aircraft record for whoever is
            reading an AD against your fleet by hand.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {counts && counts.total > 0 && (
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
              <Stat n={counts.serial} label="by serial" tone="good" />
              <Stat n={counts.model} label="by model only" tone="warn" />
              <Stat n={counts.none} label="not enough detail" tone={counts.none ? "bad" : "muted"} />
            </div>
          )}

          {counts?.model ? (
            <p className="text-xs text-muted-foreground">
              An aeroplane matched by model only will be proposed more ADs than actually apply to
              it, because we cannot check the serial number range. Adding a serial number is the
              single thing that improves this.
            </p>
          ) : null}

          {searchable && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={fleetQuery}
                onChange={(e) => setFleetQuery(e.target.value)}
                placeholder="Search tail number, make, model or serial"
                className="pl-9"
                aria-label="Search this fleet"
              />
            </div>
          )}

          <div className="divide-y divide-border rounded-lg border border-border">
            {matches.map((a) => {
              //The click already happened and the record is on its way. Only this row says so.
              const opening = editingId === a.resourceId && editingQ.isLoading;
              return (
                <button
                  key={a.resourceId}
                  type="button"
                  onClick={() => setEditingId(a.resourceId)}
                  className="flex w-full items-center justify-between gap-4 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/50"
                >
                  {/* Spans rather than a div and two paragraphs: a button may only contain
                      phrasing content, and the row is the button. */}
                  <span className="min-w-0">
                    <span className="block font-mono text-sm">{a.tailNumber}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[a.make, a.model].filter(Boolean).join(" ") || "No make or model recorded"}
                      {a.serialNumber ? ` · s/n ${a.serialNumber}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <QualityTag quality={a.quality} missing={a.missing} />
                    {opening ? (
                      <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                    ) : (
                      <Pencil className="size-3.5 text-muted-foreground" />
                    )}
                  </span>
                </button>
              );
            })}
            {!fleet.length && (
              <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">
                No aircraft yet.
              </p>
            )}
            {!!fleet.length && !matches.length && (
              <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">
                No aircraft match "{fleetQuery.trim()}".
              </p>
            )}
          </div>

          {!!fleet.length && (
            <p className="text-xs text-muted-foreground">
              Choose an aeroplane to edit it. The serial number is the last field on that form.
            </p>
          )}

          {/* The line that has to be here whatever mode is chosen. */}
          <p className="text-xs text-muted-foreground">
            However this is set, AerScheduler never decides that an Airworthiness Directive does
            not apply to your aircraft. That determination belongs to a certificated person.
          </p>
        </CardContent>
      </Card>

      {/* Opened straight from a row above, so a school fixing four missing serial numbers
          never leaves this page. Editing an aircraft invalidates `ad-tracking`, so the counts
          and the row's own tag are right again the moment it saves. */}
      {editingQ.data && (
        <AircraftFormModal
          open
          onOpenChange={(open) => {
            if (!open) setEditingId(null);
          }}
          resource={editingQ.data}
          locations={locationsQ.data ?? []}
        />
      )}
    </div>
  );
}

/** Tail, make, model and serial. Everything the row shows is everything you can search. */
function matchesFleetQuery(a: AircraftAdReadiness, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [a.tailNumber, a.make, a.model, a.serialNumber]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(needle));
}

function Stat({ n, label, tone }: { n: number; label: string; tone: "good" | "warn" | "bad" | "muted" }) {
  return (
    <div className="bg-card px-3.5 py-3">
      <p
        className={cn(
          "tnum text-xl font-medium",
          tone === "good" && "text-[var(--success,#1c6b47)]",
          tone === "warn" && "text-[var(--warning)]",
          tone === "bad" && "text-destructive",
          tone === "muted" && "text-muted-foreground"
        )}
      >
        {n}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function QualityTag({ quality, missing }: { quality: "serial" | "model" | "none"; missing: string[] }) {
  if (quality === "serial") {
    return <span className="shrink-0 text-xs text-muted-foreground">Matched by serial</span>;
  }
  return (
    <span className="shrink-0 text-xs text-[var(--warning)]">
      {quality === "model" ? "Model only" : "Not enough detail"}
      {missing.length ? <span className="text-muted-foreground"> · add {missing.join(", ")}</span> : null}
    </span>
  );
}
