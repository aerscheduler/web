import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { Armchair, CircleDot, Cog, Droplets, Fuel, Gauge, MapPin, Sun, Timer } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { OwnerField, ownerDraftError, type OwnerConflict, type OwnerDraft } from "@/components/aircraft/aircraft-owner-field";
import { useCreatePlane, useUpdateResource } from "@/features/queries";
import type { AircraftUse, CreatePlaneResourceInput, Location, Resource } from "@/types/api";
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
import { ChipMenu, InputChip } from "@/components/property-chips";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** "Not recorded" in a chip's menu: an optional fact left empty. */
const NONE = "none";

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
  /**
   * Whose aeroplane this is. `shop` means a customer brought it in: it takes maintenance
   * and nothing else, and it is not counted toward the per-aircraft price.
   */
  use: AircraftUse;
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
  // Validated and rendered since gliders arrived, but left out of this list, so a form whose
  // only fault was the class fell through the guard and posted an aircraft with no class.
  { key: "aircraftClass", id: "ac-class" },
  // This was `id: ""`, which is falsy, so the focus call below was skipped for the one field
  // that needed it most: last in a form twice the height of its own dialog.
  { key: "locationId", id: "ac-location" },
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
    use: "fleet",
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
    use: r.use ?? "fleet",
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
  focus = "tailNumber",
  defaultUse = "fleet",
  defaultTail,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A new aircraft's tail, typed already where the form was opened from (a search). */
  defaultTail?: string;
  /** A new aircraft was added: opened from another form (a work order), which picks it. */
  onCreated?: (resource: Resource) => void;
  resource?: Resource | null;
  locations: Location[];
  /**
   * What a NEW aircraft starts as. The page passes `shop` when the person is looking at
   * the shop list, because that is plainly what they are adding.
   */
  defaultUse?: AircraftUse;
  /**
   * WHICH FIELD THE FORM OPENS ON.
   *
   * Default is the tail number, which is right when the form is opened to add an aircraft or
   * to edit it in general. AD settings opens it for exactly one field, and landing on the tail
   * number there meant scrolling past nine groups to reach the thing the row promised, with
   * the registry lookup popping open over the form on the way. Naming the field instead of
   * hard-coding a scroll keeps that decision with the caller.
   */
  focus?: "tailNumber" | "serialNumber";
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
  // A customer's aircraft: who owns it, and, when the new person's address turned out to be
  // somebody's already, the aircraft that was added while that question is answered.
  const qc = useQueryClient();
  const [owner, setOwner] = React.useState<OwnerDraft>({ mode: "none" });
  const [ownerConflict, setOwnerConflict] = React.useState<Omit<OwnerConflict, "onUse" | "onAddAnyway" | "pending"> | null>(null);
  const [addedAwaitingOwner, setAddedAwaitingOwner] = React.useState<Resource | null>(null);
  const [ownerPending, setOwnerPending] = React.useState(false);
  // A customer's aircraft says which meters it has, asked rather than assumed: "Hobbs and tach"
  // by default had Murray typing Hobbs 0.0 on a Husky and a 1963 Cherokee that have only a tach.
  const [metersChosen, setMetersChosen] = React.useState(false);

  // Reset the form whenever the modal opens (fresh add, or prefilled edit).
  React.useEffect(() => {
    if (!open) return;
    setForm(
      resource
        ? stateFromResource(resource)
        : {
            ...emptyState(),
            use: defaultUse,
            ...(defaultTail ? { tailNumber: defaultTail.toUpperCase() } : {}),
            // One place to keep it: nothing to choose, so it is chosen.
            ...(locations.length === 1 ? { locationId: String(locations[0].id) } : {}),
          }
    );
    setRateKey((k) => k + 1);
    setShowErrors(false);
    setOwner({ mode: "none" });
    setOwnerConflict(null);
    setAddedAwaitingOwner(null);
    setMetersChosen(!!resource);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resource, defaultUse]);

  /**
   * Put the caret on the field the caller asked for, instead of the first one in the form.
   *
   * This hangs off Radix's own open-autofocus event rather than a timer. A timer raced Radix,
   * and lost exactly half the time: the first open of a freshly mounted dialog focused the
   * serial number correctly, and the second open of the same one landed back on the tail
   * number with the serial below the fold, because the reused content node focuses itself on a
   * different tick. Preventing the default and choosing the element is the supported way.
   */
  const handleOpenAutoFocus = React.useCallback(
    (event: Event) => {
      if (focus !== "serialNumber") return;
      const el = document.getElementById("ac-serial");
      if (!(el instanceof HTMLInputElement)) return;
      event.preventDefault();
      el.focus({ preventScroll: true });
      //`preventScroll` above, then centre it deliberately: focusing alone leaves the field
      //at the very bottom edge of the scrolling body, which reads as "nothing happened".
      el.scrollIntoView({ block: "center" });
    },
    [focus]
  );

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
      //An airframe fact like the make and the model below, stamped on the plate at the
      //factory, so it prefills with them instead of being held back with the rate and the
      //fuel capacity: nobody at the school chooses it, and the file already knows it, so
      //asking for it again is asking somebody to walk out to the aeroplane for nothing.
      //`||` and not `??`, the same as the two lines below it. A row with no serial arrives as
      //null, since the import NULLIFs the blank column, so what this has to guarantee is only
      //that a missing serial keeps whatever was already read off the plate.
      serialNumber: match.serialNumber || f.serialNumber,
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
  /**
   * A customer's aircraft in the shop has no rate, because nobody rents it: the school is
   * working on it, and the work is billed on the invoice, not by the hour on the plane. So
   * the pricing fields are hidden rather than asked for and ignored.
   */
  const isShop = form.use === "shop";
  const hidePricing = meterless || isShop;

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
  const ownerErr = !isEdit && isShop ? ownerDraftError(owner) : {};
  const ownerInvalid = !!(ownerErr.name || ownerErr.email);
  const metersUnasked = !isEdit && isShop && !metersChosen && form.meterMode !== "none";

  /** The aircraft is added; it is done once its owner is on it (or left off on purpose). */
  function finish(created: Resource, ownerName?: string) {
    toast.success(
      `${created.type?.plane?.tailNumber ?? tail} added to the ${form.use === "shop" ? "shop" : "fleet"}${ownerName ? `, owned by ${ownerName}` : ""}`
    );
    void qc.invalidateQueries({ queryKey: ["resources"] });
    void qc.invalidateQueries({ queryKey: ["members"] });
    onOpenChange(false);
    onCreated?.(created);
  }

  async function addOwner(created: Resource, extra: { orgUserId?: number; createAnyway?: boolean } = {}) {
    if (owner.mode === "none") return finish(created);
    setOwnerPending(true);
    const body =
      owner.mode === "existing" || extra.orgUserId
        ? { orgUserId: extra.orgUserId ?? (owner.mode === "existing" ? owner.orgUserId : undefined), isPrimary: true }
        : { name: owner.name.trim(), email: owner.email.trim() || undefined, phone: owner.phone.trim() || undefined, isPrimary: true, ...(extra.createAnyway ? { createAnyway: true } : {}) };
    try {
      await api(`/resources/${created.id}/owners`, { method: "POST", body });
      finish(created, extra.orgUserId ? ownerConflict?.conflict.name : owner.mode === "existing" ? owner.name : owner.mode === "new" ? owner.name.trim() : undefined);
    } catch (err) {
      // A 409 is a question, as on the Owners panel: that address is somebody's already.
      const conflictBody = err instanceof ApiError && err.status === 409 ? (err.body as { message?: string; conflict?: OwnerConflict["conflict"] } | undefined) : undefined;
      if (conflictBody?.conflict) {
        setAddedAwaitingOwner(created);
        setOwnerConflict({ message: conflictBody.message ?? (err as Error).message, conflict: conflictBody.conflict });
      } else {
        toast.error(`${created.type?.plane?.tailNumber ?? tail} is added, but its owner was not: ${err instanceof Error ? err.message : "add them on its Owners panel"}`);
        finish(created);
      }
    } finally {
      setOwnerPending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || ownerPending) return;
    // Added already. With the owner's question still open, Save means "without an owner"; once
    // the owner was changed after it (a typo fixed, somebody picked), Save adds that owner.
    if (addedAwaitingOwner) {
      if (ownerConflict || owner.mode === "none") return finish(addedAwaitingOwner);
      if (ownerInvalid) return setShowErrors(true);
      return void addOwner(addedAwaitingOwner);
    }
    // Instead of a silently-disabled button, tell the user exactly what's missing.
    if (noLocations || firstInvalid || ownerInvalid || metersUnasked) {
      setShowErrors(true);
      if (metersUnasked && !firstInvalid && !ownerInvalid) document.getElementById("ac-meters")?.focus();
      // A school with no location yet has nothing to mark invalid, so lib/form-focus.ts
      // cannot help and this would be a silent button again. Take them to the dead end
      // and its "add a location" button instead.
      if (noLocations && !firstInvalid) {
        document
          .getElementById("ac-home-base")
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      return;
    }

    // Meters are stored as integer deci-hours (server divides by 10 for billing).
    const hobbsTime = Math.round((Number(form.hobbs) || 0) * 10);
    const tachTime = Math.round((Number(form.tach) || 0) * 10);
    //A customer's aircraft has no rate at all, rather than a rate of zero. Sending a
    //hidden `wetRate: 0` is what printed "$0.00 wet/Hobbs" next to somebody else's
    //registration on the list; the server no longer asks for one.
    const cost = isShop
      ? undefined
      : {
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
      use: form.use,
      type: {
        plane: {
          tailNumber: tail,
          //Was dropped here while the edit path sent it, so a serial typed into the ADD form
          //saved as blank and the aeroplane arrived in the AD readiness panel as "model only".
          //Silent: the field kept what you typed until the modal closed.
          serialNumber: form.serialNumber.trim() || undefined,
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
      onSuccess: (created) => void addOwner(created),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Couldn't add aircraft"),
    });
  }

  return (
    <ResponsiveModal
      onOpenAutoFocus={handleOpenAutoFocus}
      footer={
        <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit"
                form="modal-aircraft-form" disabled={pending}>
              {pending || ownerPending
                ? "Saving…"
                : addedAwaitingOwner
                  ? ownerConflict || owner.mode === "none"
                    ? "Done, without an owner"
                    : "Add the owner"
                  : isEdit
                    ? "Save changes"
                    : "Add aircraft"}
            </Button>
        </div>
      }
      open={open}
      onOpenChange={onOpenChange}
      className="sm:max-w-lg"
      //The title carries which kind this is, because the form no longer asks. Without it,
      //the only difference between the two is a line of description nobody reads.
      title={
        isEdit
          ? `Edit ${resource?.type?.plane?.tailNumber ?? "aircraft"}`
          : isShop
            ? "Add a customer's aircraft"
            : "Add aircraft"
      }
      description={
        isEdit
          ? "Update this aircraft's details, times, and rate."
          : isShop
            ? "Record a customer's aircraft so you can track its inspections and bill the work. It cannot be scheduled to fly."
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
        {/* NO TOGGLE HERE ANY MORE. Which kind of aeroplane this is comes from where you
            clicked: "Add aircraft" on the Aircraft page adds one of the school's own, and
            "A customer's aircraft" in the menu beside it adds one you are only looking
            after. Asking again, at the top of the form, put a question in front of every
            school for a thing almost none of them do, and made the rare case look like the
            main one. The dialog's own description says which you are adding. */}
        <div className="space-y-1.5">
          <div className="space-y-1.5">
            <Label htmlFor="ac-tail">Tail number</Label>
            <TailNumberField
              id="ac-tail"
              autoFocus={focus === "tailNumber"}
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

        {!hidePricing && (
          <div className="space-y-1.5">
            <Label htmlFor="ac-rate">Rate per hour</Label>
            <div className="w-48">
              <MoneyInput
                key={rateKey}
                id="ac-rate"
                cents={form.rateCents}
                onCentsChange={(c) => set("rateCents", c)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {form.rateBasis === "wet" ? "Wet, fuel included" : "Dry, fuel extra"}, charged on {form.billByHobbs ? "Hobbs" : "tach"} time. Change either below.
            </p>
          </div>
        )}

        {/* NEAR THE BOTTOM on purpose. This form is the one a school has to get through before
            anything can be scheduled or billed, so the fields that decide those come first and
            the airframe's paperwork comes after them. The serial number is not the tail number,
            whatever the two look like side by side: a tail number can be changed by the owner in
            an afternoon, while the serial is on the data plate and is how an Airworthiness
            Directive says which aeroplanes it applies to. Optional, and labelled so, because a
            school will not walk out to eleven aircraft before it can add its first one. */}
        <div className="space-y-1.5">
          <Label htmlFor="ac-serial" className="inline-flex items-center gap-1.5">
            Serial number (optional)
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
          {/* Where the number lives, not an errand to go and read it: the tail-number lookup
              has often filled this in already. */}
          <p className="text-xs text-muted-foreground">
            On the data plate, not the tail number. It is what lets us tell whether an
            Airworthiness Directive applies to this aeroplane.
          </p>
        </div>

        <div className="space-y-1.5" id="ac-home-base">
          <Label htmlFor="ac-location">Home base</Label>
          <Combobox
            id="ac-location"
            options={locationOptions}
            value={form.locationId}
            onChange={(v) => set("locationId", v)}
            placeholder="Select a location"
            searchPlaceholder="Search locations…"
            emptyText="No locations."
            disabled={noLocations}
            invalid={showErrors && !!errors.locationId}
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
                Every aircraft needs a home base, and this organization has no location yet.
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

        {/* A customer's aeroplane is somebody's: who is billed for the work goes in with it, so
            the first job on it has somebody to invoice (Tony, 2026-09-30). Optional, because the
            desk does not always know on the first call; more owners go on the aircraft's page. */}
        {!isEdit && isShop && (
          <OwnerField
            value={owner}
            onChange={(o) => {
              setOwner(o);
              setOwnerConflict(null);
            }}
            showErrors={showErrors}
            conflict={
              ownerConflict && addedAwaitingOwner
                ? {
                    ...ownerConflict,
                    pending: ownerPending,
                    onUse: () => void addOwner(addedAwaitingOwner, { orgUserId: ownerConflict.conflict.orgUserId }),
                    onAddAnyway: () => void addOwner(addedAwaitingOwner, { createAnyway: true }),
                  }
                : null
            }
          />
        )}

        {/* The rest as chips: each has a sensible default and is usually left alone, so it is
            one click away rather than a labelled field in everyone's way (Tony, 2026-10-01). */}
        <div className="flex flex-wrap gap-2 border-t border-border pt-4" role="group" aria-label="More about the aircraft">
          <ChipMenu
            id="ac-meters"
            name="Meters"
            leading={<Gauge className="size-3.5" />}
            label={metersUnasked ? "Which meters?" : vocabLabel(form.meterMode)}
            set={!metersUnasked}
            value={form.meterMode}
            onChange={(v) => {
              setMetersChosen(true);
              set("meterMode", v);
            }}
            options={METER_MODES.map((c) => ({ value: c, label: vocabLabel(c) }))}
          />
          <ChipMenu
            id="ac-engine"
            name="Engine"
            leading={<Cog className="size-3.5" />}
            label={form.engineType ? vocabLabel(form.engineType) : "Engine"}
            set={!!form.engineType}
            value={form.engineType || NONE}
            onChange={(v) => set("engineType", v === NONE ? "" : v)}
            options={[{ value: NONE, label: "Not recorded" }, ...ENGINE_TYPES.map((c) => ({ value: c, label: vocabLabel(c) }))]}
          />
          <ChipMenu
            id="ac-fuel-type"
            name="Fuel"
            leading={<Fuel className="size-3.5" />}
            label={form.fuelType ? vocabLabel(form.fuelType) : "Fuel"}
            set={!!form.fuelType}
            value={form.fuelType || NONE}
            onChange={(v) => set("fuelType", v === NONE ? "" : v)}
            options={[{ value: NONE, label: "Not recorded" }, ...FUEL_TYPES.map((c) => ({ value: c, label: vocabLabel(c) }))]}
          />
          <ChipMenu
            id="ac-gear"
            name="Gear"
            leading={<CircleDot className="size-3.5" />}
            label={form.gearType ? vocabLabel(form.gearType) : "Gear"}
            set={!!form.gearType}
            value={form.gearType || NONE}
            onChange={(v) => set("gearType", v === NONE ? "" : v)}
            options={[{ value: NONE, label: "Not recorded" }, ...GEAR_TYPES.map((c) => ({ value: c, label: vocabLabel(c) }))]}
          />
          <InputChip
            id="ac-seats"
            name="Seats"
            leading={<Armchair className="size-3.5" />}
            label={form.seats ? `${form.seats} seats` : "Seats"}
            set={!!form.seats}
            value={form.seats}
            onChange={(v) => set("seats", v.replace(/[^0-9]/g, "").slice(0, 2))}
            placeholder="4"
            inputMode="numeric"
          />
          <InputChip
            id="ac-fuel"
            name="Fuel capacity"
            leading={<Fuel className="size-3.5" />}
            label={form.fuelCapacity ? `${form.fuelCapacity} ${form.fuelMeasurement === "liters" ? "L" : "gal"}` : "Fuel capacity"}
            set={!!form.fuelCapacity}
            value={form.fuelCapacity}
            onChange={(v) => set("fuelCapacity", v.replace(/[^0-9.]/g, ""))}
            placeholder="56"
            inputMode="decimal"
            suffix={
              <Select value={form.fuelMeasurement} onValueChange={(v) => set("fuelMeasurement", v as "gallons" | "liters")}>
                <SelectTrigger id="ac-fuel-unit" className="w-28" aria-label="Fuel unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gallons">Gallons</SelectItem>
                  <SelectItem value="liters">Liters</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          {!isShop && (
            // Not on a customer's aircraft: "when can this be booked" is a question about an
            // aeroplane that can be booked.
            <ChipMenu
              id="ac-flying-day"
              name="Flying day"
              leading={<Sun className="size-3.5" />}
              label={form.flyingDayKey === "inherit" ? "Organization hours" : (PLANE_FLYING_DAY_OPTIONS.find((o) => o.key === form.flyingDayKey)?.label ?? "Flying day")}
              set={form.flyingDayKey !== "inherit"}
              value={form.flyingDayKey}
              onChange={(v) => set("flyingDayKey", v)}
              options={[
                { value: "inherit", label: "Organization hours", hint: "Leave this unless the tail really runs a different day." },
                ...PLANE_FLYING_DAY_OPTIONS.map((o) => ({ value: o.key, label: o.label })),
              ]}
            />
          )}
          {!hidePricing && (
            <>
              <ChipMenu
                id="ac-basis"
                name="Rate basis"
                leading={<Droplets className="size-3.5" />}
                label={form.rateBasis === "wet" ? "Wet rate" : "Dry rate"}
                set
                value={form.rateBasis}
                onChange={(v) => set("rateBasis", v as "wet" | "dry")}
                options={[
                  { value: "wet", label: "Wet rate", hint: "Fuel included in the hourly rate." },
                  { value: "dry", label: "Dry rate", hint: "Fuel charged separately." },
                ]}
              />
              <ChipMenu
                id="ac-bill"
                name="Billed on"
                leading={<Timer className="size-3.5" />}
                label={form.billByHobbs ? "Billed on Hobbs" : "Billed on tach"}
                set
                value={form.billByHobbs ? "hobbs" : "tach"}
                onChange={(v) => set("billByHobbs", v === "hobbs")}
                options={[
                  { value: "hobbs", label: "Billed on Hobbs" },
                  { value: "tach", label: "Billed on tach" },
                ]}
              />
            </>
          )}
        </div>
        {showErrors && metersUnasked && (
          <p className="-mt-2 text-xs text-destructive" role="alert">
            Which meters does it have? Many older aircraft have only a tach.
          </p>
        )}

        {!isEdit && !isShop && <PerPlanePricingNote className="pt-1" />}

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
