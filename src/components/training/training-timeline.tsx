import * as React from "react";
import type { EnrollmentProgress } from "@/types/api";
import { buildTimeline, monthTicks, paceWords, position, type Timeline, type TimelineStage } from "@/lib/training-timeline";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * A student's whole course at a glance: each stage a span across the months, filled as far
 * as the record goes, its stage check a diamond, and a line for today.
 *
 * Tony asked for this from the home page's training drawing (2026-09-27, backlog "Product
 * UI inspiration"). The flat list of lessons answers "what is next"; this answers the
 * question a student and a chief instructor actually ask, "when will they be done", and
 * shows where a student stalled without anyone having to read dates off thirty rows.
 *
 * Left of today is the record. Right of today is a forecast at the student's own pace, drawn
 * hatched and labelled as one, see `lib/training-timeline.ts` for exactly how it is worked out.
 */
export function TrainingTimeline({ progress, className }: { progress: EnrollmentProgress; className?: string }) {
  const e = progress.enrollment;
  const timeline = React.useMemo(
    () =>
      buildTimeline({
        status: e.status,
        enrolledAt: e.enrolledAt,
        closedAt: e.graduatedAt ?? e.terminatedAt ?? e.transferredAt ?? null,
        stages: e.courseVersion.stages,
        records: e.lessonRecords,
        completedLessonIds: progress.completedLessonIds,
      }),
    [e, progress.completedLessonIds]
  );
  if (!timeline) return null;
  return <TimelineChart t={timeline} className={className} />;
}

const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const fmtMonth = (d: Date) => d.toLocaleDateString(undefined, { month: "long", year: "numeric" });

/** Forecast shading: the same hue as the stage, striped, so it never reads as done. */
const HATCH = "repeating-linear-gradient(135deg, currentColor 0 2px, transparent 2px 7px)";

