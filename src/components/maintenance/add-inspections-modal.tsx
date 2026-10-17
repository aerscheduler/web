/**
 * Put inspections on a tail.
 *
 * Three ways in, because schools arrive here in three different states:
 *
 *  - AVIATES: a mechanic setting up a new aircraft wants the standard airworthiness set,
 *    and should not have to know that a 100-hour is `remindHours: 1000`. Multi-select,
 *    because "all seven" is the normal answer.
 *  - Recurring: anything else the shop repeats: an oil change, a gearbox, an ELT battery.
 *  - One-off: a date that happens once and does not come back. This is what somebody means
 *    by "a reminder for this one thing": a part due back on the 14th, an owner's inspection
 *    they agreed to. The server has always supported it (`remindDate`) and no form has ever
 *    offered it.
 *
 * Everything created here is an ordinary template the school can edit afterwards. Presets
 * come off the API rather than a constant in this file so the intervals and the regulation
 * citations match the phone's exactly.
 */

import * as React from "react";
import { format } from "date-fns";
import { AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { useCreateMaintenanceReminderTemplate, useInspectionPresets, usePlanes } from "@/features/queries";
import {
  resourceLabel,
  type CreateReminderTemplateInput,
  type InspectionPreset,
  type Resource,
} from "@/types/api";
import { cn } from "@/lib/utils";
import { ResponsiveModal } from "@/components/responsive-modal";
import { DatePickerField } from "@/components/date-picker";
import { DocsHint } from "@/components/docs-hint";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CALENDAR_UNITS, calendarPayload, type CalendarUnit } from "@/lib/maintenance-interval";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EMPTY_SOURCE,
  InspectionSourceFields,
  sourceIsIncomplete,
  type InspectionSource,
} from "@/components/maintenance/inspection-source-fields";
import { adInspectionName } from "@/lib/ad-number";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

type Mode = "standard" | "recurring" | "oneOff";

const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: "standard", label: "Standard set", hint: "The AVIATES airworthiness inspections" },
  { value: "recurring", label: "Recurring", hint: "Repeats on hours or a set number of days" },
  { value: "oneOff", label: "One-off", hint: "A single deadline that doesn't come back" },
];

