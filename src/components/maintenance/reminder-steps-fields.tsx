import * as React from "react";
import { Plus, X } from "lucide-react";
import type { ReminderSteps } from "@/types/api";
import { MAX_STEPS, type StepKey } from "@/lib/reminder-steps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DocsHint } from "@/components/docs-hint";

/**
 * Edit reminder steps (Murray spec 6): for the shop and for the aircraft's owners, a list of
 * days before a calendar due date and of hours before an hour one. A list the value does not set
 * shows its default, muted, and editing it makes it this rule's (or this aircraft's) own; "Use
 * the default" hands it back. Due always goes out whatever the lists say.
 */
export function ReminderStepsFields({
  value,
  onChange,
  defaults,
  clocks,
  owners,
  defaultLabel = "Default",
  idPrefix,
}: {
  value: ReminderSteps;
  onChange: (next: ReminderSteps) => void;
  /** What each list is when the value does not set it. */
  defaults: Required<ReminderSteps>;
  /** Which clocks the inspection counts: a list for a clock it does not have is not shown. */
  clocks: { days: boolean; hours: boolean };
  /** Show the owners' lists: an aircraft with owners, or a rule that may cover customer aircraft. */
  owners: boolean;
  /** What a list not set here follows: "Default", or "The rule's" on one aircraft. */
  defaultLabel?: string;
  idPrefix: string;
}) {
  const row = (key: StepKey, label: string) => {
    const unit = key.endsWith("Days") ? "days" : "hours";
    return (
      <StepList
        key={key}
        id={`${idPrefix}-${key}`}
        label={label}
        unit={unit}
        steps={value[key]}
        fallback={defaults[key]}
        defaultLabel={defaultLabel}
        onChange={(steps) => {
          const next = { ...value };
          if (steps === undefined) delete next[key];
          else next[key] = steps;
          onChange(next);
        }}
      />
    );
  };
  return (
    <div className="space-y-4" data-testid={`${idPrefix}-reminder-steps`}>
      <div className="space-y-2.5">
        <p className="flex items-center gap-1 text-[13px] font-medium">
          Remind the shop <DocsHint topic="reminder-steps" />
        </p>
        {clocks.days && row("shopDays", "Days before it is due")}
        {clocks.hours && row("shopHours", "Hours before it is due")}
      </div>
      {owners && (
        <div className="space-y-2.5">
          <p className="text-[13px] font-medium">Remind the owners</p>
          {clocks.days && row("ownerDays", "Days before it is due")}
          {clocks.hours && row("ownerHours", "Hours before it is due")}
        </div>
      )}
      <p className="text-[12px] text-muted-foreground">
        Each reminder goes once, the nearest one only. Everybody is told when it comes due, and the shop once more if it is still not signed off a day later.
      </p>
    </div>
  );
}

function StepList({
  id,
  label,
  unit,
  steps,
  fallback,
  defaultLabel,
  onChange,
}: {
  id: string;
  label: string;
  unit: "days" | "hours";
  /** Undefined: following the default. */
  steps: number[] | undefined;
  fallback: number[];
  defaultLabel: string;
  onChange: (steps: number[] | undefined) => void;
}) {
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const own = steps !== undefined;
  const shown = [...(steps ?? fallback)].sort((a, b) => b - a);
  const word = (n: number) => (unit === "hours" ? `${(n / 10).toFixed(n % 10 ? 1 : 0)} h` : `${n} ${n === 1 ? "day" : "days"}`);

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    const n = unit === "hours" ? Math.round(Number(t) * 10) : Number(t);
    const max = unit === "hours" ? 10_000 : 365;
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > max) {
      setError(unit === "hours" ? "Hours from 0.1 to 1,000, like 25 or 2.5." : "Whole days from 1 to 365.");
      return;
    }
    if (shown.includes(n)) return setDraft("");
    if (shown.length >= MAX_STEPS) return setError(`Up to ${MAX_STEPS} reminders.`);
    setError(null);
    setDraft("");
    onChange([...shown, n].sort((a, b) => b - a));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[12px] text-muted-foreground">
          {label}
        </label>
        {own && (
          <button type="button" className="text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={() => onChange(undefined)}>
            Use {defaultLabel.toLowerCase()}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {shown.map((n) => (
          <span
            key={n}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full border border-border px-2.5 text-[12px] tnum",
              own ? "bg-accent/60 text-foreground" : "text-muted-foreground"
            )}
          >
            {word(n)}
            <button type="button" aria-label={`Remove ${word(n)}`} className="text-muted-foreground hover:text-foreground" onClick={() => onChange(shown.filter((s) => s !== n))}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        {!shown.length && <span className="text-[12px] text-muted-foreground">None before it is due</span>}
        {!own && shown.length > 0 && <span className="text-[11px] text-muted-foreground">{defaultLabel}</span>}
        <span className="inline-flex items-center gap-1">
          <Input
            id={id}
            inputMode="decimal"
            value={draft}
            placeholder={unit === "hours" ? "25" : "60"}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className="h-7 w-16 px-2 text-[12px] tnum"
            aria-invalid={error ? true : undefined}
          />
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={add} aria-label={`Add a reminder, in ${unit}`}>
            <Plus className="size-3.5" /> {unit === "hours" ? "h" : "days"}
          </Button>
        </span>
      </div>
      {error && <p className="text-[12px] text-destructive">{error}</p>}
    </div>
  );
}
