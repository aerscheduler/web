import { format } from "date-fns";
import type { RecurrenceInput } from "@/types/api";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * The "Repeat" control on the booking form.
 *
 * Modelled on Google Calendar because that is the mental model people already have for
 * repeating events: pick a cadence, pick the days, say when it stops.
 *
 * Deliberately weekly-only for now — that is what a flight school actually asks for
 * ("Sarah takes the plane every Tuesday at nine") and the server rejects anything else,
 * so offering daily/monthly here would just be a way to produce errors.
 */

export type RecurrenceState = {
  enabled: boolean;
  interval: number;
  daysOfWeek: number[];
  /** "on" = until a date, "after" = a number of occurrences. */
  endMode: "on" | "after";
  until: string; // yyyy-MM-dd
  count: number;
};

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function defaultRecurrence(startAt: Date | null, date: string): RecurrenceState {
  const anchor = startAt ?? (date ? new Date(`${date}T12:00:00`) : new Date());
  const day = Number.isNaN(anchor.getTime()) ? new Date().getDay() : anchor.getDay();
  const until = new Date(Number.isNaN(anchor.getTime()) ? Date.now() : anchor.getTime());
  until.setMonth(until.getMonth() + 2);

  return {
    enabled: false,
    interval: 1,
    daysOfWeek: [day],
    endMode: "on",
    until: format(until, "yyyy-MM-dd"),
    count: 8,
  };
}

/**
 * Turn the form state into the server's rule, or null when it isn't repeating.
 * Returns a `problem` instead of throwing so the form can block submit and say why —
 * the server validates all of this again, this is just the fast path.
 */
export function toRecurrenceInput(
  state: RecurrenceState,
  startAt: Date | null,
  endAt: Date | null,
  timeZoneName: string
): { input: RecurrenceInput | null; problem: string | null } {
  if (!state.enabled) return { input: null, problem: null };
  if (!startAt || !endAt) return { input: null, problem: "Pick a start and end time first." };
  if (state.daysOfWeek.length === 0) return { input: null, problem: "Pick at least one day to repeat on." };

  const durationMins = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
  if (durationMins <= 0) return { input: null, problem: "The end time has to be after the start time." };

  if (state.endMode === "after" && (!Number.isFinite(state.count) || state.count < 1)) {
    return { input: null, problem: "Number of times has to be at least 1." };
  }
  if (state.endMode === "on" && !state.until) {
    return { input: null, problem: "Pick a date for the repeat to end on." };
  }

  return {
    problem: null,
    input: {
      frequency: "weekly",
      interval: state.interval,
      daysOfWeek: [...state.daysOfWeek].sort((a, b) => a - b),
      startTime: format(startAt, "HH:mm"),
      durationMins,
      timeZoneName,
      startDate: format(startAt, "yyyy-MM-dd"),
      until: state.endMode === "on" ? state.until : null,
      count: state.endMode === "after" ? state.count : null,
    },
  };
}

/** Plain-language summary, so nobody has to infer what they just configured. */
export function summarise(state: RecurrenceState): string {
  const days = [...state.daysOfWeek].sort((a, b) => a - b).map((d) => DAY_NAMES[d]);
  const cadence = state.interval === 1 ? "every week" : `every ${state.interval} weeks`;
  const on = days.length ? ` on ${days.join(", ")}` : "";
  const end =
    state.endMode === "on"
      ? state.until
        ? ` until ${state.until}`
        : ""
      : ` — ${state.count} time${state.count === 1 ? "" : "s"}`;
  return `Repeats ${cadence}${on}${end}.`;
}

export function RecurrenceField({
  value,
  onChange,
  disabled,
}: {
  value: RecurrenceState;
  onChange: (next: RecurrenceState) => void;
  disabled?: boolean;
}) {
  const set = (patch: Partial<RecurrenceState>) => onChange({ ...value, ...patch });

  const toggleDay = (day: number) => {
    const has = value.daysOfWeek.includes(day);
    //Never let the last day be removed — a weekly rule with no days can't produce
    //anything, and the server would reject it. Better to make it impossible here.
    if (has && value.daysOfWeek.length === 1) return;
    set({ daysOfWeek: has ? value.daysOfWeek.filter((d) => d !== day) : [...value.daysOfWeek, day] });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        <Label htmlFor="repeat">Repeat</Label>
        <Select
          value={value.enabled ? "weekly" : "none"}
          onValueChange={(v) => set({ enabled: v === "weekly" })}
          disabled={disabled}
        >
          <SelectTrigger id="repeat">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Does not repeat</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {value.enabled && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="repeat-interval">Every</Label>
              <Select
                value={String(value.interval)}
                onValueChange={(v) => set({ interval: Number(v) })}
                disabled={disabled}
              >
                <SelectTrigger id="repeat-interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n === 1 ? "week" : `${n} weeks`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>On</Label>
              <div className="flex gap-1">
                {DAY_LABELS.map((label, day) => {
                  const active = value.daysOfWeek.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleDay(day)}
                      aria-pressed={active}
                      aria-label={DAY_NAMES[day]}
                      className={cn(
                        "size-8 rounded-full border text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:bg-accent",
                        disabled && "opacity-50"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="repeat-end">Ends</Label>
              <Select
                value={value.endMode}
                onValueChange={(v) => set({ endMode: v as "on" | "after" })}
                disabled={disabled}
              >
                <SelectTrigger id="repeat-end">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">On a date</SelectItem>
                  <SelectItem value="after">After a number of times</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="repeat-endvalue">{value.endMode === "on" ? "Until" : "Times"}</Label>
              {value.endMode === "on" ? (
                <Input
                  id="repeat-endvalue"
                  type="date"
                  value={value.until}
                  disabled={disabled}
                  onChange={(e) => set({ until: e.target.value })}
                />
              ) : (
                <Input
                  id="repeat-endvalue"
                  type="number"
                  min={1}
                  max={200}
                  value={value.count}
                  disabled={disabled}
                  onChange={(e) => set({ count: Number(e.target.value) })}
                />
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {summarise(value)} Every date has to be free — if one clashes, nothing is booked and
            you&apos;ll be told which.
          </p>
        </div>
      )}
    </div>
  );
}
