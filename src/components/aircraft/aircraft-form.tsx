import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { useCreatePlane, useUpdateResource } from "@/features/queries";
import type { CreatePlaneResourceInput, Location, Resource } from "@/types/api";
import { fuelToDisplay, fuelToStored } from "@/components/aircraft/lib";
import { TailNumberField } from "@/components/aircraft/tail-number-field";
import type { RegistryMatch } from "@/features/queries";
import {
  AIRCRAFT_CATEGORIES,
  CLASSES_BY_CATEGORY,
  ENGINE_TYPES,
  FUEL_TYPES,
  GEAR_TYPES,
  METER_MODES,
  meterModeForCategory,
  label as vocabLabel,
  type AircraftCategory,
  type AircraftClass,
} from "@/components/aircraft/vocabulary";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Combobox, type ComboOption } from "@/components/combobox";
import { MoneyInput } from "@/components/money-input";
import { DocsHint } from "@/components/docs-hint";
import { PerPlanePricingNote } from "@/components/subscription/plan";
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
  serialNumber: string;
  make: string;
  model: string;
  year: string;
  category: AircraftCategory;
  aircraftClass: string;
  engineType: string;
  fuelType: string;
  gearType: string;
  seats: string;
  meterMode: string;
  hobbs: string;
  tach: string;
  fuelCapacity: string;
  fuelMeasurement: "gallons" | "liters";
  rateCents: number;
  rateBasis: "wet" | "dry";
  billByHobbs: boolean;
  locationId: string;
  /** "inherit" | preset key | custom handled via presets only for v1 */
  flyingDayKey: string;
};

/** Required fields, in focus order, mapped to their input ids for error focus. */
const REQUIRED_FIELDS = [
  { key: "tailNumber", id: "ac-tail" },
  { key: "make", id: "ac-make" },
  { key: "model", id: "ac-model" },
  { key: "year", id: "ac-year" },
  { key: "category", id: "ac-cat" },
  { key: "locationId", id: "" },
] as const;

/**
 * Upper-case the REGISTRATION only, not the whole field.
 *
 * This was `value.toUpperCase()`, which is right for "n12345" and wrong for every aircraft
 * that carries a nickname, because schools put it in this field: our own customer's fleet is
 * "N1906V (Lucy)", "N46132 (Ethel)", "N7226S (Bluey)". Editing anything on that aircraft
 * silently rewrote the name to "(LUCY)" the moment the tail box was touched.
 *
 * The registration is the first whitespace-delimited token; everything after it is left
 * exactly as typed.
 */
function upperRegistration(value: string): string {
  const at = value.indexOf(" ");
  if (at === -1) return value.toUpperCase();
  return value.slice(0, at).toUpperCase() + value.slice(at);
}

function emptyState(): FormState {
  return {
    tailNumber: "",
    serialNumber: "",
    make: "",
    model: "",
    year: "",
    category: "airplane",
    aircraftClass: "",
    engineType: "",
    fuelType: "",
    gearType: "",
    seats: "",
    meterMode: "hobbs_and_tach",
    hobbs: "",
    tach: "",
    fuelCapacity: "",
    fuelMeasurement: "gallons",
    rateCents: 0,
    rateBasis: "wet",
    billByHobbs: true,
    locationId: "",
    flyingDayKey: "inherit",
  };
}

