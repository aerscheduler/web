import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateLocation,
  useLocation,
  useUpdateLocation,
} from "@/features/queries";
import type { Location } from "@/types/api";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { COMMON_TIME_ZONES, allTimeZones, describeZone } from "@/lib/timezone";
import { ResponsiveModal } from "@/components/responsive-modal";
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
};

/** Required fields, in focus order, mapped to their input ids for error focus. */
const REQUIRED_FIELDS = [
  { key: "name", id: "loc-name" },
  { key: "streetAddress1", id: "loc-street1" },
  { key: "city", id: "loc-city" },
  { key: "state", id: "loc-state" },
  { key: "zipCode", id: "loc-zip" },
  { key: "country", id: "loc-country" },
] as const;

function emptyState(): FormState {
  return {
    name: "",
    streetAddress1: "",
    streetAddress2: "",
    city: "",
    state: "",
    zipCode: "",
    // Every school on the platform today is US-based and the geocoder wants something
    // here, so this is a default rather than a blank the user has to guess at.
    country: "United States",
    timeZone: INHERIT_ZONE,
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
 * 1. **The address is verified, not stored verbatim.** The server geocodes it through
 *    Google on every write and refuses one it cannot resolve, answering "Address does not
 *    seem to be valid." A typo in the street therefore fails the save, which is why the
 *    server's message is shown as-is rather than replaced with something friendlier.
 * 2. **Create ignores `timeZone`.** `LocationService.create` never reads it, only
 *    `update` does, so a new location with a zone is a POST followed by a PATCH. If the
 *    PATCH is the half that fails, the location still exists, and saying so is better
 *    than a red toast over a location that is sitting in the list.
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

  const orgZone = organization?.timeZone ?? null;
  const zones = React.useMemo(() => zoneOptions(orgZone), [orgZone]);

  // Per-field validity, derived every render so inline messages clear as you type.
  const errors: Record<string, string> = {
    name: form.name.trim().length === 0 ? "Name the airport or site." : "",
    streetAddress1: form.streetAddress1.trim().length === 0 ? "Enter the street address." : "",
    city: form.city.trim().length === 0 ? "Enter the city." : "",
    state: form.state.trim().length === 0 ? "Enter the state." : "",
    zipCode: form.zipCode.trim().length === 0 ? "Enter the ZIP code." : "",
    country: form.country.trim().length === 0 ? "Enter the country." : "",
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

    setBusy(true);
    setError(null);
    try {
      if (isEdit && location) {
        await update.mutateAsync({ id: location.id, name, address, timeZone });
        toast.success(`${name} saved.`);
      } else {
        const created = await create.mutateAsync({ name, address });
        let zoneSaved = true;
        if (timeZone) {
          try {
            await update.mutateAsync({ id: created.id, name, address, timeZone });
          } catch {
            // The location exists. That is a success with a caveat, not a failure.
            zoneSaved = false;
          }
        }
        if (zoneSaved) {
          toast.success(`${name} added.`);
        } else {
          toast.warning(
            `${name} was added, but its time zone did not save. Open it and set the zone.`
          );
        }
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
          <Input
            id="loc-name"
            autoFocus
            maxLength={60}
            placeholder="e.g. KBOI Boise Air Terminal"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            aria-invalid={showErrors && !!errors.name}
          />
          {showErrors && errors.name ? (
            <p className="text-xs text-destructive">{errors.name}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Members pick this by name when booking, so an identifier they say out loud
              works best.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="loc-street1">Street address</Label>
          <Input
            id="loc-street1"
            placeholder="3201 W Airport Way"
            value={form.streetAddress1}
            onChange={(e) => set("streetAddress1", e.target.value)}
            aria-invalid={showErrors && !!errors.streetAddress1}
          />
          {showErrors && errors.streetAddress1 && (
            <p className="text-xs text-destructive">{errors.streetAddress1}</p>
          )}
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
              aria-invalid={showErrors && !!errors.city}
            />
            {showErrors && errors.city && (
              <p className="text-xs text-destructive">{errors.city}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loc-state">State</Label>
            <Input
              id="loc-state"
              placeholder="ID"
              value={form.state}
              onChange={(e) => set("state", e.target.value)}
              aria-invalid={showErrors && !!errors.state}
            />
            {showErrors && errors.state && (
              <p className="text-xs text-destructive">{errors.state}</p>
            )}
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
              aria-invalid={showErrors && !!errors.zipCode}
            />
            {showErrors && errors.zipCode && (
              <p className="text-xs text-destructive">{errors.zipCode}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loc-country">Country</Label>
            <Input
              id="loc-country"
              placeholder="United States"
              value={form.country}
              onChange={(e) => set("country", e.target.value)}
              aria-invalid={showErrors && !!errors.country}
            />
            {showErrors && errors.country && (
              <p className="text-xs text-destructive">{errors.country}</p>
            )}
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