export function TimelineChart({ t, className }: { t: Timeline; className?: string }) {
  const ticks = monthTicks(t);
  const today = position(t, t.today);
  const showToday = t.basis !== "closed" && today > 0 && today < 100;

  return (
    <div className={cn("space-y-7", className)}>
      <div className="relative">
        {/* Month axis */}
        <div className="relative h-4 text-[11px] text-muted-foreground">
          {ticks.map((tick) => (
            <span key={tick.date.toISOString()} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${position(t, tick.date)}%` }}>
              {tick.label}
            </span>
          ))}
        </div>

        <div className="relative mt-3">
          {/* Month gridlines and today, behind the bars */}
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {ticks.map((tick) => (
              <span key={tick.date.toISOString()} className="absolute inset-y-0 w-px bg-border/60" style={{ left: `${position(t, tick.date)}%` }} />
            ))}
            {showToday && (
              <span className="absolute -bottom-5 top-0 w-px bg-primary/70" style={{ left: `${today}%` }}>
                {/* Under the rows, where no stage label can sit on it. */}
                <span className="absolute -bottom-0.5 left-1 text-[10px] font-medium leading-none text-primary">Today</span>
              </span>
            )}
          </div>

          <ol className="relative space-y-5">
            {t.stages.map((s) => (
              <StageRow key={s.id} t={t} stage={s} />
            ))}
          </ol>
        </div>
      </div>

      <TimelineFooter t={t} />
    </div>
  );
}

function StageRow({ t, stage }: { t: Timeline; stage: TimelineStage }) {
  const left = position(t, stage.start);
  const right = position(t, stage.end);
  const width = Math.max(right - left, 1.5);
  const doneTo = stage.actualUntil ? position(t, stage.actualUntil) : left;
  const solid = stage.state === "done" ? 100 : Math.min(100, Math.max(0, ((doneTo - left) / width) * 100));
  // The forecast starts today, never before: time already gone by with nothing flown is
  // left empty, which is exactly what a stall should look like.
  const hatchFrom = Math.max(solid, Math.min(100, ((position(t, t.today) - left) / width) * 100));

  // Same three tones as the rest of the console: success, primary, quiet.
  const tone =
    stage.state === "done"
      ? { text: "text-success", bar: "bg-success/25", border: "border-success/40", dot: "bg-success" }
      : stage.state === "current"
        ? { text: "text-primary", bar: "bg-primary/30", border: "border-primary/40", dot: "bg-primary" }
        : { text: "text-muted-foreground", bar: "bg-muted", border: "border-dashed border-border", dot: "bg-muted-foreground/40" };

  // The label sits over the bar's start, but never off the right edge.
  const labelLeft = Math.min(left, 70);

  return (
    <li>
      <p className="mb-1.5 flex items-center gap-2 text-xs" style={{ marginLeft: `${labelLeft}%` }}>
        <span className={cn("size-2 shrink-0 rounded-full", tone.dot)} aria-hidden />
        <span className="truncate font-medium text-foreground">{stage.name}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {stage.lessonsDone} of {stage.lessonsTotal}
        </span>
      </p>
      <div className="relative h-6">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn("absolute inset-y-0 overflow-hidden rounded-md border", tone.border)}
              style={{ left: `${left}%`, width: `${width}%` }}
              aria-label={`${stage.name}: ${stage.lessonsDone} of ${stage.lessonsTotal} lessons, ${fmt(stage.start)} to ${fmt(stage.end)}${stage.projected ? " (forecast)" : ""}`}
            >
              {solid > 0 && <div className={cn("h-full", tone.bar)} style={{ width: `${solid}%` }} />}
              {stage.projected && stage.state !== "done" && (
                <div
                  className={cn("absolute inset-y-0 right-0 opacity-25", tone.text)}
                  style={{ left: `${hatchFrom}%`, backgroundImage: HATCH }}
                />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {stage.lessonsDone} of {stage.lessonsTotal} lessons · {fmt(stage.start)} to {fmt(stage.end)}
            {stage.projected ? " (forecast)" : ""}
          </TooltipContent>
        </Tooltip>

        {stage.check && <StageCheck t={t} check={stage.check} />}
      </div>
    </li>
  );
}

function StageCheck({ t, check }: { t: Timeline; check: NonNullable<TimelineStage["check"]> }) {
  const at = position(t, check.date);
  const label = check.passed
    ? `Stage check passed ${fmt(check.date)}`
    : check.projected
      ? `Stage check, around ${fmt(check.date)}`
      : "Stage check";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={check.lessonName ? `${label}: ${check.lessonName}` : label}
          className={cn(
            "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border",
            check.passed ? "border-success bg-success" : "border-foreground/50 bg-background"
          )}
          style={{ left: `${at}%` }}
        />
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {check.lessonName ? ` · ${check.lessonName}` : ""}
      </TooltipContent>
    </Tooltip>
  );
}

function TimelineFooter({ t }: { t: Timeline }) {
  let text: string;
  if (t.basis === "closed") {
    text = t.finish ? `Graduated ${fmt(t.finish)}, ${Math.max(1, Math.round((t.finish.getTime() - t.start.getTime()) / 2_629_800_000))} months after starting.` : "This enrollment has ended.";
  } else if (t.lessonsDone === t.lessonsTotal) {
    const last = t.stages.reduce<Date | null>((m, s) => (s.actualUntil && (!m || s.actualUntil > m) ? s.actualUntil : m), null);
    text = last ? `Every lesson is complete. The last was flown ${fmt(last)}.` : "Every lesson is complete.";
  } else if (t.basis === "assumed") {
    text = `No lessons flown yet, so this assumes a lesson a week: finished around ${fmtMonth(t.finish!)}.`;
  } else {
    text = `At the pace so far, ${paceWords(t.daysPerLesson!)}, finished around ${fmtMonth(t.finish!)}.`;
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>{text}</span>
      <span className="flex items-center gap-3">
        <Legend swatch={<span className="size-2.5 rounded-sm bg-primary/30" />}>Flown</Legend>
        {t.basis !== "closed" && (
          <Legend swatch={<span className="size-2.5 rounded-sm text-primary opacity-50" style={{ backgroundImage: HATCH }} />}>Forecast</Legend>
        )}
        <Legend swatch={<span className="size-2 rotate-45 border border-foreground/50" />}>Stage check</Legend>
      </span>
    </div>
  );
}

function Legend({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      {children}
    </span>
  );
}
