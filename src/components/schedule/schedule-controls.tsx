import * as React from "react";
import { addDays, addMonths, endOfWeek, format, isToday, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ScheduleView = "month" | "week" | "day";

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
  count,
}: {
  day: Date;
  onDayChange: (d: Date) => void;
  view: ScheduleView;
  onViewChange: (v: ScheduleView) => void;
  count: number | null;
}) {
  const [calOpen, setCalOpen] = React.useState(false);

  const rangeLabel =
    view === "month"
      ? format(day, "MMMM yyyy")
      : view === "week"
        ? `${format(startOfWeek(day), "MMM d")} – ${format(endOfWeek(day), "MMM d")}`
        : isToday(day)
          ? "Today"
          : format(day, "EEE, MMM d");

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-lg border border-border bg-card shadow-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={`Previous ${NOUN[view]}`}
              onClick={() => onDayChange(stepDate(day, view, -1))}
              className="grid size-9 place-items-center rounded-l-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{`Previous ${NOUN[view]}`}</TooltipContent>
        </Tooltip>

        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <button className="flex min-w-40 items-center justify-center gap-1.5 border-x border-border px-3 py-2 text-sm font-medium hover:bg-accent">
              <CalendarDays className="size-4 text-muted-foreground" />
              <span>{rangeLabel}</span>
              {view !== "month" && (
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
              className="grid size-9 place-items-center rounded-r-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{`Next ${NOUN[view]}`}</TooltipContent>
        </Tooltip>
      </div>

      <Button variant="outline" size="sm" onClick={() => onDayChange(new Date())}>
        Today
      </Button>

      <Tabs value={view} onValueChange={(v) => onViewChange(v as ScheduleView)}>
        <TabsList>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="day">Day</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className={cn("ml-auto text-sm tabular-nums text-muted-foreground", count == null && "opacity-0")}>
        {count ?? 0} reservation{count === 1 ? "" : "s"}
      </div>
    </div>
  );
}