function stateFromResource(r: Resource): FormState {
  const p = r.type?.plane;
  const cost = p?.cost;
  const basis: "wet" | "dry" = cost?.dryRate != null && cost.wetRate == null ? "dry" : "wet";
  return {
    tailNumber: p?.tailNumber ?? "",
    serialNumber: p?.serialNumber ?? "",
    make: p?.make ?? "",
    model: p?.model ?? "",
    year: p?.year ?? "",
    category: (p?.category ?? "airplane") as AircraftCategory,
    aircraftClass: p?.aircraftClass ?? "",
    engineType: p?.engineType ?? "",
    fuelType: p?.fuelType ?? "",
    gearType: p?.gearType ?? "",
    seats: p?.seats != null ? String(p.seats) : "",
    meterMode: p?.meterMode ?? "hobbs_and_tach",
    hobbs: p ? (p.hobbsTime / 10).toFixed(1) : "",
    tach: p ? (p.tachTime / 10).toFixed(1) : "",
    //Stored in hundredths, shown in whole units. See fuelToDisplay.
    fuelCapacity: p?.fuelCapacity != null ? String(fuelToDisplay(p.fuelCapacity)) : "",
    fuelMeasurement: p?.fuelMeasurement ?? "gallons",
    rateCents: (basis === "wet" ? cost?.wetRate : cost?.dryRate) ?? 0,
    rateBasis: basis,
    billByHobbs: cost?.billByHobbsTime ?? true,
    // Nested location relation, not FK_locationId (stripped by the server → always
    // undefined, which left the edit form's home base blank). /resources includes location.
    locationId: r.location?.id ? String(r.location.id) : "",
    flyingDayKey: planeFlyingDayKey(p?.flyingDayStartMinute, p?.flyingDayEndMinute),
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
  const navigate = useNavigate();
  const create = useCreatePlane();
  const update = useUpdateResource(resource?.id ?? 0);
  const pending = create.isPending || update.isPending;

  const [form, setForm] = React.useState<FormState>(emptyState);
  // MoneyInput keeps its own text state and only re-syncs across undefined⇄number.
  // Bump this key to remount it whenever we set the rate programmatically.
  const [rateKey, setRateKey] = React.useState(0);
  // Surfaced only after a submit attempt, so we don't nag on a pristine form.
  const [showErrors, setShowErrors] = React.useState(false);

  // Reset the form whenever the modal opens (fresh add, or prefilled edit).
  React.useEffect(() => {
    if (!open) return;
    setForm(resource ? stateFromResource(resource) : emptyState());
    setRateKey((k) => k + 1);
    setShowErrors(false);
  }, [open, resource]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /**
   * Fill in what the registry knows, and only that.
   *
   * Rate and fuel capacity are deliberately NOT filled: they are the school's numbers,
   * not the airframe's, and a plausible-looking wrong hourly rate is worse than an
   * empty one. Anything prefilled here stays editable, since the registry is a lookup
   * of record, not an authority on this particular aircraft.
   */
  function applyRegistryMatch(match: RegistryMatch) {
    setForm((f) => {
      const next = {
      ...f,
      tailNumber: match.tailNumber,
      make: match.make || f.make,
      model: match.model || f.model,
      year: match.year ? String(match.year) : f.year,
      //Everything the public registry actually knows. Fuel grade and tricycle-vs-tailwheel
      //are not in the federal file, so those stay for the person. `?? f.x` keeps anything
      //already typed rather than blanking it on a second lookup.
      category: (match.category as AircraftCategory) ?? f.category,
      //Keeping the old class blindly is how looking up a glider right after a helicopter
      //left "Glider + Helicopter" on the form, which the database would refuse on save.
      //Take the registry's class when it has one, otherwise keep the existing class only
      //if it still belongs to the incoming category.
      aircraftClass:
        match.aircraftClass ??
        ((CLASSES_BY_CATEGORY[(match.category as AircraftCategory) ?? f.category] ?? []).includes(
          f.aircraftClass as never
        )
          ? f.aircraftClass
          : ""),
      engineType: match.engineType ?? f.engineType,
      gearType: match.gearType ?? f.gearType,
      seats: match.seats != null ? String(match.seats) : f.seats,
      //A glider or a balloon has no meters, and that decides whether it is invoiced at
      //all, so it is worth getting right by default rather than leaving on Hobbs. Shares
      //`meterModeForCategory` with the category dropdown below, which is what stopped the
      //looked-up glider and the typed-in glider being saved differently.
      meterMode: meterModeForCategory(
        (match.category as AircraftCategory) ?? f.category,
        f.meterMode
      ),
      };
      return next;
    });
  }

  const locationOptions: ComboOption[] = locations.map((l) => ({
    value: String(l.id),
    label: l.name,
  }));
  const noLocations = locations.length === 0;

  const tail = form.tailNumber.trim();
  // Per-field validity, derived every render so inline messages clear as you type.
  /**
   * NO METERS MEANS NO NUMBERS TO ASK FOR AND NO RATE TO PROMISE.
   *
   * The form used to go on asking for a current Hobbs, a current tach, an hourly rate and
   * which meter to bill it on, all of them for an aircraft the pricing engine excludes
   * from invoicing entirely. The saved glider's fleet card then read "0.0 Hobbs, 0.0 tach,
   * $45.00 wet/Hobbs", which is three facts that are not true about it, and the rate in
   * particular is a promise the product does not keep: nothing ever charges it.
   *
   * The stored values are left alone rather than cleared, so switching the category back
   * restores a rate somebody typed months ago instead of losing it.
   */
  const meterless = form.meterMode === "none";

  const errors: Record<string, string> = {
    tailNumber: tail.length === 0 ? "Enter a tail number." : "",
    make: form.make.trim().length === 0 ? "Enter the make." : "",
    model: form.model.trim().length === 0 ? "Enter the model." : "",
    //Optional. The column is nullable and plenty of real aircraft have no year on file
    //(a customer with three of them could not save those records at all), so this only
    //objects to a year that was actually typed and is not four digits.
    year:
      form.year.trim().length === 0 || form.year.trim().length === 4
        ? ""
        : "Enter a 4-digit year.",
    category: form.category ? "" : "Choose a category.",
    aircraftClass:
      CLASSES_BY_CATEGORY[form.category]?.length && !form.aircraftClass
        ? "Choose a class."
        : "",
    //Optional. Fuel capacity has nothing to do with whether an aircraft can be put on
    //a schedule, and an instructor adding a club's aircraft often does not know it.
    //Requiring it turned "add the plane you fly" into a research task.
    fuelCapacity: "",
    locationId: !noLocations && !form.locationId ? "Select a home base." : "",
  };
  const firstInvalid = REQUIRED_FIELDS.find((f) => errors[f.key]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    // Instead of a silently-disabled button, tell the user exactly what's missing.
    if (noLocations || firstInvalid) {
      setShowErrors(true);
      if (firstInvalid?.id) document.getElementById(firstInvalid.id)?.focus();
      return;
    }

    // Meters are stored as integer deci-hours (server divides by 10 for billing).
    const hobbsTime = Math.round((Number(form.hobbs) || 0) * 10);
    const tachTime = Math.round((Number(form.tach) || 0) * 10);
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
              serialNumber: form.serialNumber.trim(),
              make: form.make.trim() || null,
              model: form.model.trim() || null,
              year: form.year.trim(),
              category: form.category,
              aircraftClass: (form.aircraftClass || null) as AircraftClass | null,
              engineType: form.engineType || null,
              fuelType: form.fuelType || null,
              gearType: form.gearType || null,
              seats: form.seats ? Number(form.seats) : null,
              meterMode: form.meterMode,
              hobbsTime,
              tachTime,
              fuelCapacity: fuelToStored(Number(form.fuelCapacity) || 0),
              fuelMeasurement: form.fuelMeasurement,
              ...flyingDayPayload(form.flyingDayKey),
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
          year: form.year.trim(),
          category: form.category,
          aircraftClass: (form.aircraftClass || null) as AircraftClass | null,
          engineType: form.engineType || null,
          fuelType: form.fuelType || null,
          gearType: form.gearType || null,
          seats: form.seats ? Number(form.seats) : null,
          meterMode: form.meterMode,
          hobbsTime,
          tachTime,
          fuelCapacity: fuelToStored(Number(form.fuelCapacity) || 0),
          fuelMeasurement: form.fuelMeasurement,
          ...flyingDayPayload(form.flyingDayKey),
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
      footer={
        <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit"
                form="modal-aircraft-form" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add aircraft"}
            </Button>
        </div>
      }
      open={open}
      onOpenChange={onOpenChange}
      className="sm:max-w-lg"
      title={isEdit ? `Edit ${resource?.type?.plane?.tailNumber ?? "aircraft"}` : "Add aircraft"}
      description={
        isEdit
          ? "Update this aircraft's details, times, and rate."
          : "Add a tail to your fleet so it can be scheduled and billed."
      }
    >
      {/* autoComplete off for the whole form. None of these are personal details the
          browser could usefully know, and on the one field that is legitimately blank
          Chrome was proposing a year out of its saved addresses ("2004"). A wrong year
          silently saved onto an aircraft is worse than an empty one, and now that the
          field is optional there is nothing forcing the user to look at it. */}
      <form id="modal-aircraft-form"
        data-doc-shot="aircraft-rate-fields"
        onSubmit={handleSubmit}
        className="space-y-4"
        autoComplete="off"
      >
        <div className="space-y-1.5">
          <div className="space-y-1.5">
            <Label htmlFor="ac-tail">Tail number</Label>
            <TailNumberField
              id="ac-tail"
              autoFocus
              placeholder="Tail number"
              value={form.tailNumber}
              onChange={(v) => set("tailNumber", upperRegistration(v))}
              onPick={applyRegistryMatch}
              invalid={showErrors && !!errors.tailNumber}
            />
            {showErrors && errors.tailNumber && (
              <p className="text-xs text-destructive">{errors.tailNumber}</p>
            )}
          </div>
        </div>

        {/* NEXT TO THE TAIL NUMBER on purpose, because people confuse the two and the FAA does
            not. A tail number can be changed by the owner in an afternoon; the serial number is
            on the data plate and is how an Airworthiness Directive says which aeroplanes it
            applies to. Optional: a school will not walk out to eleven aircraft before it can
            add its first one. */}
        <div className="space-y-1.5">
          <Label htmlFor="ac-serial" className="inline-flex items-center gap-1.5">
            Serial number
            <DocsHint topic="aircraft-serial-number" />
          </Label>
          <Input
            id="ac-serial"
            placeholder="17271234"
            value={form.serialNumber}
            onChange={(e) => set("serialNumber", e.target.value)}
            autoCorrect="off"
            spellCheck={false}
            maxLength={40}
          />
          <p className="text-xs text-muted-foreground">
            From the data plate, not the registration. Optional, and it is what lets us tell
            whether an Airworthiness Directive applies to this aeroplane.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ac-make">Make</Label>
            <Input
              id="ac-make"
              placeholder="Cessna"
              value={form.make}
              onChange={(e) => set("make", e.target.value)}
              aria-invalid={showErrors && !!errors.make}
            />
            {showErrors && errors.make && (
              <p className="text-xs text-destructive">{errors.make}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ac-model">Model</Label>
            <Input
              id="ac-model"
              placeholder="172"
              value={form.model}
              onChange={(e) => set("model", e.target.value)}
              aria-invalid={showErrors && !!errors.model}
            />
            {showErrors && errors.model && (
              <p className="text-xs text-destructive">{errors.model}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ac-year">Year (optional)</Label>
            <Input
              id="ac-year"
              inputMode="numeric"
              //Chrome ignores autoComplete="off" on a form for fields it thinks it knows;
              //a value it does not recognise gets it to leave this one alone.
              autoComplete="chrome-off"
              placeholder="2004"
              value={form.year}
              onChange={(e) => set("year", e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
              aria-invalid={showErrors && !!errors.year}
            />
            {showErrors && errors.year && (
              <p className="text-xs text-destructive">{errors.year}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="ac-cat">Category</Label>
              <DocsHint topic="aircraft-category-class" />
            </div>
            <Select
              value={form.category}
              onValueChange={(v) => {
                //Drop the class only when it does not belong to the new category.
                //"helicopter" is not a class of airplane and the database refuses that
                //pair, but clearing UNCONDITIONALLY also wiped the class the tail lookup
                //had just filled in, because this fires on a programmatic change too.
                setForm((f) => {
                  const next = v as AircraftCategory;
                  const allowed: string[] = CLASSES_BY_CATEGORY[next] ?? [];
                  return {
                    ...f,
                    category: next,
                    aircraftClass: allowed.includes(f.aircraftClass) ? f.aircraftClass : "",
                    //METERS FOLLOW THE CATEGORY, and this is the branch that actually
                    //matters. The tail-number lookup already did this, so a glider found
                    //in the registry came out right, but a glider TYPED IN did not, and
                    //typing it in is the ordinary case: the registry is US-only, and a
                    //club with a European sailplane or a trailer full of them fills this
                    //form by hand every time. They then saved an airframe claiming a Hobbs
                    //and a tach, which is the whole "asked for a reading that does not
                    //exist" problem, one screen upstream of where it gets reported.
                    //
                    //Symmetrical on the way back: choosing a powered category restores the
                    //default rather than leaving "none" behind on an aeroplane that has
                    //meters, which would silently stop invoicing it.
                    meterMode: meterModeForCategory(next, f.meterMode),
                  };
                });
              }}
            >
              <SelectTrigger id="ac-cat" className="w-full" aria-invalid={showErrors && !!errors.category}>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {AIRCRAFT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {vocabLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Always rendered, disabled when the category has no class rating (a glider,
              a powered lift). Conditional rendering was worse in two ways: the layout
              jumped as you changed category, and a Select that MOUNTS in the same commit
              that sets its value came up empty, so a helicopter looked up by tail arrived
              with its class silently blank. */}
          <div className="space-y-1.5">
            <Label htmlFor="ac-class">Class</Label>
            <Select
              value={form.aircraftClass || undefined}
              //Ignore anything that is not a real class of the current category. When the
              //category changes, the previously selected item unmounts and Radix emits a
              //RESET through this handler, which was silently wiping the class the tail
              //lookup had just filled in: state said "" while the pick said "helicopter".
              //Only a genuine user choice gets through.
              onValueChange={(v) => {
                if (v && (CLASSES_BY_CATEGORY[form.category] ?? []).includes(v as never)) {
                  set("aircraftClass", v);
                }
              }}
              disabled={!CLASSES_BY_CATEGORY[form.category]?.length}
            >
              <SelectTrigger id="ac-class" className="w-full" aria-invalid={showErrors && !!errors.aircraftClass}>
                {/* The label is rendered here rather than left to Radix to resolve.
                    When the tail lookup sets the value and swaps the item list in the
                    SAME commit (airplane's classes out, rotorcraft's in), Radix cannot
                    match the new value to an item and falls back to the placeholder, so
                    a looked-up helicopter showed "Select class" while the form state
                    said `helicopter`. Passing children removes the lookup entirely. */}
                <SelectValue
                  placeholder={
                    CLASSES_BY_CATEGORY[form.category]?.length
                      ? "Select class"
                      : "Not applicable"
                  }
                >
                  {form.aircraftClass ? vocabLabel(form.aircraftClass) : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(CLASSES_BY_CATEGORY[form.category] ?? []).map((c) => (
                  <SelectItem key={c} value={c}>
                    {vocabLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showErrors && errors.aircraftClass && (
              <p className="text-xs text-destructive">{errors.aircraftClass}</p>
            )}
          </div>
        </div>


        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ac-engine">Engine (optional)</Label>
            <Select value={form.engineType || undefined} onValueChange={(v) => set("engineType", v)}>
              <SelectTrigger id="ac-engine" className="w-full">
                <SelectValue placeholder="Engine" />
              </SelectTrigger>
              <SelectContent>
                {ENGINE_TYPES.map((c) => (
                  <SelectItem key={c} value={c}>{vocabLabel(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ac-fuel-type">Fuel (optional)</Label>
            <Select value={form.fuelType || undefined} onValueChange={(v) => set("fuelType", v)}>
              <SelectTrigger id="ac-fuel-type" className="w-full">
                <SelectValue placeholder="Fuel" />
              </SelectTrigger>
              <SelectContent>
                {FUEL_TYPES.map((c) => (
                  <SelectItem key={c} value={c}>{vocabLabel(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ac-gear">Gear (optional)</Label>
            <Select value={form.gearType || undefined} onValueChange={(v) => set("gearType", v)}>
              <SelectTrigger id="ac-gear" className="w-full">
                <SelectValue placeholder="Gear" />
              </SelectTrigger>
              <SelectContent>
                {GEAR_TYPES.map((c) => (
                  <SelectItem key={c} value={c}>{vocabLabel(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ac-seats">Seats (optional)</Label>
            <Input
              id="ac-seats"
              inputMode="numeric"
              placeholder="4"
              value={form.seats}
              onChange={(e) => set("seats", e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
              className="tnum"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="ac-meters">Meters</Label>
              <DocsHint topic="aircraft-meters" />
            </div>
            <Select value={form.meterMode} onValueChange={(v) => set("meterMode", v)}>
              <SelectTrigger id="ac-meters" className="w-full">
                <SelectValue placeholder="Meters" />
              </SelectTrigger>
              <SelectContent>
                {METER_MODES.map((c) => (
                  <SelectItem key={c} value={c}>{vocabLabel(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {meterless && (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            This aircraft has no meters, so its flights are not invoiced automatically. It
            books, dispatches and closes out exactly like any other tail, and the times it
            went out and came back are recorded. Raise the charges yourself from Billing.
          </p>
        )}

        {!meterless && (
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
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ac-fuel">Fuel capacity (optional)</Label>
            <Input
              id="ac-fuel"
              inputMode="decimal"
              placeholder="56"
              value={form.fuelCapacity}
              onChange={(e) => set("fuelCapacity", e.target.value.replace(/[^0-9.]/g, ""))}
              className="tnum"
              aria-invalid={showErrors && !!errors.fuelCapacity}
            />
            {showErrors && errors.fuelCapacity && (
              <p className="text-xs text-destructive">{errors.fuelCapacity}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ac-fuel-unit">Fuel unit</Label>
            <Select
              value={form.fuelMeasurement}
              onValueChange={(v) => set("fuelMeasurement", v as "gallons" | "liters")}
            >
              <SelectTrigger id="ac-fuel-unit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gallons">Gallons</SelectItem>
                <SelectItem value="liters">Liters</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {!meterless && (
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
            <div className="flex items-center gap-1.5">
              <Label htmlFor="ac-basis">Rate basis</Label>
              <DocsHint topic="rate-basis" />
            </div>
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
        )}

        {!meterless && (
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
        )}

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="ac-flying-day">Flying day</Label>
            <DocsHint topic="flying-day-hours" />
          </div>
          <Select
            value={form.flyingDayKey}
            onValueChange={(v) => set("flyingDayKey", v)}
          >
            <SelectTrigger id="ac-flying-day" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">Use school hours</SelectItem>
              {PLANE_FLYING_DAY_OPTIONS.map((o) => (
                <SelectItem key={o.key} value={o.key}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Override when this aircraft can be booked. Leave as school hours unless this
            tail really runs a different day.
          </p>
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
          {showErrors && errors.locationId && (
            <p className="text-xs text-destructive">{errors.locationId}</p>
          )}
          {noLocations && (
            // A dead end used to end here: every aircraft needs a home base, the console
            // had no way to create one, and the sentence naming the problem was the whole
            // response. The link is the fix, and it opens the form rather than dropping
            // the user on a page to go hunting.
            <div className="space-y-1.5">
              <p className="text-xs text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]">
                Every aircraft needs a home base, and this school has no location yet.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  void navigate({
                    to: "/facilities",
                    search: { tab: "locations", add: "location" },
                  });
                }}
              >
                <MapPin className="size-4" /> Add a location
              </Button>
            </div>
          )}
        </div>

        {!isEdit && <PerPlanePricingNote className="pt-1" />}

      </form>
    </ResponsiveModal>
  );
}

const PLANE_FLYING_DAY_OPTIONS = [
  { key: "6-22", label: "6:00 AM to 10:00 PM", start: 6 * 60, end: 22 * 60 },
  { key: "7-19", label: "7:00 AM to 7:00 PM", start: 7 * 60, end: 19 * 60 },
  { key: "8-18", label: "8:00 AM to 6:00 PM", start: 8 * 60, end: 18 * 60 },
  { key: "5-23", label: "5:00 AM to 11:00 PM", start: 5 * 60, end: 23 * 60 },
  { key: "24h", label: "24 hours", start: 0, end: 0 },
] as const;

function planeFlyingDayKey(
  start: number | null | undefined,
  end: number | null | undefined
): string {
  if (start == null || end == null) return "inherit";
  const match = PLANE_FLYING_DAY_OPTIONS.find((o) => o.start === start && o.end === end);
  return match?.key ?? "inherit";
}

function flyingDayPayload(key: string): {
  flyingDayStartMinute: number | null;
  flyingDayEndMinute: number | null;
} {
  if (key === "inherit") {
    return { flyingDayStartMinute: null, flyingDayEndMinute: null };
  }
  const opt = PLANE_FLYING_DAY_OPTIONS.find((o) => o.key === key);
  if (!opt) return { flyingDayStartMinute: null, flyingDayEndMinute: null };
  return { flyingDayStartMinute: opt.start, flyingDayEndMinute: opt.end };
}
