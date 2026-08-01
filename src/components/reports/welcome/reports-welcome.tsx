/**
 * What a school sees on Reports before it has anything to report on.
 *
 * The alternative — the real dashboard, rendering zeros — actively teaches the wrong
 * lesson: it looks like the product has nothing to offer, when in fact it has nothing
 * to offer *yet*. So this shows what each dashboard will look like, what has to happen
 * before it can be real, and how close they are.
 *
 * The previews are drawn by the SAME viz components as the live board, fed sample
 * rows. A hand-drawn mock would drift the first time a chart changed; this can't.
 *
 * This screen retires itself. `hasEnoughData` decides, and the moment a school has
 * real reservations or invoices the reports page renders normally without anyone
 * flipping a setting.
 */

import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Check, Lock, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { VizBar } from "@/components/reports/dashboard/viz-bar";
import { VizLine } from "@/components/reports/dashboard/viz-line";
import { VizMetric } from "@/components/reports/dashboard/viz-metric";
import * as S from "./sample-data";

export type ReportsReadiness = {
  reservations: number;
  invoices: number;
  reminders: number;
};

/**
 * Enough real activity that live reports beat a preview.
 *
 * A single reservation is not a report — one row on a utilization chart says less
 * than the sample does. A handful is the point where the school's own numbers start
 * telling them something, so that's the switch.
 */
export const MIN_RESERVATIONS = 5;

export function hasEnoughData(r: ReportsReadiness): boolean {
  const forced = previewWelcome();
  if (forced !== null) return !forced;
  return r.reservations >= MIN_RESERVATIONS || r.invoices > 0;
}

/**
 * `?welcome=1` forces this page on, `?welcome=0` forces it off.
 *
 * An established school can otherwise never see it, and a brand-new one can never see
 * the real reports — the switch is their own data. Read-only, like `?sub=` and
 * `?track=` elsewhere. Returns null when the URL says nothing.
 */
function previewWelcome(): boolean | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("welcome");
  return v === "1" ? true : v === "0" ? false : null;
}

type Preview = {
  id: string;
  title: string;
  blurb: string;
  /** What has to be true before this dashboard means anything. */
  unlock: { label: string; done: boolean; to: string; cta: string };
  render: () => React.ReactNode;
};

export function ReportsWelcome({
  readiness,
  onSkip,
}: {
  readiness: ReportsReadiness;
  /** Let someone look at the real (empty) reports anyway — this is a helpful
   *  default, not a wall. */
  onSkip: () => void;
}) {
  const [sample, setSample] = React.useState(true);

  const previews: Preview[] = [
    {
      id: "revenue",
      title: "Revenue",
      blurb:
        "What you invoiced, what you collected, and what's still outstanding — by week, aircraft, instructor or lesson type.",
      unlock: {
        label: "Send your first invoice",
        done: readiness.invoices > 0,
        to: "/billing",
        cta: "Open billing",
      },
      render: () => (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,9rem)_1fr]">
          <VizMetric
            metric="revenue"
            columns={S.REVENUE_COLUMNS}
            totals={S.REVENUE_TOTALS}
            previousTotals={S.REVENUE_PREVIOUS}
          />
          <div className="h-28">
            <VizLine
              rows={S.REVENUE_BY_WEEK}
              columns={S.REVENUE_COLUMNS}
              metrics={["revenue", "collected"]}
              dimension="date"
            />
          </div>
        </div>
      ),
    },
    {
      id: "utilization",
      title: "Aircraft utilization",
      blurb:
        "Hours flown per tail against the hours available, so you can see which aircraft is earning its keep and which is a hangar ornament.",
      unlock: {
        label: `Schedule ${MIN_RESERVATIONS} reservations`,
        done: readiness.reservations >= MIN_RESERVATIONS,
        to: "/schedule",
        cta: "Open the schedule",
      },
      render: () => (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,9rem)_1fr]">
          <VizMetric
            metric="hours"
            columns={S.UTILIZATION_COLUMNS}
            totals={S.UTILIZATION_TOTALS}
            previousTotals={S.UTILIZATION_PREVIOUS}
          />
          <VizBar
            rows={S.UTILIZATION_BY_TAIL}
            columns={S.UTILIZATION_COLUMNS}
            metric="hours"
            dimension="tail"
          />
        </div>
      ),
    },
    {
      id: "maintenance",
      title: "Maintenance trends",
      blurb:
        "Squawks opened and closed, and how much time is left before each aircraft's next inspection grounds it.",
      unlock: {
        label: "Add a maintenance reminder",
        done: readiness.reminders > 0,
        to: "/maintenance",
        cta: "Add reminders",
      },
      render: () => (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,9rem)_1fr]">
          <VizMetric
            metric="openSquawks"
            columns={S.MAINTENANCE_COLUMNS}
            totals={S.MAINTENANCE_TOTALS}
            previousTotals={S.MAINTENANCE_PREVIOUS}
          />
          <VizBar
            rows={S.MAINTENANCE_BY_TAIL}
            columns={S.MAINTENANCE_COLUMNS}
            metric="dueIn"
            dimension="tail"
          />
        </div>
      ),
    },
  ];

  const unlocked = previews.filter((p) => p.unlock.done).length;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-primary">
              <BarChart3 className="size-5" />
              <span className="text-sm font-medium">Reports</span>
            </div>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-balance">
              Your reports are waiting on your first few flights
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Rather than show you a board of zeros, here&rsquo;s what each dashboard looks like
              with a month of real operating data behind it — and exactly what unlocks each one.
              {unlocked > 0 && ` ${unlocked} of ${previews.length} already can be.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="sample-toggle" checked={sample} onCheckedChange={setSample} />
            <Label htmlFor="sample-toggle" className="text-sm text-muted-foreground">
              Preview with sample data
            </Label>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {previews.map((p) => (
            <PreviewCard key={p.id} preview={p} sample={sample} />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            This page steps aside on its own once your own numbers are worth reading.
          </p>
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Go to reports anyway <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </Card>
    </div>
  );
}

function PreviewCard({ preview, sample }: { preview: Preview; sample: boolean }) {
  const { unlock } = preview;
  return (
    <div className="rounded-xl border">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0 max-w-lg">
          <div className="flex items-center gap-2">
            <span className="font-medium">{preview.title}</span>
            {unlock.done ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                <Check className="size-3" /> Ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <Lock className="size-3" /> {unlock.label}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{preview.blurb}</p>
        </div>
        {!unlock.done && (
          <Button asChild size="sm" variant="outline">
            <Link to={unlock.to}>
              {unlock.cta} <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        )}
      </div>

      <div className="relative p-4">
        {/* aria-hidden: these are illustrative numbers, and a screen reader
            announcing them as this school's revenue would be a lie. */}
        <div
          aria-hidden
          className={cn("transition-all", !sample && "pointer-events-none select-none blur-[6px] opacity-40")}
        >
          {preview.render()}
        </div>
        {!sample && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="rounded-full border bg-background/90 px-3 py-1 text-xs text-muted-foreground">
              Sample data hidden
            </span>
          </div>
        )}
        {sample && (
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Wrench className="size-3" /> Sample data — not your operation
          </div>
        )}
      </div>
    </div>
  );
}
