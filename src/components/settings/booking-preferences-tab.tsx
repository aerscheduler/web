import { useEffect, useState } from "react";
import { SlidersHorizontal, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useMultiDayReadiness, useUpdateOrganization } from "@/features/queries";
import type { Organization } from "@/types/api";
import { ApiError } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PreferenceToggle } from "@/components/settings/parts";

export function BookingPreferencesTab() {
  const { organization } = useAuth();

  if (!organization) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No active organization. Pick or join one to manage its settings.
        </CardContent>
      </Card>
    );
  }

  return <BookingPreferencesCard organization={organization} />;
}

function BookingPreferencesCard({ organization }: { organization: Organization }) {
  const { rehydrate } = useAuth();
  const update = useUpdateOrganization();
  const prefs = organization.preferences;
  const bookingPolicy = organization.bookingPolicy;

  // Local mirror so the switch flips instantly; reconciled from the server on rehydrate.
  const [overridePrices, setOverridePrices] = useState(
    prefs?.instructorsCanOverrideReservationPrices ?? false
  );
  const [approvedOnly, setApprovedOnly] = useState(
    prefs?.personnelCanOnlyUseApprovedResources ?? false
  );
  const [requirePaymentMethod, setRequirePaymentMethod] = useState(
    bookingPolicy?.requirePaymentMethod ?? false
  );
  const [multiDay, setMultiDay] = useState(bookingPolicy?.multiDayEnabled ?? false);
  const [pending, setPending] = useState<
    PrefField | "requirePaymentMethod" | "multiDayEnabled" | null
  >(null);

  // Only asked for while the setting is OFF: that is the only state where the answer
  // changes what the operator can do, and an org with it already on does not need telling
  // what it would have had to fix.
  const readiness = useMultiDayReadiness({ enabled: !multiDay });
  const blocked = !multiDay && readiness.data?.ready === false;

  // Keep local state honest if the org changes underneath us (org switch, rehydrate).
  useEffect(() => {
    setOverridePrices(prefs?.instructorsCanOverrideReservationPrices ?? false);
    setApprovedOnly(prefs?.personnelCanOnlyUseApprovedResources ?? false);
    setRequirePaymentMethod(bookingPolicy?.requirePaymentMethod ?? false);
    setMultiDay(bookingPolicy?.multiDayEnabled ?? false);
  }, [
    prefs?.instructorsCanOverrideReservationPrices,
    prefs?.personnelCanOnlyUseApprovedResources,
    bookingPolicy?.requirePaymentMethod,
    bookingPolicy?.multiDayEnabled,
  ]);

  function savePref(field: PrefField, value: boolean, apply: (v: boolean) => void) {
    const previous =
      field === "instructorsCanOverrideReservationPrices" ? overridePrices : approvedOnly;
    apply(value);
    setPending(field);
    update.mutate(
      { preferences: { [field]: value } },
      {
        onSuccess: async () => {
          await rehydrate();
          toast.success("Booking preferences updated");
        },
        onError: (err) => {
          apply(previous);
          toast.error(
            err instanceof ApiError ? err.message : "Couldn't save that preference"
          );
        },
        onSettled: () => setPending(null),
      }
    );
  }

  function saveRequirePaymentMethod(value: boolean) {
    const previous = requirePaymentMethod;
    setRequirePaymentMethod(value);
    setPending("requirePaymentMethod");
    update.mutate(
      { bookingPolicy: { requirePaymentMethod: value } },
      {
        onSuccess: async () => {
          await rehydrate();
          toast.success("Booking preferences updated");
        },
        onError: (err) => {
          setRequirePaymentMethod(previous);
          toast.error(
            err instanceof ApiError ? err.message : "Couldn't save that preference"
          );
        },
        onSettled: () => setPending(null),
      }
    );
  }

  function saveMultiDay(value: boolean) {
    const previous = multiDay;
    setMultiDay(value);
    setPending("multiDayEnabled");
    update.mutate(
      { bookingPolicy: { multiDayEnabled: value } },
      {
        onSuccess: async () => {
          await rehydrate();
          toast.success(
            value ? "Multi-day bookings turned on" : "Multi-day bookings turned off"
          );
        },
        onError: (err) => {
          setMultiDay(previous);
          // The server refuses this one with a real explanation (which time zones are
          // missing), so show its message rather than a generic failure.
          toast.error(
            err instanceof ApiError ? err.message : "Couldn't save that preference"
          );
        },
        onSettled: () => setPending(null),
      }
    );
  }

  return (
    <Card data-doc-shot="booking-preferences-tab">
      <CardHeader className="flex-row items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
          <SlidersHorizontal className="size-4" />
        </span>
        <div>
          <CardTitle>Booking preferences</CardTitle>
          <CardDescription>Control how members book and price reservations.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        <PreferenceToggle
          label="Instructors can override reservation prices"
          description="Let instructors adjust the resource and instruction rate on their own reservations. Admins and dispatchers can always override prices."
          checked={overridePrices}
          disabled={pending !== null}
          saving={pending === "instructorsCanOverrideReservationPrices"}
          onCheckedChange={(v) =>
            savePref("instructorsCanOverrideReservationPrices", v, setOverridePrices)
          }
        />
        <PreferenceToggle
          label="Members can only book approved resources"
          docs="approved-resources"
          description="Restrict members to aircraft they're approved on. Admins and dispatchers can still assign anyone to any resource; rooms are unaffected."
          checked={approvedOnly}
          disabled={pending !== null}
          saving={pending === "personnelCanOnlyUseApprovedResources"}
          onCheckedChange={(v) =>
            savePref("personnelCanOnlyUseApprovedResources", v, setApprovedOnly)
          }
        />
        <PreferenceToggle
          label="Require payment method before self-book"
          description="Students and renters must have a card on file before they can book themselves. Owners, admins, and dispatchers can still book anyone; instructor-led bookings are unaffected. Only applies when Stripe billing is enabled."
          checked={requirePaymentMethod}
          disabled={pending !== null}
          saving={pending === "requirePaymentMethod"}
          onCheckedChange={saveRequirePaymentMethod}
        />
        <PreferenceToggle
          label="Allow multi-day bookings"
          docs="multi-day-bookings"
          description={
            <>
              <p>
                Let a booking keep a resource overnight, for trips and cross-countries. A
                multi-day booking overrides the resource's operating hours, so the aircraft
                is simply unavailable until it is back rather than free again the next
                morning.
              </p>
              {blocked && (
                <p className="mt-1.5 flex gap-1.5 text-amber-700 dark:text-amber-500">
                  <TriangleAlert className="mt-px size-3.5 shrink-0" />
                  <span>{readiness.data?.problem}</span>
                </p>
              )}
            </>
          }
          checked={multiDay}
          // Blocked rather than allowed-then-refused: what stands behind this is that
          // nights times the overnight minimum is money, and a night count that falls
          // through to somebody's device means two people booking the same trip are
          // billed differently.
          disabled={pending !== null || blocked}
          saving={pending === "multiDayEnabled"}
          onCheckedChange={saveMultiDay}
        />
      </CardContent>
    </Card>
  );
}

type PrefField =
  | "instructorsCanOverrideReservationPrices"
  | "personnelCanOnlyUseApprovedResources";
