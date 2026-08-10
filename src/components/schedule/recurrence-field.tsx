import * as React from "react";
import { format } from "date-fns";
import type { MonthlyMode, RecurrenceFrequency, RecurrenceInput } from "@/types/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DocsHint } from "@/components/docs-hint";
import { Label } from "@/components/ui/label";
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
 * Modelled on Google Calendar, and specifically on the thing Google gets right: the
 * booking form shows ONE dropdown of ready-made cadences derived from the date you
 * already picked ("Weekly on Monday", ", Monthly on the fourth Monday") and everything
 * fiddly lives behind "Custom…". That is what keeps this usable in a narrow modal; the
 * previous version put seven day-chips, an interval and an end picker inline, and they
 * overflowed the dialog.
 *
 * The presets are computed from the start date, so they always describe something real:
 * pick the 27th and you are offered "Monthly on the fourth Monday", not an abstract
 * "Monthly" you then have to go and configure.
 *
 * ONE DELIBERATE DIVERGENCE FROM GOOGLE: there is no "Never" ending. A repeating booking
 * here materialises real reservations that hold a real aircraft, so it has to be bounded.
 * Every preset therefore carries a sensible finite end, shown in the summary line and
 * changeable in Custom.
 */

export type RecurrenceEndMode = "on" | "after";

export type RecurrenceState = {
  enabled: boolean;
  frequency: RecurrenceFrequency;
  interval: number;
  /** Weekly only. 0 = Sunday … 6 = Saturday. */
  daysOfWeek: number[];
  /** Monthly only. */
  monthlyMode: MonthlyMode;
  endMode: RecurrenceEndMode;
  until: string; // yyyy-MM-dd
  count: number;
};

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDINALS = ["", "first", "second", "third", "fourth", "fifth"];

/* ── calendar helpers ─────────────────────────────────────────────────────────
 * Deliberately mirrors server/src/utils/recurrence.ts. The server is the authority, it
 * re-derives all of this and rejects anything that doesn't hold, but the picker has to
 * know "is the 27th the last Monday?" to offer the right presets without a round trip.
 */

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 1 for the first Monday of the month, 4 for the fourth. */
function weekdayOrdinalOf(day: number): number {
  return Math.floor((day - 1) / 7) + 1;
}

function isLastWeekdayOfMonth(d: Date): boolean {
  return d.getDate() + 7 > daysInMonth(d.getFullYear(), d.getMonth() + 1);
}

/** Local yyyy-MM-dd. Never `toISOString()`: that shifts the date in western zones. */
function ymd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

/** "1st" / "2nd" / "31st", for the month-end warning copy. */
function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

/* ── presets ──────────────────────────────────────────────────────────────── */

export type RecurrencePreset = {
  id: string;
  label: string;
  build: () => RecurrenceState;
};

/**
 * How many occurrences each cadence produces by default.
 *
 * Chosen so a preset is immediately useful without opening Custom: roughly a term of
 * lessons, a fortnight of daily slots, half a year of monthly ones. All well under the
 * server's 200 ceiling.
 */
const DEFAULT_COUNTS = {
  daily: 14,
  weekday: 20,
  weekly: 12,
  fortnightly: 8,
  monthly: 6,
  yearly: 3,
} as const;

/** Absolute ceiling the server will expand in one request. */
export const MAX_SERIES_OCCURRENCES = 200;

/**
 * Cap a desired occurrence count under the school "max upcoming bookings" rule when set,
 * otherwise under the hard series ceiling.
 */
export function cappedOccurrenceCount(
  desired: number,
  maxUpcomingBookings?: number | null
): number {
  const schoolCap =
    maxUpcomingBookings != null && maxUpcomingBookings > 0 ? maxUpcomingBookings : null;
  const hard = schoolCap == null ? MAX_SERIES_OCCURRENCES : Math.min(MAX_SERIES_OCCURRENCES, schoolCap);
  return Math.max(1, Math.min(desired, hard));
}

