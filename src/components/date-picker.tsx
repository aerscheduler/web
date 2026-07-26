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
 * "yyyy-MM-dd" string (same shape as a native `<input type="date">`) so it drops
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
          disabled={matchers.length ? matchers : undefined}
          onSelect={(d) => {
            if (d) onChange(format(d, "yyyy-MM-dd"));
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

function safeParse(s: string): Date | undefined {
  const d = parseISO(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
