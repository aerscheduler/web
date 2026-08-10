import { useEffect, useState } from "react";
import { Loader2, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useMultiDayReadiness, useUpdateOrganization } from "@/features/queries";
import type { Organization, OrganizationSlotOfferSettings } from "@/types/api";
import { ApiError } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PreferenceToggle } from "@/components/settings/parts";
import { DocsHint } from "@/components/docs-hint";
import type { DocsTopicKey } from "@/lib/docs-links";

type SlotOfferPolicyPatch = Partial<
  Pick<
    OrganizationSlotOfferSettings,
    | "quietHoursStartMinute"
    | "quietHoursEndMinute"
    | "maxPendingOffers"
    | "declineCooldownHours"
    | "holdUrgentMinutes"
    | "holdNormalMinutes"
    | "scannerEnabled"
    | "scannerMinGapMinutes"
    | "scannerHorizonDays"
    | "scannerMaxPerDay"
  >
>;

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
  const slotOfferSettings = organization.slotOfferSettings;

  const [overridePrices, setOverridePrices] = useState(
    prefs?.instructorsCanOverrideReservationPrices ?? false
  );
  const [approvedOnly, setApprovedOnly] = useState(
    prefs?.personnelCanOnlyUseApprovedResources ?? false
  );
  const [slotOffers, setSlotOffers] = useState(slotOfferSettings?.enabled !== false);
  const [requirePaymentMethod, setRequirePaymentMethod] = useState(
    bookingPolicy?.requirePaymentMethod ?? false
  );
  const [multiDay, setMultiDay] = useState(bookingPolicy?.multiDayEnabled ?? false);
  const [flyingDayKey, setFlyingDayKey] = useState(() => flyingDayKeyFromPolicy(bookingPolicy));
  const [pending, setPending] = useState<
    | PrefField
    | "requirePaymentMethod"
    | "multiDayEnabled"
    | "flyingDay"
    | "slotOffersEnabled"
    | "slotOfferPolicy"
    | null
  >(null);

  const [quietKey, setQuietKey] = useState(() => quietHoursKey(slotOfferSettings));
  const [maxPending, setMaxPending] = useState(
    String(slotOfferSettings?.maxPendingOffers ?? 10)
  );
  const [cooldownHours, setCooldownHours] = useState(
    String(slotOfferSettings?.declineCooldownHours ?? 48)
  );
  const [holdUrgent, setHoldUrgent] = useState(
    String(slotOfferSettings?.holdUrgentMinutes ?? 30)
  );
  const [holdNormal, setHoldNormal] = useState(
    String(slotOfferSettings?.holdNormalMinutes ?? 120)
  );
  const [scannerEnabled, setScannerEnabled] = useState(
    slotOfferSettings?.scannerEnabled === true
  );
  const [scannerMinGap, setScannerMinGap] = useState(
    String(slotOfferSettings?.scannerMinGapMinutes ?? 90)
  );
  const [scannerHorizon, setScannerHorizon] = useState(
    String(slotOfferSettings?.scannerHorizonDays ?? 14)
  );
  const [scannerMaxDay, setScannerMaxDay] = useState(
    String(slotOfferSettings?.scannerMaxPerDay ?? 20)
  );

  const readiness = useMultiDayReadiness({ enabled: !multiDay });
  const blocked = !multiDay && readiness.data?.ready === false;

  useEffect(() => {
    setOverridePrices(prefs?.instructorsCanOverrideReservationPrices ?? false);
    setApprovedOnly(prefs?.personnelCanOnlyUseApprovedResources ?? false);
    setSlotOffers(slotOfferSettings?.enabled !== false);
    setRequirePaymentMethod(bookingPolicy?.requirePaymentMethod ?? false);
    setMultiDay(bookingPolicy?.multiDayEnabled ?? false);
    setFlyingDayKey(flyingDayKeyFromPolicy(bookingPolicy));
    setQuietKey(quietHoursKey(slotOfferSettings));
    setMaxPending(String(slotOfferSettings?.maxPendingOffers ?? 10));
    setCooldownHours(String(slotOfferSettings?.declineCooldownHours ?? 48));
    setHoldUrgent(String(slotOfferSettings?.holdUrgentMinutes ?? 30));
    setHoldNormal(String(slotOfferSettings?.holdNormalMinutes ?? 120));
    setScannerEnabled(slotOfferSettings?.scannerEnabled === true);
    setScannerMinGap(String(slotOfferSettings?.scannerMinGapMinutes ?? 90));
    setScannerHorizon(String(slotOfferSettings?.scannerHorizonDays ?? 14));
    setScannerMaxDay(String(slotOfferSettings?.scannerMaxPerDay ?? 20));
  }, [
    prefs?.instructorsCanOverrideReservationPrices,
    prefs?.personnelCanOnlyUseApprovedResources,
    slotOfferSettings?.enabled,
    slotOfferSettings?.quietHoursStartMinute,
    slotOfferSettings?.quietHoursEndMinute,
    slotOfferSettings?.maxPendingOffers,
    slotOfferSettings?.declineCooldownHours,
    slotOfferSettings?.holdUrgentMinutes,
    slotOfferSettings?.holdNormalMinutes,
    slotOfferSettings?.scannerEnabled,
    slotOfferSettings?.scannerMinGapMinutes,
    slotOfferSettings?.scannerHorizonDays,
    slotOfferSettings?.scannerMaxPerDay,
    bookingPolicy?.requirePaymentMethod,
    bookingPolicy?.multiDayEnabled,
    bookingPolicy?.flyingDayStartMinute,
    bookingPolicy?.flyingDayEndMinute,
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

  function saveSlotOffers(value: boolean) {
    const previous = slotOffers;
    setSlotOffers(value);
    setPending("slotOffersEnabled");
    update.mutate(
      { slotOfferSettings: { enabled: value } },
      {
        onSuccess: async () => {
          await rehydrate();
          toast.success("Booking preferences updated");
        },
        onError: (err) => {
          setSlotOffers(previous);
          toast.error(
            err instanceof ApiError ? err.message : "Couldn't save that preference"
          );
        },
        onSettled: () => setPending(null),
      }
    );
  }

  
  function saveFlyingDay(key: string) {
    const previous = flyingDayKey;
    const opt = FLYING_DAY_OPTIONS.find((o) => o.key === key);
    if (!opt) return;
    setFlyingDayKey(key);
    setPending("flyingDay");
    update.mutate(
      {
        bookingPolicy: {
          flyingDayStartMinute: opt.start,
          flyingDayEndMinute: opt.end,
        },
      },
      {
        onSuccess: async () => {
          await rehydrate();
          toast.success("Flying day updated");
        },
        onError: (err) => {
          setFlyingDayKey(previous);
          toast.error(
            err instanceof ApiError ? err.message : "Couldn't save flying day hours"
          );
        },
        onSettled: () => setPending(null),
      }
    );
  }

function saveSlotOfferPolicy(patch: SlotOfferPolicyPatch, revert: () => void) {
    setPending("slotOfferPolicy");
    update.mutate(
      { slotOfferSettings: patch },
      {
        onSuccess: async () => {
          await rehydrate();
          toast.success("Slot offer rules updated");
        },
        onError: (err) => {
          revert();
          toast.error(
            err instanceof ApiError ? err.message : "Couldn't save those slot offer rules"
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
          toast.error(
            err instanceof ApiError ? err.message : "Couldn't save that preference"
          );
        },
        onSettled: () => setPending(null),
      }
    );
  }

  const policyDisabled = pending !== null || !slotOffers;
  const policySaving = pending === "slotOfferPolicy";

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
          label="Offer open slots after a cancel"
          docs="slot-offers"
          description="When a booking cancels, send timed offers to members on standby (instructor confirm first on duals). On by default. Turn off to stop new offers; existing pending offers are unchanged."
          checked={slotOffers}
          disabled={pending !== null}
          saving={pending === "slotOffersEnabled"}
          onCheckedChange={saveSlotOffers}
        />

        {slotOffers && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium">Slot offer rules</p>
              <DocsHint topic="slot-offers" />
              {policySaving && (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Quiet hours use each airport&apos;s time zone (then the school zone). Soft
              holds lock the aircraft while an offer is pending. Decline cooldown stops
              re-offering the same person an overlapping window on that aircraft after they
              decline or let an offer expire.
            </p>

            <PreferenceToggle
              label="Fill idle time automatically"
              docs="slot-offer-ai-scanner"
              description="AerScheduler AI looks for open aircraft time that matches standing preferences and sends timed offers. Off by default. Nobody is booked until they accept."
              checked={scannerEnabled}
              disabled={policyDisabled}
              saving={pending === "slotOfferPolicy" && scannerEnabled !== (slotOfferSettings?.scannerEnabled === true)}
              onCheckedChange={(value) => {
                const previous = scannerEnabled;
                setScannerEnabled(value);
                saveSlotOfferPolicy({ scannerEnabled: value }, () => setScannerEnabled(previous));
              }}
            />

            {scannerEnabled && (
              <div className="grid gap-4 sm:grid-cols-2">
                <PolicySelect
                  label="Minimum idle gap"
                  docs="slot-offer-scanner-min-gap"
                  value={scannerMinGap}
                  disabled={policyDisabled}
                  onValueChange={(value) => {
                    const previous = scannerMinGap;
                    setScannerMinGap(value);
                    saveSlotOfferPolicy(
                      { scannerMinGapMinutes: Number(value) },
                      () => setScannerMinGap(previous)
                    );
                  }}
                  options={[
                    { value: "60", label: "60 minutes" },
                    { value: "90", label: "90 minutes" },
                    { value: "120", label: "2 hours" },
                    { value: "180", label: "3 hours" },
                  ]}
                />
                <PolicySelect
                  label="Look-ahead window"
                  docs="slot-offer-scanner-horizon"
                  value={scannerHorizon}
                  disabled={policyDisabled}
                  onValueChange={(value) => {
                    const previous = scannerHorizon;
                    setScannerHorizon(value);
                    saveSlotOfferPolicy(
                      { scannerHorizonDays: Number(value) },
                      () => setScannerHorizon(previous)
                    );
                  }}
                  options={[
                    { value: "7", label: "7 days" },
                    { value: "14", label: "14 days" },
                    { value: "21", label: "21 days" },
                    { value: "30", label: "30 days" },
                  ]}
                />
                <PolicySelect
                  label="Max AI offers per day"
                  docs="slot-offer-scanner-max-day"
                  value={scannerMaxDay}
                  disabled={policyDisabled}
                  onValueChange={(value) => {
                    const previous = scannerMaxDay;
                    setScannerMaxDay(value);
                    saveSlotOfferPolicy(
                      { scannerMaxPerDay: Number(value) },
                      () => setScannerMaxDay(previous)
                    );
                  }}
                  options={[
                    { value: "5", label: "5" },
                    { value: "10", label: "10" },
                    { value: "20", label: "20" },
                    { value: "40", label: "40" },
                  ]}
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <PolicySelect
                label="Quiet hours"
                docs="slot-offer-quiet-hours"
                value={quietKey}
                disabled={policyDisabled}
                onValueChange={(value) => {
                  const previous = quietKey;
                  setQuietKey(value);
                  const hours = QUIET_OPTIONS.find((o) => o.key === value);
                  if (!hours) return;
                  saveSlotOfferPolicy(
                    {
                      quietHoursStartMinute: hours.start,
                      quietHoursEndMinute: hours.end,
                    },
                    () => setQuietKey(previous)
                  );
                }}
                options={QUIET_OPTIONS.map((o) => ({
                  value: o.key,
                  label: o.label,
                }))}
              />
              <PolicySelect
                label="Decline cooldown"
                docs="slot-offer-decline-cooldown"
                value={cooldownHours}
                disabled={policyDisabled}
                onValueChange={(value) => {
                  const previous = cooldownHours;
                  setCooldownHours(value);
                  saveSlotOfferPolicy(
                    { declineCooldownHours: Number(value) },
                    () => setCooldownHours(previous)
                  );
                }}
                options={[
                  { value: "0", label: "Off" },
                  { value: "24", label: "24 hours" },
                  { value: "48", label: "48 hours" },
                  { value: "72", label: "72 hours" },
                  { value: "168", label: "7 days" },
                ]}
              />
              <PolicySelect
                label="Max pending offers"
                docs="slot-offer-max-pending"
                value={maxPending}
                disabled={policyDisabled}
                onValueChange={(value) => {
                  const previous = maxPending;
                  setMaxPending(value);
                  saveSlotOfferPolicy(
                    { maxPendingOffers: Number(value) },
                    () => setMaxPending(previous)
                  );
                }}
                options={[
                  { value: "5", label: "5" },
                  { value: "10", label: "10" },
                  { value: "15", label: "15" },
                  { value: "20", label: "20" },
                  { value: "50", label: "50" },
                ]}
              />
              <PolicySelect
                label="Hold when slot is within 24 hours"
                docs="slot-offer-hold-urgent"
                value={holdUrgent}
                disabled={policyDisabled}
                onValueChange={(value) => {
                  const previous = holdUrgent;
                  setHoldUrgent(value);
                  saveSlotOfferPolicy(
                    { holdUrgentMinutes: Number(value) },
                    () => setHoldUrgent(previous)
                  );
                }}
                options={[
                  { value: "15", label: "15 minutes" },
                  { value: "30", label: "30 minutes" },
                  { value: "45", label: "45 minutes" },
                  { value: "60", label: "60 minutes" },
                ]}
              />
              <PolicySelect
                label="Hold when slot is further out"
                docs="slot-offer-hold-normal"
                value={holdNormal}
                disabled={policyDisabled}
                onValueChange={(value) => {
                  const previous = holdNormal;
                  setHoldNormal(value);
                  saveSlotOfferPolicy(
                    { holdNormalMinutes: Number(value) },
                    () => setHoldNormal(previous)
                  );
                }}
                options={[
                  { value: "30", label: "30 minutes" },
                  { value: "60", label: "1 hour" },
                  { value: "120", label: "2 hours" },
                  { value: "180", label: "3 hours" },
                  { value: "240", label: "4 hours" },
                ]}
              />
            </div>
          </div>
        )}

        <PreferenceToggle
          label="Require payment method before self-book"
          description="Students and renters must have a card on file before they can book themselves. Owners, admins, and dispatchers can still book anyone; instructor-led bookings are unaffected. Only applies when Stripe billing is enabled."
          checked={requirePaymentMethod}
          disabled={pending !== null}
          saving={pending === "requirePaymentMethod"}
          onCheckedChange={saveRequirePaymentMethod}
        />
        <div className="space-y-2 py-2">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium">Flying day</p>
            <DocsHint topic="flying-day-hours" />
            {pending === "flyingDay" && (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            When aircraft can be booked on a normal day (airport local time). Same-day
            bookings must start and finish inside this window. Multi-day trips skip it.
            Individual aircraft can override this on their edit screen.
          </p>
          <Select
            value={flyingDayKey}
            disabled={pending !== null}
            onValueChange={saveFlyingDay}
          >
            <SelectTrigger className="max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FLYING_DAY_OPTIONS.map((o) => (
                <SelectItem key={o.key} value={o.key}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <PreferenceToggle
          label="Allow multi-day bookings"
          docs="multi-day-bookings"
          description={
            <>
              <p>
                Let a booking keep a resource overnight, for trips and cross-countries. A
                multi-day booking overrides the resource&apos;s operating hours, so the aircraft
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
          disabled={pending !== null || blocked}
          saving={pending === "multiDayEnabled"}
          onCheckedChange={saveMultiDay}
        />
      </CardContent>
    </Card>
  );
}

function PolicySelect({
  label,
  docs,
  value,
  disabled,
  onValueChange,
  options,
}: {
  label: string;
  docs?: DocsTopicKey;
  value: string;
  disabled: boolean;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        {docs && <DocsHint topic={docs} />}
      </div>
      <Select value={value} disabled={disabled} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const QUIET_OPTIONS = [
  { key: "off", label: "Off", start: 0, end: 0 },
  { key: "21-7", label: "9:00 PM to 7:00 AM", start: 21 * 60, end: 7 * 60 },
  { key: "22-6", label: "10:00 PM to 6:00 AM", start: 22 * 60, end: 6 * 60 },
  { key: "20-8", label: "8:00 PM to 8:00 AM", start: 20 * 60, end: 8 * 60 },
] as const;

function quietHoursKey(
  settings: Organization["slotOfferSettings"] | undefined
): string {
  const start = settings?.quietHoursStartMinute ?? 21 * 60;
  const end = settings?.quietHoursEndMinute ?? 7 * 60;
  const match = QUIET_OPTIONS.find((o) => o.start === start && o.end === end);
  return match?.key ?? "21-7";
}

const FLYING_DAY_OPTIONS = [
  { key: "6-22", label: "6:00 AM to 10:00 PM", start: 6 * 60, end: 22 * 60 },
  { key: "7-19", label: "7:00 AM to 7:00 PM", start: 7 * 60, end: 19 * 60 },
  { key: "8-18", label: "8:00 AM to 6:00 PM", start: 8 * 60, end: 18 * 60 },
  { key: "5-23", label: "5:00 AM to 11:00 PM", start: 5 * 60, end: 23 * 60 },
  { key: "24h", label: "24 hours", start: 0, end: 0 },
] as const;

function flyingDayKeyFromPolicy(
  policy: Organization["bookingPolicy"] | undefined
): string {
  const start = policy?.flyingDayStartMinute ?? 6 * 60;
  const end = policy?.flyingDayEndMinute ?? 22 * 60;
  const match = FLYING_DAY_OPTIONS.find((o) => o.start === start && o.end === end);
  return match?.key ?? "6-22";
}

type PrefField =
  | "instructorsCanOverrideReservationPrices"
  | "personnelCanOnlyUseApprovedResources";
