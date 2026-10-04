import * as React from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Property chips, Linear's create-form row: the facts about a record that have a sensible default
 * and are usually left alone, each a small button showing its value, a click changing it
 * (Tony, 2026-09-30). Never for something the record cannot be saved without: that stays a
 * labelled field in the form (Tony, 2026-10-01).
 */
/** A chip: a property, its value as the label. Hover makes it louder, never fills it. */
export const CHIP =
  "inline-flex h-7 max-w-[16rem] min-w-0 items-center gap-1.5 rounded-md border border-border px-2 text-xs font-medium text-muted-foreground outline-none transition-colors hover:border-foreground/35 hover:text-foreground data-[state=open]:border-foreground/35 data-[state=open]:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60";

export function ChipButton({
  leading,
  set,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { leading: React.ReactNode; set?: boolean }) {
  return (
    <button type="button" className={cn(CHIP, set && "text-foreground", className)} {...props}>
      <span className="flex shrink-0 items-center">{leading}</span>
      <span className="truncate">{children}</span>
    </button>
  );
}

export function ChipMenu({
  id,
  name,
  leading,
  label,
  set,
  value,
  onChange,
  options,
  disabled,
  contentClassName,
}: {
  id: string;
  /** What the chip is, for a screen reader: "Kind: Labor". */
  name: string;
  leading: React.ReactNode;
  label: React.ReactNode;
  /** A value somebody chose, drawn brighter than a default. */
  set?: boolean;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: React.ReactNode; hint?: string }[];
  disabled?: boolean;
  contentClassName?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <ChipButton id={id} leading={leading} set={set} aria-label={`${name}: ${typeof label === "string" ? label : value}`}>
          {label}
        </ChipButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={cn("max-w-[min(20rem,calc(100vw-2rem))]", contentClassName)}>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} className="items-start">
              <span className="flex min-w-0 flex-col [overflow-wrap:anywhere]">
                {o.label}
                {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A day as a chip: "yyyy-MM-dd" or "" for none. */
export function DateChip({
  id,
  name,
  empty,
  prefix = "",
  value,
  onChange,
}: {
  id: string;
  name: string;
  empty: string;
  prefix?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? parseISO(value) : undefined;
  const label = selected ? `${prefix}${format(selected, "MMM d, yyyy")}` : empty;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ChipButton id={id} leading={<CalendarDays className="size-3.5" />} set={!!selected} aria-label={`${name}: ${label}`}>
          {label}
        </ChipButton>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            if (!d) return;
            setOpen(false);
            onChange(format(d, "yyyy-MM-dd"));
          }}
        />
        {selected && (
          <div className="border-t border-border p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                setOpen(false);
                onChange("");
              }}
            >
              {/* A day the job is done ("No day") or a date for a part ("No date"). */}
              {empty === "No day" ? "No day" : "No date"}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** A short typed value in a small popover: a number of seats, a serial number. Enter closes it. */
export function InputChip({
  id,
  name,
  leading,
  label,
  set,
  value,
  onChange,
  placeholder,
  inputMode,
  hint,
  suffix,
  disabled,
}: {
  id: string;
  name: string;
  leading: React.ReactNode;
  label: React.ReactNode;
  set?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  hint?: React.ReactNode;
  /** A unit or a control beside the input ("gal", a unit picker). */
  suffix?: React.ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <ChipButton id={`${id}-chip`} leading={leading} set={set} aria-label={`${name}: ${typeof label === "string" ? label : value || "not set"}`}>
          {label}
        </ChipButton>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2 p-3" align="start">
        <label htmlFor={id} className="text-sm font-medium">
          {name}
        </label>
        <div className="flex items-center gap-2">
          <Input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setOpen(false);
              }
            }}
            placeholder={placeholder}
            inputMode={inputMode}
            autoComplete="off"
            className="tnum"
          />
          {suffix}
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </PopoverContent>
    </Popover>
  );
}