const base = (
  over: Partial<RecurrenceState>,
  maxUpcomingBookings?: number | null
): RecurrenceState => {
  const count = cappedOccurrenceCount(over.count ?? DEFAULT_COUNTS.weekly, maxUpcomingBookings);
  return {
    enabled: true,
    frequency: "weekly",
    interval: 1,
    daysOfWeek: [],
    monthlyMode: "dayOfMonth",
    endMode: "after",
    until: "",
    ...over,
    count,
  };
};

/** The id the dropdown uses for the entry that opens the Custom dialog. */
export const CUSTOM_PRESET_ID = "custom";

/**
 * The cadences offered for a given start date, in Google's order.
 *
 * Two entries are conditional, exactly as Google does it: "Monthly on the last X" only
 * appears when the date IS the last such weekday, and the nth-weekday entry is dropped
 * for a fifth weekday, because a fifth-weekday rule skips most months and is a trap
 * rather than a shortcut. Anyone who genuinely wants it can still build it in Custom.
 */
export function presetsFor(
  start: Date | null,
  maxUpcomingBookings?: number | null
): RecurrencePreset[] {
  const presets: RecurrencePreset[] = [
    {
      id: "none",
      label: "Does not repeat",
      build: () => ({ ...base({}, maxUpcomingBookings), enabled: false }),
    },
  ];

  if (!start || Number.isNaN(start.getTime())) return presets;

  const weekday = start.getDay();
  const ordinal = weekdayOrdinalOf(start.getDate());
  const withCap = (over: Partial<RecurrenceState>) => base(over, maxUpcomingBookings);

  presets.push({
    id: "daily",
    label: "Daily",
    build: () => withCap({ frequency: "daily", count: DEFAULT_COUNTS.daily }),
  });

  presets.push({
    id: "weekly",
    label: `Weekly on ${DAY_NAMES[weekday]}`,
    build: () => withCap({ frequency: "weekly", daysOfWeek: [weekday], count: DEFAULT_COUNTS.weekly }),
  });

  //Not one of Google's, but the cadence a flight school actually asks for after weekly.
  //"so-and-so takes the plane every other Tuesday". Google buries it in Custom.
  presets.push({
    id: "fortnightly",
    label: `Every 2 weeks on ${DAY_NAMES[weekday]}`,
    build: () =>
      withCap({
        frequency: "weekly",
        interval: 2,
        daysOfWeek: [weekday],
        count: DEFAULT_COUNTS.fortnightly,
      }),
  });

  if (ordinal <= 4) {
    presets.push({
      id: "monthly-nth",
      label: `Monthly on the ${ORDINALS[ordinal]} ${DAY_NAMES[weekday]}`,
      build: () =>
        withCap({ frequency: "monthly", monthlyMode: "nthWeekday", count: DEFAULT_COUNTS.monthly }),
    });
  }

  if (isLastWeekdayOfMonth(start)) {
    presets.push({
      id: "monthly-last",
      label: `Monthly on the last ${DAY_NAMES[weekday]}`,
      build: () =>
        withCap({ frequency: "monthly", monthlyMode: "lastWeekday", count: DEFAULT_COUNTS.monthly }),
    });
  }

  presets.push({
    id: "monthly-day",
    label: `Monthly on day ${start.getDate()}`,
    build: () =>
      withCap({ frequency: "monthly", monthlyMode: "dayOfMonth", count: DEFAULT_COUNTS.monthly }),
  });

  presets.push({
    id: "yearly",
    label: `Annually on ${format(start, "MMMM d")}`,
    build: () => withCap({ frequency: "yearly", count: DEFAULT_COUNTS.yearly }),
  });

  presets.push({
    id: "weekday",
    label: "Every weekday (Monday to Friday)",
    build: () =>
      withCap({ frequency: "weekly", daysOfWeek: [1, 2, 3, 4, 5], count: DEFAULT_COUNTS.weekday }),
  });

  return presets;
}

/**
 * Which preset a state corresponds to, or "custom".
 *
 * Matching on the SHAPE rather than remembering which item was clicked keeps the
 * dropdown honest after a trip through Custom: nudge the interval to 3 and it reads
 * "Custom…", set it back to 1 and it snaps to "Weekly on Monday" again.
 *
 * Deliberately ignores the end condition. "Weekly on Monday, 12 times" and "Weekly on
 * Monday until March" are the same cadence, and demoting one to "Custom…" just because
 * the end date moved would be noise.
 */