export function AddInspectionsModal({
  open,
  onOpenChange,
  fixedResource,
  initialAd,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opened from one aircraft: that tail is the answer, not a default to be edited away. */
  fixedResource?: Resource | null;
  /**
   * Opened to track one AD (from the aircraft's ADs tab): a recurring rule with the source set
   * to that AD, so the look-up fills in its name, revision and link.
   */
  initialAd?: string | null;
  /** Saved: the AD tab marks the AD as applying once its inspection exists. */
  onAdded?: () => void;
}) {
  const presetsQ = useInspectionPresets({ enabled: open });
  //Customer aircraft included: tracking an inspection on one is the whole point.
  const planesQ = usePlanes({ scope: "all" }, { enabled: open && !fixedResource });
  const create = useCreateMaintenanceReminderTemplate();

  const [mode, setMode] = React.useState<Mode>("standard");
  const [chosen, setChosen] = React.useState<string[]>([]);
  const [tails, setTails] = React.useState<number[]>([]);
  const [busy, setBusy] = React.useState(false);

  // Custom / one-off fields.
  const [name, setName] = React.useState("");
  // The name the AD look-up last filled in, so a second look-up may replace it (see onAdFound).
  const adNameFilled = React.useRef<string | null>(null);
  const [basis, setBasis] = React.useState<"days" | "hours" | "both">("days");
  //A one-off is due on a DATE or at a METER READING. An enormous share of Airworthiness
  //Directives read "within the next 50 hours time in service", and until this existed the
  //only way to track one was to declare it recurring, which rolled it forward forever after
  //the single compliance it required.
  const [onceOn, setOnceOn] = React.useState<"date" | "hours">("date");
  const [atHours, setAtHours] = React.useState("");
  //The form opens on the calendar clock in months, so these open matching it. They were 100
  //and 10, the meter clock's defaults, which rendered "Every 100 months".
  const [every, setEvery] = React.useState("12");
  const [warn, setWarn] = React.useState("30");

  /**
   * Whether a person has typed in these two boxes yet.
   *
   * The number is shared between the meter clock and the calendar clock, and the sensible
   * default is different for each: 100 hours, 12 calendar months, 50 days. Without this the
   * form opened on the calendar reading "Every 100 months", which is not an interval anyone
   * has ever wanted and reads as a bug the moment you see it.
   *
   * Only untouched boxes are re-defaulted, so switching unit after typing 6 never discards it.
   */
  const everyTouched = React.useRef(false);
  const warnTouched = React.useRef(false);

  const DEFAULT_EVERY: Record<CalendarUnit | "hours", string> = {
    hours: "100",
    months: "12",
    weeks: "4",
    days: "50",
  };
  const DEFAULT_WARN: Record<CalendarUnit | "hours", string> = {
    hours: "10",
    months: "30",
    weeks: "7",
    days: "7",
  };

  /** Re-default the shared boxes for whichever clock and unit is now showing. */
  const applyDefaults = (key: CalendarUnit | "hours") => {
    if (!everyTouched.current) setEvery(DEFAULT_EVERY[key]);
    if (!warnTouched.current) setWarn(DEFAULT_WARN[key]);
  };
  // The calendar half of a combined interval. Separate state because "both" needs two
  // figures on screen at once and reusing `every` would make one overwrite the other.
  const [everyDays, setEveryDays] = React.useState("12");
  const [warnDays, setWarnDays] = React.useState("30");

  //WHICH CALENDAR UNIT. Defaulting to months rather than days because almost every calendar
  //inspection in aviation is written in calendar months (the annual, the transponder, the
  //static system, the ELT), and a calendar month is not a number of days: it runs to the end
  //of the month. Storing those as 365 days made them come due up to a month early.
  const [everyUnit, setEveryUnit] = React.useState<CalendarUnit>("months");
  const [everyDaysUnit, setEveryDaysUnit] = React.useState<CalendarUnit>("months");
  const [meter, setMeter] = React.useState<"tach" | "hobbs">("tach");
  const [date, setDate] = React.useState("");
  const [grounds, setGrounds] = React.useState(false);
  //Where the rule comes from. Null until somebody says, which is the honest default: most
  //templates are a shop deciding when to change the oil, and flagging those as "other"
  //would put a meaningless badge on every row.
  const [source, setSource] = React.useState<InspectionSource>(EMPTY_SOURCE);
  // When the interval last came round. Blank means "starts now", which is right for a new
  // aircraft and wrong for every aircraft a school already operates, see `lastDone`.
  const [lastDone, setLastDone] = React.useState("");
  const [lastDoneHours, setLastDoneHours] = React.useState("");

  const presets = presetsQ.data ?? [];
  const fleet = planesQ.data ?? [];
  const targets = fixedResource ? [fixedResource.id] : tails;

  // Default the AVIATES set to all-selected: "the standard set" is the whole point of the
  // tab, and a mechanic who wants six of seven can untick faster than tick seven.
  React.useEffect(() => {
    if (open && initialAd) {
      setMode("recurring");
      setSource({ ...EMPTY_SOURCE, sourceType: "ad", sourceRef: initialAd });
    }
  }, [open, initialAd]);

  React.useEffect(() => {
    if (open && presets.length && chosen.length === 0) {
      setChosen(presets.filter((p) => p.letter != null).map((p) => p.id));
    }
    // Seeding once, when the presets land.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presets.length]);

  function reset() {
    setMode("standard");
    setChosen([]);
    setTails([]);
    setName("");
    setBasis("days");
    setEveryUnit("months");
    setEveryDaysUnit("months");
    setEvery("12");
    setWarn("30");
    everyTouched.current = false;
    warnTouched.current = false;
    setEveryDays("12");
    setWarnDays("30");
    setMeter("tach");
    setDate("");
    setGrounds(false);
    setSource(EMPTY_SOURCE);
    //Both of these, or the next one-off opens on "At an hour reading" holding the PREVIOUS
    //aircraft's absolute meter reading. An absolute reading carried to a different tail is
    //not merely stale, it is a deadline for an aeroplane that never had that number.
    setOnceOn("date");
    setAtHours("");
    setLastDone("");
    setLastDoneHours("");
  }

  /**
   * What each chosen tail should start counting from.
   *
   * Left blank this is `[{id}]`, and the server starts the interval at today's date and
   * today's meter, correct for an aircraft that just had the work done, and wrong for
   * every aircraft a school already operates. Filling it in is what makes "add the AVIATES
   * set" usable on a fleet that has been flying for years rather than only on a new tail.
   */
  function resourcesPayload() {
    return targets.map((id) => ({
      id,
      ...(lastDone ? { startDate: new Date(`${lastDone}T12:00:00`).toISOString() } : {}),
      ...(lastDoneHours !== "" ? { startHour: Math.round(Number(lastDoneHours) * 10) } : {}),
    }));
  }

  //An Airworthiness Directive with no number cannot be found, filtered, or put on the
  //report an inspector reads, and the server refuses it. Say so here rather than letting
  //the request come back 400.
  const adNeedsRef = sourceIsIncomplete(source);
  const customValid =
    name.trim().length > 0 &&
    !adNeedsRef &&
    (mode === "oneOff"
      ? onceOn === "date"
        ? date !== ""
        : Number(atHours) > 0
      : Number(every) > 0 && (basis !== "both" || Number(everyDays) > 0));
  const canSubmit =
    targets.length > 0 && (mode === "standard" ? chosen.length > 0 : customValid) && !busy;

  /** The days / weeks / months picker beside a calendar interval. */
  const unitPicker = (id: string, value: CalendarUnit, onChange: (u: CalendarUnit) => void) => (
    <Select value={value} onValueChange={(v) => onChange(v as CalendarUnit)}>
      <SelectTrigger id={id} className="w-[7.5rem]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CALENDAR_UNITS.map((u) => (
          <SelectItem key={u} value={u}>
            {u}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  /**
   * Which meter an hours clock counts. A select beside the interval, not a pair of buttons on a
   * row of their own: it is one more property of the same interval.
   */
  const meterField = (
    <div className="space-y-1.5">
      <Label htmlFor="insp-meter" className="text-xs">
        Counted on
      </Label>
      <Select value={meter} onValueChange={(v) => setMeter(v as "tach" | "hobbs")}>
        <SelectTrigger id="insp-meter" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="tach">Tach time</SelectItem>
          <SelectItem value="hobbs">Hobbs time</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  /** A row of mutually exclusive choices: the interval's clock, or a one-off's deadline. */
  const choices = <T extends string>(options: readonly { value: T; label: string }[], value: T, onPick: (v: T) => void) => (
    <div className="grid w-full grid-flow-col auto-cols-fr gap-1 rounded-lg bg-muted p-1 sm:inline-grid sm:w-auto sm:auto-cols-auto">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onPick(option.value)}
          className={cn(
            "rounded-md px-2 py-1.5 text-center text-[13px] leading-tight transition-colors sm:px-3",
            value === option.value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  /**
   * A number box with its unit written after it, so "Warn me 30 days before" reads as one.
   * `name` is the box's accessible name WITH the unit ("Warn me (hours out)"): the unit is
   * plain text beside the box, which a screen reader does not tie to it.
   */
  const numberWithUnit = (
    id: string,
    value: string,
    onChange: (v: string) => void,
    unit: React.ReactNode,
    placeholder: string,
    name?: string,
    numeric = false
  ) => (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        aria-label={name}
        inputMode={numeric ? "numeric" : "decimal"}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(numeric ? /[^0-9]/g : /[^0-9.]/g, ""))}
        placeholder={placeholder}
        className="tnum w-24"
      />
      {typeof unit === "string" ? <span className="text-sm text-muted-foreground">{unit}</span> : unit}
    </div>
  );

  function buildCustom(): CreateReminderTemplateInput {
    const templateResources = resourcesPayload();
    const trimmed = name.trim().slice(0, 60);
    //Sent as null rather than "" so clearing a field on an edit actually clears it, and so
    //a template with no source stays genuinely sourceless rather than sourced to nothing.
    const sourcePayload = {
      sourceType: source.sourceType || null,
      //All three hang off the type. Clearing "Where this comes from" back to Not specified
      //has to take the number with it, or an inspection keeps an AD number it no longer
      //claims to be.
      sourceRef: source.sourceType ? source.sourceRef.trim() || null : null,
      sourceUrl: source.sourceType ? source.sourceUrl.trim() || null : null,
      revision: source.sourceType ? source.revision.trim() || null : null,
      revisionDate: source.sourceType ? source.revisionDate || null : null,
    };

    if (mode === "oneOff") {
      if (onceOn === "hours") {
        return {
          name: trimmed,
          repeat: false,
          ground: grounds,
          // An ABSOLUTE reading, in tenths. Not an interval: the deadline is a point on the
          // meter, so it does not move with whatever the aircraft read when this was set up.
          remindAtHours: Math.round(Number(atHours) * 10),
          remindHoursBefore: Math.max(1, Math.round((Number(warn) || 10) * 10)),
          hourBasedOn: meter,
          ...sourcePayload,
          templateResources,
        };
      }
      return {
        name: trimmed,
        repeat: false,
        ground: grounds,
        remindDate: new Date(`${date}T12:00:00`).toISOString(),
        // The server requires a lead time on a dated reminder, and a one-off with no
        // warning is a reminder that arrives the day it's already too late to act on.
        remindDaysBefore: Math.max(1, Math.min(30, Number(warn) || 7)),
        ...sourcePayload,
        templateResources,
      };
    }

    // Typed in HOURS, stored in tenths, the meter's unit, not the form's.
    const hours = {
      remindHours: Math.round(Number(every) * 10),
      remindHoursBefore: Math.max(1, Math.round((Number(warn) || 1) * 10)),
      hourBasedOn: meter,
    };
    // On "both" the calendar figures come from their own pair of inputs; on "days" the
    // shared `every` / `warn` are the calendar ones.
    const days =
      basis === "both"
        ? calendarPayload(everyDaysUnit, Number(everyDays), Number(warnDays) || 1)
        : calendarPayload(everyUnit, Number(every), Number(warn) || 1);

    if (basis === "hours") return { name: trimmed, repeat: true, ground: grounds, ...hours, ...sourcePayload, templateResources };
    // Whichever comes first: the server keeps both clocks and grounds on the earlier one.
    if (basis === "both") return { name: trimmed, repeat: true, ground: grounds, ...hours, ...days, ...sourcePayload, templateResources };
    return { name: trimmed, repeat: true, ground: grounds, ...days, ...sourcePayload, templateResources };
  }

  async function submit() {
    setBusy(true);
    try {
      if (mode === "standard") {
        const wanted = presets.filter((p) => chosen.includes(p.id));
        // Sequential, not Promise.all: each create writes a template AND a reminder row per
        // aircraft, and firing seven of those at once against the same rows is how you get
        // a partial set with no way to tell which half landed.
        const failed: string[] = [];
        for (const preset of wanted) {
          try {
            await create.mutateAsync({ ...preset.payload, templateResources: resourcesPayload() });
          } catch {
            failed.push(preset.name);
          }
        }
        if (failed.length === wanted.length) {
          toast.error("Couldn't add those inspections.");
          return;
        }
        // Naming what failed rather than a bare count: the mechanic has to know WHICH one
        // to add by hand, and "6 of 7 added" doesn't tell them.
        if (failed.length) toast.warning(`Added ${wanted.length - failed.length}. Couldn't add: ${failed.join(", ")}.`);
        else toast.success(`Added ${wanted.length} ${wanted.length === 1 ? "inspection" : "inspections"}.`);
      } else {
        await create.mutateAsync(buildCustom());
        toast.success(mode === "oneOff" ? "One-off inspection set." : "Inspection added.");
      }
      reset();
      onOpenChange(false);
      onAdded?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add that.");
    } finally {
      setBusy(false);
    }
  }

  const section = "space-y-3 border-t border-border pt-4";
  const heading = "flex items-center gap-1.5 text-sm font-medium";

  return (
    <ResponsiveModal
      size="2xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? "Adding…" : "Add"}
          </Button>
        </div>
      }
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Add inspections"
      description={
        fixedResource
          ? `What ${resourceLabel(fixedResource).name} should be tracked against.`
          : "Track an inspection across the aircraft you choose."
      }
    >
      <div className="space-y-4">
        <div className="grid gap-1.5 sm:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              aria-pressed={mode === m.value}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition-colors",
                mode === m.value ? "border-primary bg-primary/5" : "hover:bg-accent/50"
              )}
            >
              <div className="text-[13px] font-medium">{m.label}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{m.hint}</div>
            </button>
          ))}
        </div>

        {mode === "standard" && (
          <StandardSet
            loading={presetsQ.isPending}
            presets={presets}
            chosen={chosen}
            onToggle={(id) =>
              setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
            }
            onAll={() => setChosen(presets.filter((p) => p.letter != null).map((p) => p.id))}
            onNone={() => setChosen([])}
          />
        )}

        {mode !== "standard" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="insp-name">Name</Label>
              <Input
                id="insp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={mode === "oneOff" ? "Prop back from the shop" : "Oil change"}
                maxLength={60}
                autoFocus
              />
            </div>

            {/* WHERE THE RULE COMES FROM, before the interval: opened from an AD, the AD is
                what the rest is filled in from. Not offered on the standard set: that mode is
                multi-select and its payloads are the server's, so one AD number applied to
                seven ticked presets would be wrong by construction. */}
            <div className="border-t border-border pt-4">
              <InspectionSourceFields
                value={source}
                onChange={setSource}
                docShot="add-inspections-source"
                // A blank name takes the AD's own ("AD 2013-11-11 Engine oil pressure"), and so
                // does one an earlier look-up filled in; a name somebody typed is kept.
                onAdFound={(ad) => {
                  const named = adInspectionName(ad);
                  const before = adNameFilled.current;
                  adNameFilled.current = named;
                  setName((now) => (!now.trim() || now === before ? named : now));
                }}
              />
            </div>

            <div data-doc-shot="add-inspections-recurring" className={section}>
              {mode === "recurring" ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={heading}>
                      Comes due
                      {basis !== "hours" && <DocsHint topic="calendar-interval-unit" />}
                    </p>
                    {/* Three ways an interval is written. "Whichever comes first" is how most
                        recurring ADs read, and how an oil change usually reads too. */}
                    {choices(
                      [
                        { value: "days", label: "On the calendar" },
                        { value: "hours", label: "On the meter" },
                        { value: "both", label: "Whichever comes first" },
                      ] as const,
                      basis,
                      (v) => {
                        setBasis(v);
                        //The shared boxes now belong to a different clock: 100 hours, or 12
                        //calendar months. "Whichever comes first" puts hours in the shared
                        //pair and the calendar in its own, so it defaults like hours.
                        applyDefaults(v === "days" ? everyUnit : "hours");
                      }
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="insp-every" className="text-xs">
                        Every
                      </Label>
                      {numberWithUnit(
                        "insp-every",
                        every,
                        (v) => {
                          everyTouched.current = true;
                          setEvery(v);
                        },
                        basis === "days"
                          ? unitPicker("insp-every-unit", everyUnit, (u) => {
                              setEveryUnit(u);
                              applyDefaults(u);
                            })
                          : "hours",
                        basis === "days" ? "12" : "100",
                        basis === "days" ? undefined : "Every (hours)"
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="insp-warn" className="text-xs">
                        Warn me
                      </Label>
                      {numberWithUnit(
                        "insp-warn",
                        warn,
                        (v) => {
                          warnTouched.current = true;
                          setWarn(v);
                        },
                        basis === "days" ? "days before" : "hours before",
                        basis === "days" ? "30" : "10",
                        basis === "days" ? "Warn me (days out)" : "Warn me (hours out)"
                      )}
                    </div>
                    {basis !== "days" && meterField}
                  </div>

                  {basis === "both" && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="insp-every-days" className="text-xs">
                          or every
                        </Label>
                        {numberWithUnit(
                          "insp-every-days",
                          everyDays,
                          setEveryDays,
                          unitPicker("insp-every-days-unit", everyDaysUnit, setEveryDaysUnit),
                          "12"
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="insp-warn-days" className="text-xs">
                          Warn me
                        </Label>
                        {numberWithUnit("insp-warn-days", warnDays, setWarnDays, "days before", "30", "Warn me (days out)")}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={heading}>
                      Comes due
                      {onceOn === "hours" && <DocsHint topic="one-off-at-hours" />}
                    </p>
                    {/* A one-off is due on a date OR at a meter reading. "Comply within the
                        next 50 hours" is how a large share of ADs are written, and it has no
                        date. */}
                    {choices(
                      [
                        { value: "date", label: "On a date" },
                        { value: "hours", label: "At an hour reading" },
                      ] as const,
                      onceOn,
                      setOnceOn
                    )}
                  </div>

                  {onceOn === "date" ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="insp-date" className="text-xs">
                          Due on
                        </Label>
                        <DatePickerField
                          id="insp-date"
                          value={date}
                          onChange={setDate}
                          min={format(new Date(), "yyyy-MM-dd")}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="insp-warn-once" className="text-xs">
                          Warn me
                        </Label>
                        {numberWithUnit("insp-warn-once", warn, setWarn, "days before", "30", "Warn me (days out)", true)}
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-3">
                      {/* The reading itself, not "50 hours from now": the label says AT, and
                          the popover beside the heading says it in full. */}
                      <div className="space-y-1.5">
                        <Label htmlFor="insp-at-hours" className="text-xs">
                          Due at reading
                        </Label>
                        <Input
                          id="insp-at-hours"
                          data-testid="insp-at-hours"
                          inputMode="decimal"
                          value={atHours}
                          onChange={(e) => setAtHours(e.target.value.replace(/[^0-9.]/g, ""))}
                          placeholder="1250.0"
                          className="tnum"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="insp-warn-at-hours" className="text-xs">
                          Warn me
                        </Label>
                        {numberWithUnit("insp-warn-at-hours", warn, setWarn, "hours before", "10", "Warn me (hours out)")}
                      </div>
                      {/* Which clock. Without it the reading is measured against whatever
                          `meter` happened to be. */}
                      {meterField}
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center justify-between gap-4 pt-1">
                <Label htmlFor="insp-grounds" className="inline-flex items-center gap-1.5">
                  Grounds the aircraft
                  <DocsHint topic="inspection-grounds" />
                </Label>
                <Switch id="insp-grounds" checked={grounds} onCheckedChange={setGrounds} />
              </div>
            </div>
          </>
        )}

        {/* The difference between a useful reminder and a wrong one on an existing fleet.
            Optional; blank is right for a new aircraft and wrong for one that has been flying,
            which the placeholders and the popover say. */}
        {mode !== "oneOff" && (
          <div data-doc-shot="add-inspections-last-done" className={section}>
            <p className={heading}>
              When was it last done?
              <DocsHint topic="inspection-last-done" />
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="insp-last-date" className="text-xs">
                  Date
                </Label>
                <DatePickerField
                  id="insp-last-date"
                  value={lastDone}
                  onChange={setLastDone}
                  max={format(new Date(), "yyyy-MM-dd")}
                  placeholder="Starts today"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="insp-last-hours" className="text-xs">
                  Meter reading
                </Label>
                <Input
                  id="insp-last-hours"
                  inputMode="decimal"
                  value={lastDoneHours}
                  onChange={(e) => setLastDoneHours(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="tnum"
                  placeholder="Current reading"
                />
              </div>
            </div>
            {/* One reading across several tails is almost never right, their meters
                differ. Say so rather than letting it produce quietly wrong countdowns. */}
            {lastDoneHours !== "" && targets.length > 1 && (
              <p className="flex items-start gap-1 text-[11px] text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]">
                <AlertTriangle className="mt-px size-3 shrink-0" />
                That reading is applied to all {targets.length} aircraft. Their meters differ, so
                add them one tail at a time, or fix each from its own page after.
              </p>
            )}
          </div>
        )}

        {!fixedResource && (
          <div className={section}>
            <p className={heading}>Applies to</p>
            {planesQ.isPending ? (
              <Skeleton className="h-8 w-full" />
            ) : fleet.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No aircraft yet. Add a tail first and these will have something to hang off.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5" data-testid="add-inspections-tails">
                  {fleet.map((p) => {
                    const on = tails.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setTails((s) => (on ? s.filter((id) => id !== p.id) : [...s, p.id]))
                        }
                        aria-pressed={on}
                        className={cn(
                          "rounded-full border px-2.5 py-1 font-mono text-xs font-medium transition-colors",
                          on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                        )}
                      >
                        {resourceLabel(p).name}
                      </button>
                    );
                  })}
                </div>
                {/* An inspection attached to nothing creates no reminders at all, it looks
                    like it worked and then never fires. Say so before they submit. */}
                {tails.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Pick at least one aircraft. An inspection with no tails never comes due.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}

function StandardSet({
  loading,
  presets,
  chosen,
  onToggle,
  onAll,
  onNone,
}: {
  loading: boolean;
  presets: InspectionPreset[];
  chosen: string[];
  onToggle: (id: string) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const aviates = presets.filter((p) => p.letter != null);
  const extras = presets.filter((p) => p.letter == null);

  return (
    <div data-doc-shot="add-inspections-standard-set" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {chosen.length} selected. Intervals are the common case, edit any of them after.
        </p>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" onClick={onAll}>
            All
          </Button>
          <Button variant="ghost" size="sm" onClick={onNone}>
            None
          </Button>
        </div>
      </div>

      <Group title="AVIATES" items={aviates} chosen={chosen} onToggle={onToggle} />
      {extras.length > 0 && (
        <Group title="Also common" items={extras} chosen={chosen} onToggle={onToggle} />
      )}
    </div>
  );
}

function Group({
  title,
  items,
  chosen,
  onToggle,
}: {
  title: string;
  items: InspectionPreset[];
  chosen: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
      {items.map((p) => {
        const on = chosen.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onToggle(p.id)}
            aria-pressed={on}
            className={cn(
              "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
              on ? "border-primary bg-primary/5" : "hover:bg-accent/50"
            )}
          >
            <span
              className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
                on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
              )}
            >
              {on && <Check className="size-3" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-medium">{p.name}</span>
                {p.regulation && (
                  <span className="text-[11px] text-muted-foreground">{p.regulation}</span>
                )}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{p.interval}</span>
              {p.caveat && (
                <span className="mt-1 flex items-start gap-1 text-[11px] text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]">
                  <AlertTriangle className="mt-px size-3 shrink-0" />
                  {p.caveat}
                </span>
              )}
            </span>
          </button>
        );
      })}
      </div>
    </div>
  );
}
