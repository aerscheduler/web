/**
 * Get maintenance tracking running — how big is the operation, then the first reminder.
 *
 * The old behaviour was a link to /maintenance, which is a list of reminders you don't
 * have yet. What someone actually needs here is one reminder attached to their aircraft,
 * and the fastest route to that is a preset: nobody setting up should have to know that
 * "annual" means remindDays 365 with a 30-day warning.
 *
 * Fleet size is ASKED, and the answer is theirs. It was briefly answered for them by
 * counting tails on file, which is wrong in the most common case there is: someone
 * evaluating the platform adds one aeroplane to get moving and actually operates ten.
 * Counting rows measures how far through data entry they are, not how big they are — so
 * it would hide groups from exactly the fleet that needs them.
 *
 * Groups are then OFFERED to the sizes they help, never imposed: a one-aeroplane
 * operation is taken straight to the reminder and never learns the concept exists.
 */

import * as React from "react";
import { Layers, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { useCreateMaintenanceReminderTemplate, usePlanes } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { resourceLabel } from "@/types/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ResourceGroupForm } from "@/components/settings/groups-tab";
import { FlowChoice, FlowDone, FlowModal, FlowNav, type FlowProps } from "./flow-shell";

/**
 * The four reminders essentially every school sets first.
 *
 * Hours are DECI-hours (1000 = 100 h), matching the meter fields. `hourBasedOn: "tach"`
 * because inspection intervals are flown-time, and tach is what shops bill against.
 */
const PRESETS = [
  {
    id: "annual",
    label: "Annual inspection",
    hint: "Every 12 months, warn 30 days out",
    payload: { name: "Annual inspection", repeat: true, remindDays: 365, remindDaysBefore: 30 },
  },
  {
    id: "100hr",
    label: "100-hour inspection",
    hint: "Every 100 hours, warn 10 hours out",
    payload: {
      name: "100-hour inspection",
      repeat: true,
      remindHours: 1000,
      remindHoursBefore: 100,
      hourBasedOn: "tach" as const,
    },
  },
  {
    id: "oil",
    label: "Oil change",
    hint: "Every 50 hours, warn 5 hours out",
    payload: {
      name: "Oil change",
      repeat: true,
      remindHours: 500,
      remindHoursBefore: 50,
      hourBasedOn: "tach" as const,
    },
  },
  {
    id: "transponder",
    label: "Transponder / pitot-static",
    hint: "Every 24 months, warn 30 days out",
    payload: {
      name: "Transponder & pitot-static",
      repeat: true,
      remindDays: 730,
      remindDaysBefore: 30,
    },
  },
  { id: "custom", label: "Something else", hint: "Name it and set the interval yourself", payload: null },
] as const;

type PresetId = (typeof PRESETS)[number]["id"];

type Step = "size" | "groups" | "reminder" | "done";

/** How big the OPERATION is — their answer, not a count of what they've entered. */
type Size = "one" | "few" | "fleet";

const SIZES: { value: Size; label: string; hint: string }[] = [
  { value: "one", label: "Just one", hint: "We'll keep this simple — no groups, no extra steps." },
  { value: "few", label: "A handful", hint: "Two to nine. Groups are optional at this size." },
  { value: "fleet", label: "Ten or more", hint: "Groups will save you real time here." },
];

/** The smallest fleet the answer implies, for spotting "I said ten, I've entered one". */
const IMPLIED_MINIMUM: Record<Size, number> = { one: 1, few: 2, fleet: 10 };

/** Only for the progress dots. "groups" is an optional detour rather than a stage —
 *  giving it a dot would make the bar jump backwards for anyone taking the short path. */
const STEP_ORDER: Step[] = ["size", "reminder", "done"];

/** The detour sits at the position it branched from, so the dots read as "still near
 *  the start" instead of going blank (indexOf would be -1, i.e. nothing lit at all). */
const progressIndex = (step: Step) => (step === "groups" ? 0 : STEP_ORDER.indexOf(step));

export function MaintenanceFlow({ onClose }: FlowProps) {
  const planes = usePlanes();
  const create = useCreateMaintenanceReminderTemplate();

  const fleet = planes.data ?? [];

  // Named rather than numbered: the two paths are different lengths, and "step 2"
  // meaning different things depending on an earlier answer is how off-by-one bugs
  // get written into a wizard.
  const [step, setStep] = React.useState<Step>("size");
  // Seeded from the fleet on file only as an opening guess — they can say anything,
  // and what they say is what we branch on.
  // Names of groups made during this flow, so the step can confirm the work without
  // refetching, and `key` can reset the form for the next one.
  const [created, setCreated] = React.useState<string[]>([]);
  const [size, setSize] = React.useState<Size>(
    fleet.length >= 10 ? "fleet" : fleet.length > 1 ? "few" : "one"
  );
  const [preset, setPreset] = React.useState<PresetId>("annual");
  const [customName, setCustomName] = React.useState("");
  const [customDays, setCustomDays] = React.useState("90");
  // Default to the whole fleet: a template with no aircraft attached creates no
  // reminders at all, which would look like the flow silently did nothing.
  const [selected, setSelected] = React.useState<number[]>([]);
  React.useEffect(() => {
    if (fleet.length && selected.length === 0) setSelected(fleet.map((p) => p.id));
    // Seeding once, when the fleet arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleet.length]);

  const custom = preset === "custom";
  const nameOk = !custom || customName.trim().length > 0;
  const daysOk = !custom || Number(customDays) > 0;

  async function submit() {
    const chosen = PRESETS.find((p) => p.id === preset)!;
    const payload = chosen.payload ?? {
      name: customName.trim().slice(0, 60),
      repeat: true,
      remindDays: Math.round(Number(customDays)),
      remindDaysBefore: Math.min(30, Math.max(1, Math.round(Number(customDays) / 10))),
    };
    try {
      await create.mutateAsync({
        ...payload,
        templateResources: selected.map((id) => ({ id })),
      });
      setStep("done");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't create the reminder");
    }
  }

  // A school with no aircraft can't have a reminder — say so instead of failing later.
  if (!planes.isLoading && fleet.length === 0) {
    return (
      <FlowModal open onOpenChange={(o) => !o && onClose()} title="Track maintenance">
        <p className="text-sm text-muted-foreground">
          Maintenance reminders hang off an aircraft, so there&rsquo;s nothing to track yet. Add
          your first tail and come back — this takes about a minute after that.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button asChild onClick={onClose}>
            <Link to="/aircraft">Add an aircraft</Link>
          </Button>
        </div>
      </FlowModal>
    );
  }

  return (
    <FlowModal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Track maintenance due dates"
      description="One reminder is enough to start — you can add the rest later."
      step={progressIndex(step)}
      stepCount={STEP_ORDER.length}
    >
      {step === "size" && (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">
            How many aircraft will you be managing?
          </p>
          <FlowChoice options={SIZES} value={size} onChange={setSize} />

          {/* The answer can outrun the data, and usually does while someone is still
              evaluating. Say so and point at the fix rather than quietly believing
              whichever number is smaller. */}
          {fleet.length < IMPLIED_MINIMUM[size] && (
            <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              You have {fleet.length === 1 ? "one aircraft" : `${fleet.length} aircraft`} on file
              so far. This reminder will apply to {fleet.length === 1 ? "it" : "them"} — add the
              rest from the Aircraft page whenever you like, and reminders you set now can be
              applied to them too.
            </p>
          )}

          <FlowNav onNext={() => setStep(size === "one" ? "reminder" : "groups")} />
        </div>
      )}

      {step === "groups" && (
        <div>
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Layers className="size-4.5" />
            </span>
            <div className="min-w-0">
              <div className="font-medium">
                {size === "fleet" ? "Group your aircraft first?" : "Want to group your aircraft?"}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Groups like &ldquo;Trainers&rdquo; or &ldquo;Complex&rdquo; let a currency
                requirement — a checkout, a flight review — apply to a whole class of aircraft
                at once, and they keep themselves current as you add tails.
                {size === "fleet"
                  ? " At ten or more, that difference adds up fast."
                  : " Optional at your size — plenty of schools never bother."}
              </p>
              {created.length > 0 && (
                <p className="mt-1.5 text-xs text-success">
                  Created: {created.join(", ")}.
                </p>
              )}
            </div>
          </div>

          {/* The real Settings form, hosted here. Creating a group is part of the task,
              so it happens in the wizard — bouncing out to a settings page mid-flow is
              exactly what these flows exist to stop. */}
          <div className="mt-4 rounded-xl border p-4">
            <ResourceGroupForm
              key={created.length}
              submitLabel="Create group"
              cancelLabel={created.length > 0 ? "Done adding" : "Skip"}
              onCancel={() => setStep("reminder")}
              onSaved={(g) => setCreated((list) => [...list, g.name])}
            />
          </div>

          <FlowNav
            onBack={() => setStep("size")}
            onNext={() => setStep("reminder")}
            nextLabel={created.length > 0 ? "Next, set a reminder" : "Skip, set a reminder"}
          />
        </div>
      )}

      {step === "reminder" && (
        <div>
          <Label className="text-sm">What should we remind you about?</Label>
          <div className="mt-2">
            <FlowChoice
              options={PRESETS.map((p) => ({ value: p.id, label: p.label, hint: p.hint }))}
              value={preset}
              onChange={setPreset}
            />
          </div>

          {custom && (
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_8rem]">
              <div className="space-y-1.5">
                <Label htmlFor="mf-name" className="text-xs">
                  Name
                </Label>
                <Input
                  id="mf-name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="ELT battery"
                  maxLength={60}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mf-days" className="text-xs">
                  Every (days)
                </Label>
                <Input
                  id="mf-days"
                  inputMode="numeric"
                  value={customDays}
                  onChange={(e) => setCustomDays(e.target.value.replace(/[^0-9]/g, ""))}
                  className="tnum"
                />
              </div>
            </div>
          )}

          {fleet.length > 1 && (
            <div className="mt-4">
              <Label className="text-xs">Applies to</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {fleet.map((p) => {
                  const on = selected.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setSelected((s) => (on ? s.filter((id) => id !== p.id) : [...s, p.id]))
                      }
                      aria-pressed={on}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {resourceLabel(p).name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <FlowNav
            onBack={() => setStep(size === "one" ? "size" : "groups")}
            onNext={submit}
            nextLabel="Create reminder"
            nextDisabled={!nameOk || !daysOk || selected.length === 0}
            busy={create.isPending}
          />
        </div>
      )}

      {step === "done" && (
        <FlowDone
          headline="Maintenance tracking is on."
          body={`We'll warn you before it comes due on ${
            selected.length === 1 ? "that aircraft" : `all ${selected.length} aircraft`
          }. Add more from the Maintenance page whenever you like.`}
          onClose={onClose}
        >
          <Button asChild variant="outline" size="sm" onClick={onClose}>
            <Link to="/maintenance">
              <Wrench className="size-4" /> Open Maintenance
            </Link>
          </Button>
        </FlowDone>
      )}
    </FlowModal>
  );
}
