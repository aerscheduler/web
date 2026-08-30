import * as React from "react";
import { DocsHint } from "@/components/docs-hint";
import { Loader2, Plane, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { useAdTracking, useSetAdTracking } from "@/features/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AdTrackingMode } from "@/types/api";

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

          <div className="divide-y divide-border rounded-lg border border-border">
            {(data?.aircraft ?? []).map((a) => (
              <div key={a.resourceId} className="flex items-center justify-between gap-4 px-3.5 py-2.5">
                <div className="min-w-0">
                  <Link
                    to="/aircraft/$resourceId"
                    params={{ resourceId: String(a.resourceId) }}
                    className="font-mono text-sm hover:underline"
                  >
                    {a.tailNumber}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {[a.make, a.model].filter(Boolean).join(" ") || "No make or model recorded"}
                    {a.serialNumber ? ` · s/n ${a.serialNumber}` : ""}
                  </p>
                </div>
                <QualityTag quality={a.quality} missing={a.missing} />
              </div>
            ))}
            {!data?.aircraft.length && (
              <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">
                No aircraft yet.
              </p>
            )}
          </div>

          {/* The line that has to be here whatever mode is chosen. */}
          <p className="text-xs text-muted-foreground">
            However this is set, AerScheduler never decides that an Airworthiness Directive does
            not apply to your aircraft. That determination belongs to a certificated person.
          </p>
        </CardContent>
      </Card>
    </div>
  );
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
