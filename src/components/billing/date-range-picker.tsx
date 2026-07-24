import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { addDays, format, startOfDay } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 12 months", days: 365 },
] as const;

/** Builds a range ending today and starting `days - 1` days back (inclusive today). */
export function lastNDays(days: number): DateRange {
  const today = startOfDay(new Date());
  return { from: addDays(today, -(days - 1)), to: today };
}

function label(range: DateRange | undefined) {
  if (!range?.from) return "Pick a date range";
  if (!range.to) return format(range.from, "MMM d, yyyy");
  const sameYear = range.from.getFullYear() === range.to.getFullYear();
  return `${format(range.from, sameYear ? "MMM d" : "MMM d, yyyy")} – ${format(range.to, "MMM d, yyyy")}`;
}

/**
 * Date-range control (Popover + range Calendar) with quick presets. Drives the
 * `startDate`/`endDate` window the Billing screen passes to the invoices query.
 */
export function DateRangePicker({
  value,
  onChange,
  className,
}: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start gap-2 font-normal",
            !value?.from && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="size-4 shrink-0 opacity-70" />
          <span className="truncate">{label(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex flex-col sm:flex-row">
          <div className="flex shrink-0 flex-row gap-1 border-b p-2 sm:flex-col sm:border-b-0 sm:border-r">
            {PRESETS.map((p) => (
              <Button
                key={p.days}
                variant="ghost"
                size="sm"
                className="justify-start whitespace-nowrap font-normal"
                onClick={() => {
                  onChange(lastNDays(p.days));
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Separator className="sm:hidden" />
          <div>
            <Calendar
              mode="range"
              numberOfMonths={1}
              defaultMonth={value?.from}
              selected={value}
              onSelect={onChange}
              autoFocus
            />
            <div className="flex justify-end border-t p-2">
              <Button size="sm" onClick={() => setOpen(false)} disabled={!value?.from || !value.to}>
                Done
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
