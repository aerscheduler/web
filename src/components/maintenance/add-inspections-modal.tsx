/**
 * Put inspections on a tail.
 *
 * Three ways in, because schools arrive here in three different states:
 *
 *  - AVIATES — a mechanic setting up a new aircraft wants the standard airworthiness set,
 *    and should not have to know that a 100-hour is `remindHours: 1000`. Multi-select,
 *    because "all seven" is the normal answer.
 *  - Recurring — anything else the shop repeats: an oil change, a gearbox, an ELT battery.
 *  - One-off — a date that happens once and does not come back. This is what somebody means
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
import { resourceLabel, type CreateReminderTemplateInput, type InspectionPreset, type Resource } from "@/types/api";
import { cn } from "@/lib/utils";
import { ResponsiveModal } from "@/components/responsive-modal";
import { DatePickerField } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

type Mode = "standard" | "recurring" | "oneOff";

const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: "standard", label: "Standard set", hint: "The AVIATES airworthiness inspections" },
  { value: "recurring", label: "Recurring", hint: "Repeats on hours or a set number of days" },
  { value: "oneOff", label: "One-off", hint: "A single date that doesn't come back" },
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
  const [basis, setBasis] = React.useState<"days" | "hours">("days");
  const [every, setEvery] = React.useState("100");
  const [warn, setWarn] = React.useState("10");
  const [meter, setMeter] = React.useState<"tach" | "hobbs">("tach");
  const [date, setDate] = React.useState("");
  const [grounds, setGrounds] = React.useState(false);
  // When the interval last came round. Blank means "starts now", which is right for a new
  // aircraft and wrong for every aircraft a school already operates — see `lastDone`.
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
    setEvery("100");
    setWarn("10");
    setMeter("tach");
    setDate("");
    setGrounds(false);
    setLastDone("");
    setLastDoneHours("");
  }

  /**
   * What each chosen tail should start counting from.
   *
   * Left blank this is `[{id}]`, and the server starts the interval at today's date and
   * today's meter — correct for an aircraft that just had the work done, and wrong for
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

  const customValid =
    name.trim().length > 0 && (mode === "oneOff" ? date !== "" : Number(every) > 0);
  const canSubmit =
    targets.length > 0 && (mode === "standard" ? chosen.length > 0 : customValid) && !busy;

  function buildCustom(): CreateReminderTemplateInput {
    const templateResources = resourcesPayload();
    const trimmed = name.trim().slice(0, 60);

    if (mode === "oneOff") {
      return {
        name: trimmed,
        repeat: false,
        ground: grounds,
        remindDate: new Date(`${date}T12:00:00`).toISOString(),
        // The server requires a lead time on a dated reminder, and a one-off with no
        // warning is a reminder that arrives the day it's already too late to act on.
        remindDaysBefore: Math.max(1, Math.min(30, Number(warn) || 7)),
        templateResources,
      };
    }

    if (basis === "hours") {
      // Typed in HOURS, stored in tenths — the meter's unit, not the form's.
      return {
        name: trimmed,
        repeat: true,
        ground: grounds,
        remindHours: Math.round(Number(every) * 10),
        remindHoursBefore: Math.max(1, Math.round((Number(warn) || 1) * 10)),
        hourBasedOn: meter,
        templateResources,
      };
    }

    return {
      name: trimmed,
      repeat: true,
      ground: grounds,
      remindDays: Math.round(Number(every)),
      remindDaysBefore: Math.max(1, Math.round(Number(warn) || 1)),
      templateResources,
    };
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
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setBasis("days")}
                    aria-pressed={basis === "days"}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-[13px] transition-colors",
                      basis === "days" ? "border-primary bg-primary/5" : "hover:bg-accent/50"
                    )}
                  >
                    On the calendar
                  </button>
                  <button
                    type="button"
                    onClick={() => setBasis("hours")}
                    aria-pressed={basis === "hours"}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-[13px] transition-colors",
                      basis === "hours" ? "border-primary bg-primary/5" : "hover:bg-accent/50"
                    )}
                  >
                    On the meter
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="insp-every" className="text-xs">
                      Every ({basis === "hours" ? "hours" : "days"})
                    </Label>
                    <Input
                      id="insp-every"
                      inputMode="decimal"
                      value={every}
                      onChange={(e) => setEvery(e.target.value.replace(/[^0-9.]/g, ""))}
                      className="tnum"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="insp-warn" className="text-xs">
                      Warn me ({basis === "hours" ? "hours" : "days"} out)
                    </Label>
                    <Input
                      id="insp-warn"
                      inputMode="decimal"
                      value={warn}
                      onChange={(e) => setWarn(e.target.value.replace(/[^0-9.]/g, ""))}
                      className="tnum"
                    />
                  </div>
                </div>

                {basis === "hours" && (
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
                )}
              </>
            ) : (
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
            )}

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="insp-grounds">Grounds the aircraft</Label>
                <p className="text-xs text-muted-foreground">
                  Takes this tail off the line the moment it comes due.
                </p>
              </div>
              <Switch id="insp-grounds" checked={grounds} onCheckedChange={setGrounds} />
            </div>
          </div>
        )}

        {/* The difference between a useful reminder and a wrong one on an existing fleet.
            Optional, and the helper says exactly what leaving it blank means, because the
            default is right for a new aircraft and wrong for one that has been flying. */}
        {mode !== "oneOff" && (
          <div data-doc-shot="add-inspections-last-done" className="rounded-lg border border-border p-3">
            <Label className="text-xs">When was it last done?</Label>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Leave blank if the work was just done — the countdown starts today at the
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
            {/* One reading across several tails is almost never right — their meters
                differ. Say so rather than letting it produce quietly wrong countdowns. */}
            {lastDoneHours !== "" && targets.length > 1 && (
              <p className="mt-2 flex items-start gap-1 text-[11px] text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]">
                <AlertTriangle className="mt-px size-3 shrink-0" />
                That reading is applied to all {targets.length} aircraft. Their meters differ
                — add them one tail at a time, or fix each from its own page after.
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
                No aircraft yet — add a tail first and these will have something to hang off.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
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
                {/* An inspection attached to nothing creates no reminders at all — it looks
                    like it worked and then never fires. Say so before they submit. */}
                {tails.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Pick at least one aircraft — an inspection with no tails never comes due.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? "Adding…" : "Add"}
          </Button>
        </div>
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
          {chosen.length} selected. Intervals are the common case — edit any of them after.
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
