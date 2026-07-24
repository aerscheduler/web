import * as React from "react";
import { toast } from "sonner";
import { useCreatePlane, useUpdateResource } from "@/features/queries";
import type { CreatePlaneResourceInput, Location, Resource } from "@/types/api";
import { PLANE_TEMPLATES } from "@/components/aircraft/lib";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Combobox, type ComboOption } from "@/components/combobox";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FormState = {
  tailNumber: string;
  template: string;
  make: string;
  model: string;
  year: string;
  categoryClass: string;
  hobbs: string;
  tach: string;
  rateCents: number;
  rateBasis: "wet" | "dry";
  billByHobbs: boolean;
  locationId: string;
};

function emptyState(): FormState {
  return {
    tailNumber: "",
    template: "",
    make: "",
    model: "",
    year: "",
    categoryClass: "",
    hobbs: "",
    tach: "",
    rateCents: 0,
    rateBasis: "wet",
    billByHobbs: true,
    locationId: "",
  };
}

function stateFromResource(r: Resource): FormState {
  const p = r.type?.plane;
  const cost = p?.cost;
  const basis: "wet" | "dry" = cost?.dryRate != null && cost.wetRate == null ? "dry" : "wet";
  return {
    tailNumber: p?.tailNumber ?? "",
    template: "OTHER",
    make: p?.make ?? "",
    model: p?.model ?? "",
    year: p?.year ?? "",
    categoryClass: p?.categoryClass ?? "",
    hobbs: p ? String(p.hobbsTime) : "",
    tach: p ? String(p.tachTime) : "",
    rateCents: (basis === "wet" ? cost?.wetRate : cost?.dryRate) ?? 0,
    rateBasis: basis,
    billByHobbs: cost?.billByHobbsTime ?? true,
    locationId: r.FK_locationId ? String(r.FK_locationId) : "",
  };
}

/**
 * Add / edit an aircraft. When `resource` is provided the modal is in edit mode and
 * PATCHes the resource; otherwise it creates a new plane resource.
 */