export function matchPreset(
  state: RecurrenceState,
  start: Date | null,
  maxUpcomingBookings?: number | null
): string {
  if (!state.enabled) return "none";

  for (const preset of presetsFor(start, maxUpcomingBookings)) {
    if (preset.id === "none") continue;
    const candidate = preset.build();
    if (
      candidate.frequency === state.frequency &&
      candidate.interval === state.interval &&
      (state.frequency !== "monthly" || candidate.monthlyMode === state.monthlyMode) &&
      candidate.daysOfWeek.length === state.daysOfWeek.length &&
      candidate.daysOfWeek.every((d) => state.daysOfWeek.includes(d))
    ) {
      return preset.id;
    }
  }

  return CUSTOM_PRESET_ID;
}

export function defaultRecurrence(
  startAt: Date | null,
  date: string,
  maxUpcomingBookings?: number | null
): RecurrenceState {
  const anchor = startAt ?? (date ? new Date(`${date}T12:00:00`) : new Date());
  const valid = !Number.isNaN(anchor.getTime());
  const until = addMonths(valid ? anchor : new Date(), 2);

  return {
    enabled: false,
    frequency: "weekly",
    interval: 1,
    daysOfWeek: valid ? [anchor.getDay()] : [],
    monthlyMode: "dayOfMonth",
    endMode: "after",
    until: ymd(until),
    count: cappedOccurrenceCount(DEFAULT_COUNTS.weekly, maxUpcomingBookings),
  };
}

/**
 * How many bookings a rule would create. Exact for "after N"; a close upper estimate for
 * "until" dates so the form can refuse a series the school cap would reject.
 */
export function estimateOccurrenceCount(state: RecurrenceState, start: Date | null): number | null {
  if (!state.enabled) return null;
  if (state.endMode === "after") {
    return Number.isFinite(state.count) && state.count >= 1 ? state.count : null;
  }
  if (!start || !state.until) return null;
  const until = new Date(`${state.until}T23:59:59`);
  if (Number.isNaN(until.getTime()) || until.getTime() < start.getTime()) return null;

  const interval = Math.max(1, state.interval || 1);
  const dayMs = 86_400_000;
  const spanMs = until.getTime() - start.getTime();

  switch (state.frequency) {
    case "daily":
      return Math.floor(spanMs / (dayMs * interval)) + 1;
    case "weekly": {
      const daysPerWeek = Math.max(1, state.daysOfWeek.length);
      const weeks = Math.floor(spanMs / (dayMs * 7 * interval)) + 1;
      return weeks * daysPerWeek;
    }
    case "monthly": {
      const months =
        (until.getFullYear() - start.getFullYear()) * 12 + (until.getMonth() - start.getMonth());
      return Math.floor(Math.max(0, months) / interval) + 1;
    }
    case "yearly": {
      const years = until.getFullYear() - start.getFullYear();
      return Math.floor(Math.max(0, years) / interval) + 1;
    }
    default:
      return null;
  }
}

/**
 * Turn the form state into the server's rule.
 *
 * Returns a `problem` rather than throwing so the form can block submit and say why. The
 * server validates all of this again, this is only the fast path that avoids a round
 * trip to be told something the form already knows.
 */
