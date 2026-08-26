import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateLocation,
  useLocation,
  useUpdateLocation,
} from "@/features/queries";
import type { AirportMatch, Location } from "@/types/api";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { COMMON_TIME_ZONES, allTimeZones, describeZone } from "@/lib/timezone";
import { ResponsiveModal } from "@/components/responsive-modal";
import { AirportField, countryName, subdivisionOf } from "@/components/facilities/airport-field";
import { Combobox, type ComboOption } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Falling back to the org's zone is a real choice, so it is an option and not an absence. */
const INHERIT_ZONE = "";

/** Common zones first, then everything else. 400+ names is correct and unusable unsorted. */
function zoneOptions(orgZone: string | null): ComboOption[] {
  const inherit: ComboOption = {
    value: INHERIT_ZONE,
    label: orgZone ? `Same as the school (${describeZone(orgZone)})` : "Same as the school",
  };
  const common = COMMON_TIME_ZONES.map((z) => ({ value: z.value, label: z.label }));
  const seen = new Set(common.map((c) => c.value));
  const rest = allTimeZones()
    .filter((z) => !seen.has(z))
    .map((z) => ({ value: z, label: z.replace(/_/g, " ") }));
  return [inherit, ...common, ...rest];
}

type FormState = {
  name: string;
  streetAddress1: string;
  streetAddress2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  timeZone: string;
  /**
   * Set only by picking an airport from the lookup, never by typing. The server stopped
   * geocoding in August 2026, so this is now the only way a location gets a position, and
   * a hand-typed site simply has none, exactly as every onboarded org already did.
   */
  coordinates: { lat: number; lng: number } | null;
};

/**
 * Required fields, in focus order, mapped to their input ids for error focus.
 *
 * ONLY THE NAME. The street, city, state, ZIP and country used to be required here, and
 * that was never a real requirement: the server has no validation on this endpoint at all,
 * and the only thing that ever rejected a location was Google's geocoder failing to
 * resolve the address. That gate was measured in August 2026 and it caught almost
 * nothing (a made-up ZIP sailed through; so did a made-up street), so it was removed
 * along with the geocoder.
 *
 * Which leaves no reason to make someone hunt down a street address for a field they have
 * already identified by name. The address boxes stay, because a school with a hangar suite
 * wants to record it, but they are optional and stored exactly as entered.
 */
const REQUIRED_FIELDS = [{ key: "name", id: "loc-name" }] as const;

function emptyState(): FormState {
  return {
    name: "",
    streetAddress1: "",
    streetAddress2: "",
    city: "",
    state: "",
    zipCode: "",
    // Most schools on the platform today are US-based, so this is a sensible default
    // rather than a blank to guess at. Picking an airport overwrites it.
    country: "United States",
    timeZone: INHERIT_ZONE,
    coordinates: null,
  };
}

function stateFromLocation(l: Location): FormState {
  const a = l.address;
  return {
    name: l.name ?? "",
    streetAddress1: a?.streetAddress1 ?? "",
    streetAddress2: a?.streetAddress2 ?? "",
    city: a?.city ?? "",
    state: a?.state ?? "",
    zipCode: a?.zipCode ?? "",
    country: a?.country ?? "United States",
    timeZone: l.timeZone ?? INHERIT_ZONE,
    //Editing does not re-pick an airport, and omitting coordinates on save leaves the
    //stored pair alone. Seeding this from the row would risk writing back a stale one.
    coordinates: null,
  };
}

function errMessage(e: unknown, fallback: string) {
  if (e instanceof ApiError || e instanceof Error) return e.message || fallback;
  return fallback;
}

