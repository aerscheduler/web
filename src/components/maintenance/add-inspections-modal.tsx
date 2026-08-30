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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opened from one aircraft: that tail is the answer, not a default to be edited away. */
  fixedResource?: Resource | null;
}) {
  const presetsQ = useInspectionPresets({ enabled: open });
  const planesQ = usePlanes({}, { enabled: open && !fixedResource });
  const create = useCreateMaintenanceReminderTemplate();

  const [mode, setMode] = React.useState<Mode>("standard");
  const [chosen, setChosen] = React.useState<string[]>([]);
  const [tails, setTails] = React.useState<number[]>([]);
  const [busy, setBusy] = React.useState(false);

  // Custom / one-off fields.
  const [name, setName] = React.useState("");
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
   * The one thing somebody has to understand about picking months.
   *
   * A calendar month is not 30 days and it is not an anniversary. Said here rather than left
   * for a mechanic to discover from a due date that looks a fortnight off.
   */
  const monthNote = (
    <p className="text-xs text-muted-foreground">
      A calendar month runs to the END of the month, which is what 14 CFR 91.409(a) and the
      other calendar inspections mean. Signed any day in February, a 12 month interval is due
      on the last day of February the following year.
    </p>
  );

  /** One control, rendered by both the recurring form and the one-off meter deadline. */
  const meterPicker = (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {(["tach", "hobbs"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMeter(m)}
          aria-pressed={meter === m}
          className={cn(
            "rounded-lg border px-3 py-2 text-left text-[13px] capitalize transition-colors",
            meter === m ? "border-primary bg-primary/5" : "hover:bg-accent/50"
          )}
        >
          Count {m} time
        </button>
      ))}
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveModal
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
          <div data-doc-shot="add-inspections-recurring" className="space-y-3">
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

            {mode === "recurring" ? (
              <>
                {/* Three ways an interval is written. "Whichever comes first" is how most
                    recurring ADs read, and how an oil change usually reads too. */}
                <div className="grid gap-1.5 sm:grid-cols-3">
                  {(
                    [
                      { value: "days", label: "On the calendar" },
                      { value: "hours", label: "On the meter" },
                      { value: "both", label: "Whichever comes first" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setBasis(option.value);
                        //The shared boxes now belong to a different clock: 100 hours, or 12
                        //calendar months. "Whichever comes first" puts hours in the shared
                        //pair and the calendar in its own, so it defaults like hours.
                        applyDefaults(option.value === "days" ? everyUnit : "hours");
                      }}
                      aria-pressed={basis === option.value}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left text-[13px] transition-colors",
                        basis === option.value ? "border-primary bg-primary/5" : "hover:bg-accent/50"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="insp-every" className="inline-flex items-center gap-1.5 text-xs">
                      Every {basis === "days" ? "" : "(hours)"}
                      {basis === "days" && <DocsHint topic="calendar-interval-unit" />}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="insp-every"
                        inputMode="decimal"
                        value={every}
                        onChange={(e) => {
                          everyTouched.current = true;
                          setEvery(e.target.value.replace(/[^0-9.]/g, ""));
                        }}
                        className="tnum"
                      />
                      {basis === "days" &&
                        unitPicker("insp-every-unit", everyUnit, (u) => {
                          setEveryUnit(u);
                          applyDefaults(u);
                        })}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="insp-warn" className="text-xs">
                      Warn me ({basis === "days" ? "days" : "hours"} out)
                    </Label>
                    <Input
                      id="insp-warn"
                      inputMode="decimal"
                      value={warn}
                      onChange={(e) => {
                        warnTouched.current = true;
                        setWarn(e.target.value.replace(/[^0-9.]/g, ""));
                      }}
                      className="tnum"
                    />
                  </div>
                </div>

                {basis === "days" && everyUnit === "months" && monthNote}

                {basis === "both" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="insp-every-days" className="inline-flex items-center gap-1.5 text-xs">
                        or every
                        <DocsHint topic="calendar-interval-unit" />
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="insp-every-days"
                          inputMode="decimal"
                          value={everyDays}
                          onChange={(e) => setEveryDays(e.target.value.replace(/[^0-9.]/g, ""))}
                          className="tnum"
                        />
                        {unitPicker("insp-every-days-unit", everyDaysUnit, setEveryDaysUnit)}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="insp-warn-days" className="text-xs">
                        Warn me (days out)
                      </Label>
                      <Input
                        id="insp-warn-days"
                        inputMode="decimal"
                        value={warnDays}
                        onChange={(e) => setWarnDays(e.target.value.replace(/[^0-9.]/g, ""))}
                        className="tnum"
                      />
                    </div>
                  </div>
                )}

                {basis === "both" && everyDaysUnit === "months" && monthNote}

                {basis !== "days" && meterPicker}
              </>
            ) : (
              <div className="space-y-3">
                {/* A one-off is due on a date OR at a meter reading. "Comply within the next
                    50 hours" is how a large share of ADs are written, and it has no date. */}
                <div className="flex gap-2">
                  {(
                    [
                      { value: "date", label: "On a date" },
                      { value: "hours", label: "At an hour reading" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={onceOn === option.value}
                      onClick={() => setOnceOn(option.value)}
                      className={cn(
                        "flex-1 rounded-lg border border-border px-3 py-2 text-xs transition-colors",
                        onceOn === option.value ? "border-primary bg-primary/5" : "hover:bg-accent/50"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {onceOn === "date" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
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
                        Warn me (days out)
                      </Label>
                      <Input
                        id="insp-warn-once"
                        inputMode="numeric"
                        value={warn}
                        onChange={(e) => setWarn(e.target.value.replace(/[^0-9]/g, ""))}
                        className="tnum"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="insp-at-hours" className="inline-flex items-center gap-1.5 text-xs">
                        Due at ({meter})
                        <DocsHint topic="one-off-at-hours" />
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
                      {/* The reading itself, not "50 hours from now". Said plainly because
                          the recurring form above this one asks for an interval, and the two
                          fields look identical. */}
                      <p className="text-[11px] text-muted-foreground">
                        The reading it comes due AT, not how many hours from now.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="insp-warn-at-hours" className="text-xs">
                        Warn me (hours out)
                      </Label>
                      <Input
                        id="insp-warn-at-hours"
                        inputMode="decimal"
                        value={warn}
                        onChange={(e) => setWarn(e.target.value.replace(/[^0-9.]/g, ""))}
                        className="tnum"
                      />
                    </div>
                    {/* Which clock, same control as the recurring form. Without it the
                        reading above is measured against whatever `meter` happened to be. */}
                    <div className="sm:col-span-2">{meterPicker}</div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="insp-grounds">Grounds the aircraft</Label>
                  <DocsHint topic="inspection-grounds" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Takes this tail off the line the moment it comes due.
                </p>
              </div>
              <Switch id="insp-grounds" checked={grounds} onCheckedChange={setGrounds} />
            </div>
          </div>
        )}

        {/* WHERE THE RULE COMES FROM.
            Not offered on the standard set: that mode is multi-select and its payloads are
            the server's, so one AD number applied to seven ticked presets would be wrong by
            construction. If an AVIATES preset ever needs a source it belongs in the preset. */}
        {/* WHERE THE RULE COMES FROM.
            Not offered on the standard set: that mode is multi-select and its payloads are
            the server's, so one AD number applied to seven ticked presets would be wrong by
            construction. If an AVIATES preset ever needs a source it belongs in the preset. */}
        {mode !== "standard" && (
          <InspectionSourceFields
            value={source}
            onChange={setSource}
            docShot="add-inspections-source"
          />
        )}

        {/* The difference between a useful reminder and a wrong one on an existing fleet.
            Optional, and the helper says exactly what leaving it blank means, because the
            default is right for a new aircraft and wrong for one that has been flying. */}
        {mode !== "oneOff" && (
          <div data-doc-shot="add-inspections-last-done" className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs">When was it last done?</Label>
              <DocsHint topic="inspection-last-done" />
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Leave blank if the work was just done, the countdown starts today at the
              current meter. On an aircraft already partway through its interval, fill this
              in or the first reminder lands late.
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="insp-last-date" className="text-[11px] text-muted-foreground">
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
                <Label htmlFor="insp-last-hours" className="text-[11px] text-muted-foreground">
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
              <p className="mt-2 flex items-start gap-1 text-[11px] text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]">
                <AlertTriangle className="mt-px size-3 shrink-0" />
                That reading is applied to all {targets.length} aircraft. Their meters differ
               , add them one tail at a time, or fix each from its own page after.
              </p>
            )}
          </div>
        )}

        {!fixedResource && (
          <div className="space-y-1.5">
            <Label className="text-xs">Applies to</Label>
            {planesQ.isPending ? (
              <Skeleton className="h-8 w-full" />
            ) : fleet.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No aircraft yet, add a tail first and these will have something to hang off.
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
                    Pick at least one aircraft, an inspection with no tails never comes due.
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
  );
}