export function toRecurrenceInput(
  state: RecurrenceState,
  startAt: Date | null,
  endAt: Date | null,
  timeZoneName: string,
  opts?: { maxUpcomingBookings?: number | null }
): { input: RecurrenceInput | null; problem: string | null } {
  if (!state.enabled) return { input: null, problem: null };
  if (!startAt || !endAt) return { input: null, problem: "Pick a start and end time first." };

  if (state.frequency === "weekly" && state.daysOfWeek.length === 0) {
    return { input: null, problem: "Pick at least one day to repeat on." };
  }

  const durationMins = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
  if (durationMins <= 0) return { input: null, problem: "The end time has to be after the start time." };

  if (state.endMode === "after" && (!Number.isFinite(state.count) || state.count < 1)) {
    return { input: null, problem: "Number of times has to be at least 1." };
  }
  if (state.endMode === "on" && !state.until) {
    return { input: null, problem: "Pick a date for the repeat to end on." };
  }

  const maxUpcoming = opts?.maxUpcomingBookings;
  const estimated = estimateOccurrenceCount(state, startAt);
  if (
    maxUpcoming != null &&
    maxUpcoming > 0 &&
    estimated != null &&
    estimated > maxUpcoming
  ) {
    return {
      input: null,
      problem:
        state.endMode === "after"
          ? `This repeat would create ${estimated} bookings, but the school limit is ${maxUpcoming} upcoming. Shorten the series, or ask an admin to raise the limit.`
          : `This repeat would create about ${estimated} bookings, but the school limit is ${maxUpcoming} upcoming. Pick an earlier end date, or ask an admin to raise the limit.`,
    };
  }

  if (estimated != null && estimated > MAX_SERIES_OCCURRENCES) {
    return {
      input: null,
      problem: `A repeating booking can create at most ${MAX_SERIES_OCCURRENCES} bookings at once. Shorten the series.`,
    };
  }

  return {
    problem: null,
    input: {
      frequency: state.frequency,
      interval: state.interval,
      //Only weekly rules carry days; sending them for a monthly rule would imply they
      //mean something, and they don't.
      daysOfWeek: state.frequency === "weekly" ? [...state.daysOfWeek].sort((a, b) => a - b) : undefined,
      monthlyMode: state.frequency === "monthly" ? state.monthlyMode : undefined,
      startTime: format(startAt, "HH:mm"),
      durationMins,
      timeZoneName,
      startDate: ymd(startAt),
      until: state.endMode === "on" ? state.until : null,
      count: state.endMode === "after" ? state.count : null,
    },
  };
}

/** Plain-language summary, so nobody has to infer what they just configured. */
export function summarise(state: RecurrenceState, start: Date | null): string {
  if (!state.enabled) return "";

  const cadence = (() => {
    switch (state.frequency) {
      case "daily":
        return state.interval === 1 ? "every day" : `every ${state.interval} days`;
      case "weekly": {
        const days = [...state.daysOfWeek].sort((a, b) => a - b).map((d) => DAY_NAMES[d]);
        const every = state.interval === 1 ? "every week" : `every ${state.interval} weeks`;
        return days.length ? `${every} on ${days.join(", ")}` : every;
      }
      case "monthly": {
        const every = state.interval === 1 ? "every month" : `every ${state.interval} months`;
        if (!start) return every;
        if (state.monthlyMode === "dayOfMonth") return `${every} on day ${start.getDate()}`;
        if (state.monthlyMode === "lastWeekday") return `${every} on the last ${DAY_NAMES[start.getDay()]}`;
        return `${every} on the ${ORDINALS[weekdayOrdinalOf(start.getDate())]} ${DAY_NAMES[start.getDay()]}`;
      }
      case "yearly":
        return state.interval === 1
          ? `every year${start ? ` on ${format(start, "MMMM d")}` : ""}`
          : `every ${state.interval} years`;
      default:
        return "";
    }
  })();

  const ends =
    state.endMode === "on"
      ? state.until
        ? ` until ${state.until}`
        : ""
      : `: ${state.count} booking${state.count === 1 ? "" : "s"}`;

  return `Repeats ${cadence}${ends}.`;
}

/* ── the control ──────────────────────────────────────────────────────────── */

