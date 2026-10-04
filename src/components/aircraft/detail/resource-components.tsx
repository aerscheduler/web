import * as React from "react";
import { Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { AlertTriangle, CalendarDays, Gauge, Loader2, MoreHorizontal, Plus, RotateCcw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import type { AircraftComponent, AircraftComponentInput, ComponentLife, OwnerComponent, Resource } from "@/types/api";
import { useAircraftComponents, useDeleteAircraftComponent, useSaveAircraftComponent } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { canOpenWorkOrders, canSeeShop } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/confirm-dialog";
import { CardEmpty, CardSkeleton, DetailCard } from "@/components/detail/detail-page";
import { DocsHint } from "@/components/docs-hint";
import { ResponsiveModal } from "@/components/responsive-modal";
import { DatePickerField } from "@/components/date-picker";
import { Field } from "@/components/settings/parts";
import { ChipMenu, DateChip } from "@/components/property-chips";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * LIFE-LIMITED COMPONENTS on the aircraft page (Murray spec section 5): each part with its time
 * since new or overhaul now and the life it has left. Read by the people who read the aircraft's
 * maintenance (staff and technicians); added and changed by the people who set up inspections
 * (owners, admins, technicians). On the organization's own aircraft and customer aircraft alike.
 *
 * The server computes every number here (`life`), the same arithmetic the linked inspection's
 * countdown uses, so this card and the Inspections card above it cannot disagree. Hours are
 * TENTHS on the wire.
 */

/** Tenths as hours, one decimal, grouped: 46000 is "4,600.0". */
export const componentHours = (tenths: number) => (tenths / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const day = (key: string) => format(parseISO(key), "MMM d, yyyy");
const meterName = (m: "tach" | "hobbs") => (m === "hobbs" ? "Hobbs" : "tach");

/** "Typed hours" to tenths: null for empty, undefined for not a number. */
function tenthsFrom(text: string): number | null | undefined {
  if (!text.trim()) return null;
  const n = Number(text.replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 10);
}

type Tone = "ok" | "dueSoon" | "overdue" | "none" | "removed";

const FIGURE: Record<Tone, string> = {
  // Past the limit is amber and strong, never red: red is for errors (Tony, 2026-09-30).
  overdue: "font-semibold text-warning",
  dueSoon: "font-semibold text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]",
  ok: "font-semibold text-foreground",
  none: "font-normal text-muted-foreground",
  removed: "font-normal text-muted-foreground",
};
const RAIL: Record<Tone, string> = {
  overdue: "bg-[var(--warning)]",
  dueSoon: "bg-[var(--warning)]",
  ok: "bg-primary",
  none: "bg-primary",
  removed: "bg-muted-foreground/40",
};

/** The headline: how much is left on the clock that decides, or how far past it is. */
export function lifeFigure(life: ComponentLife): string {
  if (life.status === "removed") return "Came off";
  if (life.status === "none") return life.hours || life.calendar ? "Not counted" : "No limit";
  if (life.binding === "hours" && life.hours?.left != null) {
    const left = life.hours.left;
    return left > 0 ? `${componentHours(left)} h left` : left === 0 ? "At its limit" : `${componentHours(-left)} h past limit`;
  }
  if (life.calendar) {
    const d = life.calendar.daysLeft;
    if (d <= 0) return d === 0 ? "Limit today" : `Past limit ${format(parseISO(life.calendar.dueOn), "MMM d")}`;
    return d <= 90 ? `${d} day${d === 1 ? "" : "s"} left` : `Until ${day(life.calendar.dueOn)}`;
  }
  return "No limit";
}

/** The line under it: its time now and each limit, in words. */
function lifeDetail(c: Pick<AircraftComponent, "timeSince" | "life" | "limitHours" | "limitMonths">): string {
  const parts: string[] = [];
  const since = c.timeSince === "overhaul" ? "since overhaul" : "since new";
  if (c.life.timeNow != null) {
    parts.push(`${componentHours(c.life.timeNow)} h ${since}${c.limitHours != null ? ` of ${componentHours(c.limitHours)}` : ""}, on the ${meterName(c.life.meter)}`);
  } else if (c.limitHours != null) {
    parts.push(`${componentHours(c.limitHours)} h limit, not counted without a ${meterName(c.life.meter)}`);
  }
  if (c.life.calendar) parts.push(`limit ${day(c.life.calendar.dueOn)}`);
  else if (c.limitMonths != null && c.life.status === "removed") parts.push(`${c.limitMonths} month limit`);
  return parts.join(", ") || "No limit recorded";
}

/** How far through its life the deciding clock is, 0 to 100. */
function lifePercent(c: Pick<AircraftComponent, "life" | "installedOn" | "sinceOn">): number {
  const { life } = c;
  if (life.binding === "hours" && life.hours?.left != null) return Math.min(100, Math.max(0, (1 - life.hours.left / life.hours.limit) * 100));
  if (life.binding === "calendar" && life.calendar) {
    const from = parseISO(c.sinceOn ?? c.installedOn).getTime();
    const to = parseISO(life.calendar.dueOn).getTime();
    const total = Math.max(1, (to - from) / 86_400_000);
    return Math.min(100, Math.max(0, (1 - life.calendar.daysLeft / total) * 100));
  }
  return 0;
}

const describe = (c: Pick<AircraftComponent, "position" | "partNumber" | "serialNumber">) =>
  [c.position, c.partNumber ? `P/N ${c.partNumber}` : null, c.serialNumber ? `S/N ${c.serialNumber}` : null].filter(Boolean).join(" · ");

export function ResourceComponents({ resource }: { resource: Resource }) {
  const { roles } = useAuth();
  const plane = resource.type?.plane ?? null;
  const readable = canSeeShop(roles) && !!plane;
  const editable = canOpenWorkOrders(roles);
  const [showRemoved, setShowRemoved] = React.useState(false);
  const q = useAircraftComponents(resource.id, { enabled: readable, removed: showRemoved });
  const [editing, setEditing] = React.useState<AircraftComponent | "new" | null>(null);
  const [removing, setRemoving] = React.useState<AircraftComponent | null>(null);
  const save = useSaveAircraftComponent(resource.id);
  const del = useDeleteAircraftComponent(resource.id);
  const confirm = useConfirm();
  if (!readable) return null;

  const all = q.data ?? [];
  const on = all.filter((c) => !c.removedOn);
  const off = all.filter((c) => !!c.removedOn);
  const pastLimit = on.filter((c) => c.life.status === "overdue").length;
  const nearLimit = on.filter((c) => c.life.status === "dueSoon").length;

  async function remove(c: AircraftComponent) {
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      description: "Only for a component entered by mistake: it disappears with its tracking. If it came off the aircraft, record that instead, so its history stays.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await del.mutateAsync(c.id);
      toast.success(`${c.name} deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete it.");
    }
  }

  async function putBack(c: AircraftComponent) {
    try {
      await save.mutateAsync({ id: c.id, removedOn: null });
      toast.success(`${c.name} is back on ${plane?.tailNumber ?? "the aircraft"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't put it back on.");
    }
  }

  return (
    <>
      <DetailCard
        title={
          <span className="inline-flex items-center gap-1.5">
            Components
            <DocsHint topic="aircraft-components" />
          </span>
        }
        description="Life-limited parts, their time now and the life they have left. Each limit is tracked as an inspection."
        action={
          editable ? (
            <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Add
            </Button>
          ) : undefined
        }
        docShot="aircraft-components"
      >
        {q.isPending ? (
          <CardSkeleton rows={2} />
        ) : q.isError ? (
          <CardEmpty>Couldn&apos;t load components.</CardEmpty>
        ) : on.length === 0 && !showRemoved ? (
          <CardEmpty>
            No life-limited components recorded.
            {editable && (
              <>
                {" "}
                <button type="button" onClick={() => setEditing("new")} className="underline underline-offset-2">
                  Add one
                </button>{" "}
                with its time and limit, and it is tracked like an inspection.
              </>
            )}
          </CardEmpty>
        ) : (
          <>
            {on.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {pastLimit > 0 && <Badge variant="warning">{pastLimit} past limit</Badge>}
                {nearLimit > 0 && <Badge variant="warning">{nearLimit} near limit</Badge>}
                <span className="text-xs text-muted-foreground">{on.length} on the aircraft</span>
              </div>
            )}
            <ul className="divide-y divide-border" aria-label="Components">
              {[...on, ...(showRemoved ? off : [])].map((c) => (
                <ComponentRow
                  key={c.id}
                  component={c}
                  onOpen={editable ? () => setEditing(c) : undefined}
                  actions={
                    editable ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`More for ${c.name}`}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(c)}>Edit</DropdownMenuItem>
                          {c.removedOn ? (
                            <DropdownMenuItem onSelect={() => void putBack(c)}>
                              <RotateCcw className="size-4" /> Put back on
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => setRemoving(c)}>Record it came off</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => void remove(c)}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : undefined
                  }
                />
              ))}
            </ul>
          </>
        )}
        {!q.isPending && !q.isError && (
          <button
            type="button"
            className="mt-3 text-[13px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setShowRemoved((v) => !v)}
          >
            {showRemoved ? "Hide components that came off" : "Show components that came off"}
          </button>
        )}
      </DetailCard>

      {editable && editing && (
        <ComponentFormModal
          resource={resource}
          component={editing === "new" ? null : editing}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
      {editable && removing && <ComponentRemovalModal resource={resource} component={removing} onOpenChange={(o) => !o && setRemoving(null)} />}
    </>
  );
}

function ComponentRow({ component: c, onOpen, actions }: { component: AircraftComponent; onOpen?: () => void; actions?: React.ReactNode }) {
  const tone: Tone = c.life.status;
  const open = c.inspections.find((i) => i.reminderId != null);
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-medium">{c.name}</span>
          {c.life.status === "overdue" && c.groundAtLimit && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-warning" title="Reaching its limit grounds the aircraft.">
              <AlertTriangle className="size-3" /> Grounds
            </span>
          )}
        </div>
        <span className={cn("shrink-0 text-[13px] tabular-nums", FIGURE[tone])} data-testid="component-life">
          {lifeFigure(c.life)}
        </span>
      </div>
      {describe(c) && <p className="truncate text-[12px] text-muted-foreground">{describe(c)}</p>}
      <div className="mt-1 flex items-center gap-2.5">
        {/* Off the aircraft, it has no life to fill: the line says where it stopped. */}
        {!c.removedOn && (
          <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-border">
            <div className={cn("h-full rounded-full transition-[width]", RAIL[tone])} style={{ width: `${lifePercent(c)}%` }} />
          </div>
        )}
        <span className={cn("text-[11px] text-muted-foreground", c.removedOn ? "min-w-0" : "shrink-0")}>
          {c.removedOn
            ? `Came off ${day(c.removedOn)}${c.life.timeNow != null ? `, ${componentHours(c.life.timeNow)} h ${c.timeSince === "overhaul" ? "since overhaul" : "since new"}` : ""}`
            : lifeDetail(c)}
        </span>
      </div>
    </>
  );
  return (
    <li className="flex items-start gap-2 py-2.5 first:pt-0 last:pb-0" data-testid={`component-${c.id}`}>
      {onOpen ? (
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left hover:opacity-80">
          {body}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{body}</div>
      )}
      {open && (
        <Link
          to="/maintenance/inspections/$inspectionId"
          params={{ inspectionId: String(open.reminderId) }}
          className="shrink-0 pt-0.5 text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          title="The inspection that tracks its limit"
        >
          Inspection
        </Link>
      )}
      {actions && <div className="shrink-0">{actions}</div>}
    </li>
  );
}

/** Add or change a component: the thing itself in fields, the settings that have a default as chips. */
function ComponentFormModal({ resource, component, onOpenChange }: { resource: Resource; component: AircraftComponent | null; onOpenChange: (open: boolean) => void }) {
  const plane = resource.type?.plane;
  const save = useSaveAircraftComponent(resource.id);
  const hobbsOnly = plane?.meterMode === "hobbs_only";
  const noMeters = plane?.meterMode === "none";
  const [meter, setMeter] = React.useState<"tach" | "hobbs">(component?.meter ?? (hobbsOnly ? "hobbs" : "tach"));
  const meterNow = plane ? (meter === "hobbs" ? plane.hobbsTime : plane.tachTime) : null;
  const tenthsText = (t: number | null | undefined) => (t == null ? "" : (t / 10).toFixed(1));

  const [name, setName] = React.useState(component?.name ?? "");
  const [position, setPosition] = React.useState(component?.position ?? "");
  const [partNumber, setPartNumber] = React.useState(component?.partNumber ?? "");
  const [serialNumber, setSerialNumber] = React.useState(component?.serialNumber ?? "");
  const [installedOn, setInstalledOn] = React.useState(component?.installedOn ?? format(new Date(), "yyyy-MM-dd"));
  const [installedAt, setInstalledAt] = React.useState(tenthsText(component ? component.installedAtMeter : noMeters ? null : meterNow));
  const [timeAtInstall, setTimeAtInstall] = React.useState(component && component.timeAtInstall ? tenthsText(component.timeAtInstall) : "");
  const [timeSince, setTimeSince] = React.useState<"new" | "overhaul">(component?.timeSince ?? "new");
  const [sinceOn, setSinceOn] = React.useState(component?.sinceOn ?? "");
  const [limitHours, setLimitHours] = React.useState(tenthsText(component?.limitHours));
  const [limitMonths, setLimitMonths] = React.useState(component?.limitMonths != null ? String(component.limitMonths) : "");
  const [grounds, setGrounds] = React.useState(component?.groundAtLimit ?? true);
  const [notes, setNotes] = React.useState(component?.notes ?? "");
  const [tried, setTried] = React.useState(false);

  const at = tenthsFrom(installedAt);
  const time = tenthsFrom(timeAtInstall);
  const lh = tenthsFrom(limitHours);
  const lm = limitMonths.trim() ? Number(limitMonths) : null;
  const problems = {
    name: !name.trim() ? "Give it a name." : null,
    installedAt: at === undefined ? "A reading, like 2195.0." : null,
    time: time === undefined ? "Hours, like 300.0." : null,
    limitHours: lh === undefined || lh === 0 ? "Hours, like 500.0." : lh != null && noMeters ? "This aircraft has no meters: give a limit in months." : null,
    limitMonths: lm != null && (!Number.isInteger(lm) || lm < 1 || lm > 600) ? "Whole months, 1 to 600." : null,
  };
  const invalid = Object.values(problems).some(Boolean);

  async function submit() {
    setTried(true);
    if (invalid) return;
    const body: AircraftComponentInput & { id?: number } = {
      ...(component ? { id: component.id } : {}),
      name: name.trim(),
      position: position.trim() || null,
      partNumber: partNumber.trim() || null,
      serialNumber: serialNumber.trim() || null,
      installedOn,
      installedAtMeter: noMeters ? null : (at ?? null),
      meter,
      timeAtInstall: time ?? 0,
      timeSince,
      sinceOn: sinceOn || null,
      limitHours: lh ?? null,
      limitMonths: lm,
      groundAtLimit: grounds,
      notes: notes.trim() || null,
    };
    try {
      const saved = await save.mutateAsync(body);
      toast.success(component ? `${saved.name} saved` : `${saved.name} added${saved.inspections.length ? ", its limit is tracked" : ""}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the component.");
    }
  }

  const err = (k: keyof typeof problems) =>
    tried && problems[k] ? <p className="text-xs text-destructive">{problems[k]}</p> : null;

  return (
    <ResponsiveModal
      open
      onOpenChange={onOpenChange}
      title={component ? "Edit component" : "Add component"}
      description={`On ${plane?.tailNumber ?? "this aircraft"}. A limit is tracked as an inspection, so it warns and reminds like the others.`}
      dataDocShot="aircraft-component-form"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="cmp-name">
            <Input id="cmp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Left magneto" maxLength={60} aria-invalid={tried && !!problems.name} />
            {err("name")}
          </Field>
          <Field label="Position" htmlFor="cmp-position">
            <Input id="cmp-position" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Engine" maxLength={60} list="cmp-positions" />
            <datalist id="cmp-positions">
              <option value="Engine" />
              <option value="Propeller" />
              <option value="Airframe" />
              <option value="Avionics" />
            </datalist>
          </Field>
          <Field label="Part number" htmlFor="cmp-pn">
            <Input id="cmp-pn" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="4371" maxLength={40} />
          </Field>
          <Field label="Serial number" htmlFor="cmp-sn">
            <Input id="cmp-sn" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="L-18240" maxLength={40} />
          </Field>
          <Field label="Installed on" htmlFor="cmp-installed-on">
            <DatePickerField id="cmp-installed-on" value={installedOn} onChange={(v) => setInstalledOn(v || installedOn)} max={format(new Date(), "yyyy-MM-dd")} />
          </Field>
          {!noMeters && (
            <Field label={`Aircraft ${meterName(meter)} when installed`} htmlFor="cmp-installed-at" hint={meterNow != null ? `Now ${componentHours(meterNow)}.` : undefined}>
              <Input id="cmp-installed-at" value={installedAt} onChange={(e) => setInstalledAt(e.target.value)} placeholder={meterNow != null ? (meterNow / 10).toFixed(1) : "2195.0"} inputMode="decimal" className="tnum" aria-invalid={tried && !!problems.installedAt} />
              {err("installedAt")}
            </Field>
          )}
          <Field label="Its time when installed" htmlFor="cmp-time" hint={`Hours since ${timeSince === "overhaul" ? "overhaul" : "new"}.`}>
            <Input id="cmp-time" value={timeAtInstall} onChange={(e) => setTimeAtInstall(e.target.value)} placeholder="0.0" inputMode="decimal" className="tnum" aria-invalid={tried && !!problems.time} />
            {err("time")}
          </Field>
          <div className="hidden sm:block" />
          <Field label="Life limit, hours" htmlFor="cmp-limit-hours" hint={noMeters ? "This aircraft has no meters." : `Of its own time ${timeSince === "overhaul" ? "since overhaul" : "since new"}.`}>
            <Input id="cmp-limit-hours" value={limitHours} onChange={(e) => setLimitHours(e.target.value)} placeholder="500.0" inputMode="decimal" className="tnum" disabled={noMeters} aria-invalid={tried && !!problems.limitHours} />
            {err("limitHours")}
          </Field>
          <Field label="Life limit, months" htmlFor="cmp-limit-months" hint={`Either or both: whichever comes first. Months count from ${timeSince === "overhaul" ? "the overhaul" : "new"}, else the day it was installed.`}>
            <Input id="cmp-limit-months" value={limitMonths} onChange={(e) => setLimitMonths(e.target.value)} placeholder="72" inputMode="numeric" className="tnum" aria-invalid={tried && !!problems.limitMonths} />
            {err("limitMonths")}
          </Field>
        </div>

        <div className="flex flex-wrap gap-1.5" aria-label="Settings">
          <ChipMenu
            id="cmp-since"
            name="Its time counts since"
            leading={<RotateCcw className="size-3.5" />}
            label={timeSince === "overhaul" ? "Since overhaul" : "Since new"}
            set={timeSince === "overhaul"}
            value={timeSince}
            onChange={(v) => setTimeSince(v as "new" | "overhaul")}
            options={[
              { value: "new", label: "Since new" },
              { value: "overhaul", label: "Since overhaul" },
            ]}
          />
          <DateChip
            id="cmp-since-on"
            name={timeSince === "overhaul" ? "Overhauled on" : "New on"}
            empty={timeSince === "overhaul" ? "Overhaul date" : "Date new"}
            prefix={timeSince === "overhaul" ? "Overhauled " : "New "}
            value={sinceOn}
            onChange={setSinceOn}
          />
          {!noMeters && !hobbsOnly && plane?.meterMode !== "tach_only" && (
            <ChipMenu
              id="cmp-meter"
              name="Counts on"
              leading={<Gauge className="size-3.5" />}
              label={`On the ${meterName(meter)}`}
              set={meter !== "tach"}
              value={meter}
              onChange={(v) => {
                const next = v as "tach" | "hobbs";
                setMeter(next);
                // Untouched, the reading follows the meter it counts on.
                if (!component && plane) setInstalledAt(((next === "hobbs" ? plane.hobbsTime : plane.tachTime) / 10).toFixed(1));
              }}
              options={[
                { value: "tach", label: "On the tach", hint: "Time in service, the usual clock for a part." },
                { value: "hobbs", label: "On the Hobbs" },
              ]}
            />
          )}
          <ChipMenu
            id="cmp-grounds"
            name="At the limit"
            leading={<ShieldAlert className="size-3.5" />}
            label={grounds ? "Grounds at the limit" : "Does not ground"}
            set={!grounds}
            value={grounds ? "yes" : "no"}
            onChange={(v) => setGrounds(v === "yes")}
            options={[
              { value: "yes", label: "Grounds at the limit", hint: "The aircraft comes off the line when it is reached." },
              { value: "no", label: "Does not ground", hint: "It is warned about and listed, nothing more." },
            ]}
          />
        </div>

        <Field label="Notes" htmlFor="cmp-notes">
          <Textarea id="cmp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Overhauled by the accessory shop, 8130-3 in the logbook." maxLength={2000} rows={2} />
        </Field>
      </div>
    </ResponsiveModal>
  );
}

/** Record that a component came off: the day and the reading. Its time stops and its tracking ends. */
function ComponentRemovalModal({ resource, component, onOpenChange }: { resource: Resource; component: AircraftComponent; onOpenChange: (open: boolean) => void }) {
  const plane = resource.type?.plane;
  const save = useSaveAircraftComponent(resource.id);
  const meterNow = plane ? (component.meter === "hobbs" ? plane.hobbsTime : plane.tachTime) : null;
  const [removedOn, setRemovedOn] = React.useState(format(new Date(), "yyyy-MM-dd"));
  const [reading, setReading] = React.useState(meterNow != null && component.installedAtMeter != null ? (meterNow / 10).toFixed(1) : "");
  const at = tenthsFrom(reading);

  async function submit() {
    if (at === undefined) {
      toast.error("The reading is hours, like 2195.0.");
      return;
    }
    try {
      await save.mutateAsync({ id: component.id, removedOn, ...(component.installedAtMeter != null && at != null ? { removedAtMeter: at } : {}) });
      toast.success(`${component.name} recorded as off. Its limit is no longer tracked.`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't record that.");
    }
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={onOpenChange}
      title={`${component.name} came off`}
      description="Its time stops here and the inspection tracking its limit is removed. It stays on the card under the components that came off."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Record it
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Came off on" htmlFor="cmp-removed-on">
          <DatePickerField id="cmp-removed-on" value={removedOn} onChange={(v) => setRemovedOn(v || removedOn)} min={component.installedOn} max={format(new Date(), "yyyy-MM-dd")} />
        </Field>
        {component.installedAtMeter != null && (
          <Field label={`Aircraft ${meterName(component.meter)} then`} htmlFor="cmp-removed-at">
            <Input id="cmp-removed-at" value={reading} onChange={(e) => setReading(e.target.value)} placeholder={meterNow != null ? (meterNow / 10).toFixed(1) : "2195.0"} inputMode="decimal" className="tnum" />
          </Field>
        )}
      </div>
    </ResponsiveModal>
  );
}

/** The owner's read-only list on their customer aircraft: each part and its life left. */
export function OwnerComponentsCard({ components }: { components: OwnerComponent[] | undefined }) {
  if (!components?.length) return null;
  return (
    <DetailCard title="Components" description="Life-limited parts the shop tracks on this aircraft, and the life they have left.">
      <ul className="divide-y divide-border" aria-label="Components">
        {components.map((c) => {
          const tone: Tone = c.life.status;
          return (
            <li key={c.id} className="py-2 text-[13px] first:pt-0 last:pb-0">
              {/* Name and life on one line, the detail full width below: this card sits in a narrow column. */}
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-medium">{c.name}</span>
                <span className={cn("shrink-0 tabular-nums", FIGURE[tone])}>
                  {c.life.binding === "calendar" && c.life.calendar ? <CalendarDays className="mr-1 inline size-3.5 align-[-2px]" /> : null}
                  {lifeFigure(c.life)}
                </span>
              </div>
              {describe(c) && <div className="text-[12px] text-muted-foreground">{describe(c)}</div>}
              <div className="text-[12px] text-muted-foreground">{lifeDetail(c)}</div>
            </li>
          );
        })}
      </ul>
    </DetailCard>
  );
}
