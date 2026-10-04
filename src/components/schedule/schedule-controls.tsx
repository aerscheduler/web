import * as React from "react";
import { addDays, addMonths, endOfWeek, format, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isCivilToday } from "@/lib/timezone";
import { cn } from "@/lib/utils";

export type ScheduleView = "month" | "week" | "day";

/** How the range is drawn: the board and its time grids, or a list of the same bookings. */
export type ScheduleLayout = "calendar" | "list";

const NOUN: Record<ScheduleView, string> = { month: "month", week: "week", day: "day" };

/** Step the anchor date by one unit of the active view. */
function stepDate(day: Date, view: ScheduleView, dir: number): Date {
  if (view === "month") return addMonths(day, dir);
  if (view === "week") return addDays(day, dir * 7);
  return addDays(day, dir);
}

/** The dispatch board control bar: date stepper, jump, view toggle, count. */
export function ScheduleControls({
  day,
  onDayChange,
  view,
  onViewChange,
  zone,
  count,
  matchCount,
  layout,
  onLayoutChange,
}: {
  day: Date;
  onDayChange: (d: Date) => void;
  view: ScheduleView;
  onViewChange: (v: ScheduleView) => void;
  /** Airport (or viewer) zone the board is pinned to. Today and the day label use this, not the browser. */
  zone: string;
  count: number | null;
  /**
   * How many of `count` match the active block filters, or null when none are active.
   *
   * The board dims non-matches rather than dropping them, so without this the count would
   * read "47 reservations" while only 12 are lit and give no hint that anything is filtered.
   */
  matchCount?: number | null;
  layout?: ScheduleLayout;
  onLayoutChange?: (l: ScheduleLayout) => void;
}) {
  const [calOpen, setCalOpen] = React.useState(false);

  const rangeLabel =
    view === "month"
      ? format(day, "MMMM yyyy")
      : view === "week"
        ? `${format(startOfWeek(day), "MMM d")}, ${format(endOfWeek(day), "MMM d")}`
        : isCivilToday(day, zone)
          ? "Today"
          : format(day, "EEE, MMM d");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* h-8, the height of the Month/Week/Day and Calendar/List switches beside it, border
          included, so the whole row lines up (Tony, 2026-10-01). */}
      <div className="flex h-8 items-stretch rounded-md border border-border bg-card">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={`Previous ${NOUN[view]}`}
              onClick={() => onDayChange(stepDate(day, view, -1))}
              className="grid w-8 place-items-center rounded-l-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{`Previous ${NOUN[view]}`}</TooltipContent>
        </Tooltip>

        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <button className="flex min-w-40 items-center justify-center gap-1.5 border-x border-border px-3 text-sm font-medium hover:bg-accent">
              <CalendarDays className="size-4 text-muted-foreground" />
              <span>{rangeLabel}</span>
              {/* No year after "Today", which already says which day it is. */}
              {view !== "month" && rangeLabel !== "Today" && (
                <span className="text-muted-foreground">{format(day, "yyyy")}</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={day}
              onSelect={(d) => {
                if (d) onDayChange(d);
                setCalOpen(false);
              }}
              autoFocus
            />
          </PopoverContent>
        </Popover>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={`Next ${NOUN[view]}`}
              onClick={() => onDayChange(stepDate(day, view, 1))}
              className="grid w-8 place-items-center rounded-r-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{`Next ${NOUN[view]}`}</TooltipContent>
        </Tooltip>
      </div>

      <Tabs value={view} onValueChange={(v) => onViewChange(v as ScheduleView)}>
        <TabsList>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="day">Day</TabsTrigger>
        </TabsList>
      </Tabs>

      {layout && onLayoutChange && (
        <Tabs value={layout} onValueChange={(v) => onLayoutChange(v === "list" ? "list" : "calendar")}>
          <TabsList aria-label="Layout">
            <TabsTrigger value="calendar" className="gap-1.5">
              <CalendarDays className="size-4" /> Calendar
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-1.5">
              <List className="size-4" /> List
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <div className={cn("ml-auto text-sm tabular-nums text-muted-foreground", count == null && "opacity-0")}>
        {matchCount != null ? (
          <>
            <span className="font-medium text-foreground">{matchCount}</span> of {count ?? 0}{" "}
            matching
          </>
        ) : (
          <>
            {count ?? 0} reservation{count === 1 ? "" : "s"}
          </>
        )}
      </div>
    </div>
  );
}