/**
 * Add or edit a location: the airport or site everything else hangs off.
 *
 * Two things here are not obvious from the form:
 *
 * 1. **Picking an airport fills in four other fields.** The name box is a lookup over the
 *    public airport database, and choosing a row sets the city, state, country, position
 *    and TIME ZONE at once. The zone is the valuable one: it is the wall clock every
 *    booking at this field is pinned to, and the alternative was finding the right name in
 *    a 400-entry combobox, which is a thing people get wrong and never notice.
 *
 *    Typing still wins. Nothing is filled unless a row is chosen, nothing is validated
 *    against the lookup, and a private strip that is not in it saves exactly the same.
 *
 * 2. **Nothing here is verified any more, and nothing ever really was.** This used to
 *    geocode the address through Google on every write and refuse what it could not
 *    resolve. Measured in August 2026, that gate accepted a made-up ZIP (Google ignores it
 *    and returns the real one, which we discarded) and a made-up street (it resolves to a
 *    nearby road, flagged `partial_match`, which nothing checked), and the coordinates it
 *    produced were read only by the Directory, pulled from both clients in July 2026. So
 *    the geocoder went, the address is stored as entered, and only the name is required.
 */
export function LocationFormModal({
  open,
  onOpenChange,
  location,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when set. Only `id` is relied on; the full record is fetched. */
  location: Location | null;
  /** Fired after a successful create, e.g. to select the new location upstream. */
  onCreated?: (created: Location) => void;
}) {
  const isEdit = location != null;
  const { organization } = useAuth();
  const create = useCreateLocation();
  const update = useUpdateLocation();
  const [busy, setBusy] = React.useState(false);

  // The LIST rows carry no `timeZone`, so an edit form seeded from one would quietly
  // reset the zone to "same as the school" on save. Always edit the full record.
  const detailQ = useLocation(location?.id ?? null, { enabled: open && isEdit });
  const detail = detailQ.data;

  const [form, setForm] = React.useState<FormState>(emptyState);
  // Surfaced only after a submit attempt, so we don't nag on a pristine form.
  const [showErrors, setShowErrors] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Once the zone has been picked by hand, a late-arriving detail response must not
  // reach in and overwrite it.
  const zoneTouched = React.useRef(false);

  // Reset whenever the modal opens (fresh add, or prefilled edit).
  React.useEffect(() => {
    if (!open) return;
    setForm(location ? stateFromLocation(location) : emptyState());
    setShowErrors(false);
    setError(null);
    zoneTouched.current = false;
  }, [open, location]);

  // The row we were handed has name and address but no zone, so fill that one field in
  // when the full record lands rather than re-seeding the whole form under the cursor.
  React.useEffect(() => {
    if (!open || !detail || zoneTouched.current) return;
    setForm((f) => ({ ...f, timeZone: detail.timeZone ?? INHERIT_ZONE }));
  }, [open, detail]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /**
   * Fill in what the lookup knows, and only that.
   *
   * The rule is the same one the add-aircraft form settled on: overwrite a field the
   * lookup has an answer for, leave the rest alone. A wrong prefill is worse than an empty
   * one, because nobody re-reads a field that already looks filled in.
   *
   * So the street address is untouched. OurAirports has no street or ZIP, and inventing
   * one from the airport's name would be exactly that wrong prefill. The person adds a
   * hangar number if they want one.
   *
   * The zone is marked as touched, which stops the late-arriving detail fetch from
   * reaching in and overwriting the zone we just derived from the airport's coordinates.
   */
  function onPickAirport(match: AirportMatch) {
    zoneTouched.current = true;
    setForm((f) => ({
      ...f,
      city: match.municipality ?? f.city,
      //"US-ID" -> "ID". Empty for the countries that do not code subdivisions this way,
      //in which case the existing value stands rather than being blanked.
      state: subdivisionOf(match) || f.state,
      country: countryName(match.isoCountry) || f.country,
      //A zone we could not resolve at import time leaves the field on whatever it was,
      //which for a new location is "same as the school". That is the old behaviour, and
      //it is a fine answer, not a failure.
      timeZone: match.timeZone ?? f.timeZone,
      coordinates: { lat: match.latitude, lng: match.longitude },
    }));
  }

  const orgZone = organization?.timeZone ?? null;
  const zones = React.useMemo(() => zoneOptions(orgZone), [orgZone]);

  // Per-field validity, derived every render so inline messages clear as you type.
  const errors: Record<string, string> = {
    name: form.name.trim().length === 0 ? "Name the airport or site." : "",
  };
  const firstInvalid = REQUIRED_FIELDS.find((f) => errors[f.key]);

  const pending = busy || create.isPending || update.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    // Instead of a silently-disabled button, tell the user exactly what's missing.
    if (firstInvalid) {
      setShowErrors(true);
      document.getElementById(firstInvalid.id)?.focus();
      return;
    }

    const name = form.name.trim();
    const address = {
      streetAddress1: form.streetAddress1.trim(),
      streetAddress2: form.streetAddress2.trim() || null,
      city: form.city.trim(),
      state: form.state.trim(),
      zipCode: form.zipCode.trim(),
      country: form.country.trim(),
    };
    const timeZone = form.timeZone === INHERIT_ZONE ? null : form.timeZone;
    // Omitted rather than sent as null when nothing was picked, so an edit that only
    // renames a field leaves whatever position is stored alone.
    const coordinates = form.coordinates ?? undefined;

    setBusy(true);
    setError(null);
    try {
      if (isEdit && location) {
        await update.mutateAsync({ id: location.id, name, address, timeZone, coordinates });
        toast.success(`${name} saved.`);
      } else {
        // One request. This used to be a POST followed by a PATCH, because create ignored
        // `timeZone` and only update read it, which meant a new location could half-save:
        // the row created, the zone lost. The server honours the zone on create now, so
        // the failure mode and the warning toast it needed are both gone.
        const created = await create.mutateAsync({ name, address, timeZone, coordinates });
        toast.success(`${name} added.`);
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (err) {
      const msg = errMessage(err, "Couldn't save this location.");
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveModal
      footer={
        <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit"
                form="modal-location-form" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Save changes" : "Add location"}
            </Button>
        </div>
      }
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Edit ${location?.name ?? "location"}` : "Add location"}
      description={
        isEdit
          ? "Update the field's address or the time zone its schedule runs on."
          : "The airport or site your aircraft, simulators and rooms are based at."
      }
    >
      <form id="modal-location-form" onSubmit={handleSubmit} className="space-y-4">
        {isEdit && detailQ.isPending && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading this location…
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="loc-name">Airport or site name</Label>
          <AirportField
            id="loc-name"
            autoFocus
            //The column is VarChar(60) and the server does not truncate, so the box has to.
            maxLength={60}
            placeholder="Search by identifier or name, e.g. KBOI or Boise"
            value={form.name}
            onChange={(v) => set("name", v)}
            onPick={onPickAirport}
            invalid={showErrors && !!errors.name}
          />
          {showErrors && errors.name && (
            <p className="text-xs text-destructive">{errors.name}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="loc-street1">Street address (optional)</Label>
          <Input
            id="loc-street1"
            placeholder="3201 W Airport Way"
            value={form.streetAddress1}
            onChange={(e) => set("streetAddress1", e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="loc-street2">Suite, hangar, unit (optional)</Label>
          <Input
            id="loc-street2"
            placeholder="Hangar 4"
            value={form.streetAddress2}
            onChange={(e) => set("streetAddress2", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="loc-city">City</Label>
            <Input
              id="loc-city"
              placeholder="Boise"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loc-state">State</Label>
            <Input
              id="loc-state"
              placeholder="ID"
              value={form.state}
              onChange={(e) => set("state", e.target.value)}
              />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="loc-zip">ZIP code</Label>
            <Input
              id="loc-zip"
              className="tnum"
              placeholder="83705"
              value={form.zipCode}
              onChange={(e) => set("zipCode", e.target.value)}
              />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loc-country">Country</Label>
            <Input
              id="loc-country"
              placeholder="United States"
              value={form.country}
              onChange={(e) => set("country", e.target.value)}
              />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="loc-tz">Time zone</Label>
          <Combobox
            id="loc-tz"
            options={zones}
            value={form.timeZone}
            onChange={(v) => {
              zoneTouched.current = true;
              set("timeZone", v);
            }}
            placeholder="Same as the school"
            searchPlaceholder="Search time zones…"
            emptyText="No matching zone."
          />
          <p className="text-xs text-muted-foreground">
            What time a booking here actually is. A trip that runs overnight is counted in
            this zone, so a satellite field in a different one needs its own.
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

      </form>
    </ResponsiveModal>
  );
}