export function RecurrenceField({
  value,
  onChange,
  start,
  disabled,
  maxUpcomingBookings,
}: {
  value: RecurrenceState;
  onChange: (next: RecurrenceState) => void;
  /** The reservation's start, every preset is derived from it. */
  start: Date | null;
  disabled?: boolean;
  /** School "max upcoming bookings" cap. When set, presets and Custom cannot exceed it. */
  maxUpcomingBookings?: number | null;
}) {
  const [customOpen, setCustomOpen] = React.useState(false);

  const presets = React.useMemo(
    () => presetsFor(start, maxUpcomingBookings),
    [start, maxUpcomingBookings]
  );
  const selected = matchPreset(value, start, maxUpcomingBookings);

  const choose = (id: string) => {
    if (id === CUSTOM_PRESET_ID) {
      //Seeded with whatever is configured now, so Custom refines the current choice
      //rather than starting from a blank slate.
      setCustomOpen(true);
      return;
    }
    const preset = presets.find((p) => p.id === id);
    if (preset) onChange(preset.build());
  };

  return (
    <div data-doc-shot="repeat-dropdown-presets" className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label htmlFor="repeat">Repeat</Label>
        <DocsHint topic="repeat-booking" />
      </div>
      <Select value={selected} onValueChange={choose} disabled={disabled}>
        <SelectTrigger id="repeat" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.label}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_PRESET_ID}>Custom…</SelectItem>
        </SelectContent>
      </Select>

      {value.enabled && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">{summarise(value, start)}</p>
          {/* Also the way back into Custom when the dropdown already reads "Custom…".
              re-picking the selected item fires no change event. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 shrink-0 px-2 text-xs"
            disabled={disabled}
            onClick={() => setCustomOpen(true)}
          >
            Edit
          </Button>
        </div>
      )}

      <CustomRecurrenceDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        value={value}
        start={start}
        maxUpcomingBookings={maxUpcomingBookings}
        onSave={(next) => {
          onChange(next);
          setCustomOpen(false);
        }}
      />
    </div>
  );
}

/**
 * Everything the presets don't cover: an arbitrary interval, several days a week, which
 * sense of "monthly", and where it stops.
 *
 * A dialog rather than an inline panel because the booking form is a modal in a narrow
 * column, seven day-chips alone need more width than that column has, which is exactly
 * how they came to overflow it.
 */
function CustomRecurrenceDialog({
  open,
  onOpenChange,
  value,
  start,
  onSave,
  maxUpcomingBookings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: RecurrenceState;
  start: Date | null;
  onSave: (next: RecurrenceState) => void;
  maxUpcomingBookings?: number | null;
}) {
  const [draft, setDraft] = React.useState<RecurrenceState>(value);
  const countCap = cappedOccurrenceCount(MAX_SERIES_OCCURRENCES, maxUpcomingBookings);

  //Re-seeded each time it opens, so closing abandons the edit, which is what Cancel in
  //a dialog is expected to mean.
  React.useEffect(() => {
    if (open) {
      setDraft({
        ...value,
        enabled: true,
        //"Does not repeat" carries no days; turning it into a weekly rule needs one.
        daysOfWeek:
          value.daysOfWeek.length === 0 && start ? [start.getDay()] : value.daysOfWeek,
        count: cappedOccurrenceCount(value.count, maxUpcomingBookings),
      });
    }
  }, [open, value, start, maxUpcomingBookings]);

  const set = (patch: Partial<RecurrenceState>) => setDraft((d) => ({ ...d, ...patch }));

  const toggleDay = (day: number) => {
    const has = draft.daysOfWeek.includes(day);
    //Never let the last day go: a weekly rule with no days can't produce a single
    //booking, and the server would refuse it. Better to make the empty state unreachable
    //than to explain it.
    if (has && draft.daysOfWeek.length === 1) return;
    set({ daysOfWeek: has ? draft.daysOfWeek.filter((d) => d !== day) : [...draft.daysOfWeek, day] });
  };

  const plural = (one: string, many: string) => (draft.interval === 1 ? one : many);

  const untilEstimate = estimateOccurrenceCount(draft, start);
  const untilOverCap =
    draft.endMode === "on" &&
    maxUpcomingBookings != null &&
    maxUpcomingBookings > 0 &&
    untilEstimate != null &&
    untilEstimate > maxUpcomingBookings;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-doc-shot="me-book-repeat" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Custom repeat</DialogTitle>
          <DialogDescription>
            Every date has to be free, if one clashes, nothing is booked and you&apos;ll be told
            which.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Repeat every</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={12}
                value={draft.interval}
                onChange={(e) => set({ interval: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })}
                className="w-20"
                aria-label="Interval"
              />
              <Select
                value={draft.frequency}
                onValueChange={(v) => {
                  const frequency = v as RecurrenceFrequency;
                  set({
                    frequency,
                    //Switching to weekly with nothing selected would be an unsubmittable
                    //rule, so it lands on the start date's own weekday.
                    daysOfWeek:
                      frequency === "weekly" && draft.daysOfWeek.length === 0 && start
                        ? [start.getDay()]
                        : draft.daysOfWeek,
                  });
                }}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{plural("day", "days")}</SelectItem>
                  <SelectItem value="weekly">{plural("week", "weeks")}</SelectItem>
                  <SelectItem value="monthly">{plural("month", "months")}</SelectItem>
                  <SelectItem value="yearly">{plural("year", "years")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {draft.frequency === "weekly" && (
            <div className="space-y-2">
              <Label>Repeat on</Label>
              {/* flex-wrap, not a fixed row, seven chips have to be able to fall onto a
                  second line rather than run out of the dialog. */}
              <div className="flex flex-wrap gap-1.5">
                {DAY_INITIALS.map((initial, day) => {
                  const active = draft.daysOfWeek.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      aria-pressed={active}
                      aria-label={DAY_NAMES[day]}
                      title={DAY_NAMES[day]}
                      className={cn(
                        "size-9 shrink-0 rounded-full border text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {initial}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {draft.frequency === "monthly" && start && (
            <div className="space-y-2">
              <Label htmlFor="monthly-mode">Repeat by</Label>
              <Select value={draft.monthlyMode} onValueChange={(v) => set({ monthlyMode: v as MonthlyMode })}>
                <SelectTrigger id="monthly-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dayOfMonth">Day {start.getDate()} of the month</SelectItem>
                  <SelectItem value="nthWeekday">
                    The {ORDINALS[weekdayOrdinalOf(start.getDate())]} {DAY_NAMES[start.getDay()]}
                  </SelectItem>
                  <SelectItem value="lastWeekday">The last {DAY_NAMES[start.getDay()]}</SelectItem>
                </SelectContent>
              </Select>
              {draft.monthlyMode === "dayOfMonth" && start.getDate() > 28 && (
                <p className="text-xs text-muted-foreground">
                  Months without a {start.getDate()}
                  {ordinalSuffix(start.getDate())} are skipped, not moved to the end of the month.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Ends</Label>
            <div className="flex items-center gap-2">
              <Select value={draft.endMode} onValueChange={(v) => set({ endMode: v as RecurrenceEndMode })}>
                <SelectTrigger className="w-32 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="after">After</SelectItem>
                  <SelectItem value="on">On date</SelectItem>
                </SelectContent>
              </Select>

              {draft.endMode === "after" ? (
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={countCap}
                    value={draft.count}
                    onChange={(e) =>
                      set({
                        count: cappedOccurrenceCount(Number(e.target.value) || 1, maxUpcomingBookings),
                      })
                    }
                    className="w-20"
                    aria-label="Number of bookings"
                  />
                  <span className="text-sm text-muted-foreground">bookings</span>
                </div>
              ) : (
                <Input
                  type="date"
                  value={draft.until}
                  onChange={(e) => set({ until: e.target.value })}
                  className="flex-1"
                  aria-label="Repeat until"
                />
              )}
            </div>
            {/* Said plainly: Google offers "Never" and we cannot, because each occurrence
                is a real booking holding a real aircraft. */}
            <p className="text-xs text-muted-foreground">
              A repeat always has an end, each booking holds the aircraft, so there is no
              &ldquo;forever&rdquo;.{" "}
              {maxUpcomingBookings != null && maxUpcomingBookings > 0
                ? `Up to ${countCap} at a time (school upcoming-booking limit).`
                : `Up to ${MAX_SERIES_OCCURRENCES} at a time.`}
            </p>
            {untilOverCap && (
              <p className="text-xs text-destructive">
                That end date would create about {untilEstimate} bookings, over the school
                limit of {maxUpcomingBookings}. Pick an earlier date.
              </p>
            )}
          </div>

          <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {summarise(draft, start)}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={untilOverCap} onClick={() => onSave(draft)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