export function AircraftFormModal({
  open,
  onOpenChange,
  resource,
  locations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource?: Resource | null;
  locations: Location[];
}) {
  const isEdit = !!resource;
  const create = useCreatePlane();
  const update = useUpdateResource(resource?.id ?? 0);
  const pending = create.isPending || update.isPending;

  const [form, setForm] = React.useState<FormState>(emptyState);
  // MoneyInput keeps its own text state and only re-syncs across undefined⇄number.
  // Bump this key to remount it whenever we set the rate programmatically.
  const [rateKey, setRateKey] = React.useState(0);

  // Reset the form whenever the modal opens (fresh add, or prefilled edit).
  React.useEffect(() => {
    if (!open) return;
    setForm(resource ? stateFromResource(resource) : emptyState());
    setRateKey((k) => k + 1);
  }, [open, resource]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function applyTemplate(value: string) {
    const t = PLANE_TEMPLATES.find((x) => x.value === value);
    if (!t) return;
    setForm((f) => ({
      ...f,
      template: value,
      make: t.value === "OTHER" ? f.make : t.make,
      model: t.value === "OTHER" ? f.model : t.model,
      categoryClass: t.value === "OTHER" ? f.categoryClass : t.categoryClass,
      rateBasis: "wet",
      rateCents: t.value === "OTHER" ? f.rateCents : t.wetRate,
    }));
    setRateKey((k) => k + 1);
  }

  const locationOptions: ComboOption[] = locations.map((l) => ({
    value: String(l.id),
    label: l.name,
  }));
  const noLocations = locations.length === 0;

  const tail = form.tailNumber.trim();
  const canSubmit =
    !pending &&
    tail.length > 0 &&
    form.categoryClass.trim().length > 0 &&
    !!form.locationId &&
    !noLocations;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    const hobbsTime = Number(form.hobbs) || 0;
    const tachTime = Number(form.tach) || 0;
    const cost = {
      billByHobbsTime: form.billByHobbs,
      ...(form.rateBasis === "wet"
        ? { wetRate: form.rateCents }
        : { dryRate: form.rateCents }),
    };

    if (isEdit && resource) {
      update.mutate(
        {
          location: { id: Number(form.locationId) },
          type: {
            plane: {
              tailNumber: tail,
              make: form.make.trim() || null,
              model: form.model.trim() || null,
              year: form.year.trim() || null,
              categoryClass: form.categoryClass.trim(),
              hobbsTime,
              tachTime,
              cost: {
                billByHobbsTime: form.billByHobbs,
                wetRate: form.rateBasis === "wet" ? form.rateCents : null,
                dryRate: form.rateBasis === "dry" ? form.rateCents : null,
              },
            },
          },
        },
        {
          onSuccess: () => {
            toast.success(`${tail} updated`);
            onOpenChange(false);
          },
          onError: (err) =>
            toast.error(err instanceof Error ? err.message : "Couldn't save aircraft"),
        }
      );
      return;
    }

    const input: CreatePlaneResourceInput = {
      location: { id: Number(form.locationId) },
      type: {
        plane: {
          tailNumber: tail,
          make: form.make.trim() || undefined,
          model: form.model.trim() || undefined,
          year: form.year.trim() || undefined,
          categoryClass: form.categoryClass.trim(),
          hobbsTime,
          tachTime,
          cost,
        },
      },
    };
    create.mutate(input, {
      onSuccess: () => {
        toast.success(`${tail} added to the fleet`);
        onOpenChange(false);
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Couldn't add aircraft"),
    });
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
      title={isEdit ? `Edit ${resource?.type?.plane?.tailNumber ?? "aircraft"}` : "Add aircraft"}
      description={
        isEdit
          ? "Update this aircraft's details, times, and rate."
          : "Add a tail to your fleet so it can be scheduled and billed."
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ac-tail">Tail number</Label>
            <Input
              id="ac-tail"
              autoFocus
              placeholder="N12345"
              value={form.tailNumber}
              onChange={(e) => set("tailNumber", e.target.value.toUpperCase())}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ac-template">Type template</Label>
            <Select value={form.template || undefined} onValueChange={applyTemplate}>
              <SelectTrigger id="ac-template" className="w-full">
                <SelectValue placeholder="Choose a model" />
              </SelectTrigger>
              <SelectContent>
                {PLANE_TEMPLATES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ac-make">Make</Label>
            <Input
              id="ac-make"
              placeholder="Cessna"
              value={form.make}
              onChange={(e) => set("make", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ac-model">Model</Label>
            <Input
              id="ac-model"
              placeholder="172"
              value={form.model}
              onChange={(e) => set("model", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ac-year">Year</Label>
            <Input
              id="ac-year"
              inputMode="numeric"
              placeholder="2004"
              value={form.year}
              onChange={(e) => set("year", e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ac-cat">Category &amp; class</Label>
          <Input
            id="ac-cat"
            placeholder="single-engine land"
            value={form.categoryClass}
            onChange={(e) => set("categoryClass", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ac-hobbs">Current Hobbs</Label>
            <Input
              id="ac-hobbs"
              inputMode="decimal"
              placeholder="0.0"
              value={form.hobbs}
              onChange={(e) => set("hobbs", e.target.value.replace(/[^0-9.]/g, ""))}
              className="tnum"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ac-tach">Current tach</Label>
            <Input
              id="ac-tach"
              inputMode="decimal"
              placeholder="0.0"
              value={form.tach}
              onChange={(e) => set("tach", e.target.value.replace(/[^0-9.]/g, ""))}
              className="tnum"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ac-rate">Rate (per hour)</Label>
            <MoneyInput
              key={rateKey}
              id="ac-rate"
              cents={form.rateCents}
              onCentsChange={(c) => set("rateCents", c)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ac-basis">Rate basis</Label>
            <Select
              value={form.rateBasis}
              onValueChange={(v) => set("rateBasis", v as "wet" | "dry")}
            >
              <SelectTrigger id="ac-basis" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wet">Wet (fuel included)</SelectItem>
                <SelectItem value="dry">Dry</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <div>
            <Label htmlFor="ac-bill" className="cursor-pointer">
              Bill by Hobbs time
            </Label>
            <p className="text-xs text-muted-foreground">
              {form.billByHobbs ? "Charging on Hobbs meter" : "Charging on tach time"}
            </p>
          </div>
          <Switch
            id="ac-bill"
            checked={form.billByHobbs}
            onCheckedChange={(v) => set("billByHobbs", v)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Home base</Label>
          <Combobox
            options={locationOptions}
            value={form.locationId}
            onChange={(v) => set("locationId", v)}
            placeholder="Select a location"
            searchPlaceholder="Search locations…"
            emptyText="No locations."
            disabled={noLocations}
          />
          {noLocations && (
            <p className="text-xs text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]">
              Add a home base location first — every aircraft needs one before it can be
              scheduled.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Add aircraft"}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
