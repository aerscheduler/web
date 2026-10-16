import * as React from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";
import type { Matcher } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A single-date picker: a button that opens a calendar popover. Works with a
 * "yyyy-MM-dd" string (same shape as a native `<input type=", date">`) so it drops
 * straight into forms that already track the date as a string. `min`/`max` are
 * inclusive "yyyy-MM-dd" bounds (days outside them are disabled).
 */
export function DatePickerField({
  value,
  onChange,
  min,
  max,
  disabled,
  placeholder = "Pick a date",
  id,
  className,
  invalid,
  clearable,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
  /** Marks the trigger `aria-invalid` for validate-on-submit forms. */
  invalid?: boolean;
  /** Offers Clear under the calendar, for a date that may be taken back ("Not promised"). */
  clearable?: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  // Close the calendar once a date is actually chosen. Doing this in an effect
  // (keyed on the value changing) rather than inline in onSelect makes it immune
  // to the re-render onChange triggers, which can otherwise re-open the popover
  // within the same tick.
  const lastValue = React.useRef(value);
  React.useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value;
      setOpen(false);
    }
  }, [value]);

  const selected = value ? safeParse(value) : undefined;
  const minDate = min ? safeParse(min) : undefined;
  const maxDate = max ? safeParse(max) : undefined;

  // The calendar's month and year menus span the allowed range, else ten years either
  // side of today, widened to include whatever date is already set.
  const today = new Date();
  const startMonth = earliest(minDate ?? new Date(today.getFullYear() - 10, 0, 1), selected);
  const endMonth = latest(maxDate ?? new Date(today.getFullYear() + 10, 11, 31), selected);

  const matchers: Matcher[] = [];
  if (minDate) matchers.push({ before: minDate });
  if (maxDate) matchers.push({ after: maxDate });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-invalid={invalid}
          disabled={disabled}
          className={cn(
            "w-full justify-start gap-2 font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {selected ? format(selected, "MMM d, yyyy") : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? minDate}
          startMonth={startMonth}
          endMonth={endMonth}
          disabled={matchers.length ? matchers : undefined}
          onSelect={(d) => {
            if (d) onChange(format(d, "yyyy-MM-dd"));
            setOpen(false);
          }}
          autoFocus
        />
        {clearable && value && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function earliest(d: Date, other: Date | undefined): Date {
  return other && other < d ? other : d;
}

function latest(d: Date, other: Date | undefined): Date {
  return other && other > d ? other : d;
}

function safeParse(s: string): Date | undefined {
  const d = parseISO(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
