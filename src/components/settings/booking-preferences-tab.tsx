import { useEffect, useState } from "react";
import { Loader2, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useMultiDayReadiness, useOrgLedgerSettings, useOrgUserGroups, useUpdateOrganization } from "@/features/queries";
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
import { Input } from "@/components/ui/input";

type SlotOfferPolicyPatch = Partial<
  Pick<
    OrganizationSlotOfferSettings,
    | "quietHoursStartMinute"
    | "quietHoursEndMinute"
    | "maxPendingOffers"
    | "maxPendingOffersPerMember"
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

const MAX_LEDGER_GATE_DOLLARS = 1_000_000;

function parseLedgerGateDollars(
  raw: string
): { cents: number } | { clear: true } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { clear: true };
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars) || dollars < 0) return { clear: true };
  if (dollars > MAX_LEDGER_GATE_DOLLARS) {
    return { error: "Must be $0–$1,000,000, or leave it off." };
  }
  return { cents: Math.round(dollars * 100) };
}

function BookingPreferencesCard({ organization }: { organization: Organization }) {
  const { rehydrate } = useAuth();
  const update = useUpdateOrganization();
  const prefs = organization.preferences;
  const bookingPolicy = organization.bookingPolicy;
  const orgUserGroupsQ = useOrgUserGroups();
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
  const [cancelLockHours, setCancelLockHours] = useState(
    () => String(bookingPolicy?.cancelEditLockHours ?? "")
  );
  const [lateFeeDollars, setLateFeeDollars] = useState(() =>
    bookingPolicy?.lateCancelFeeCents != null
      ? String(bookingPolicy.lateCancelFeeCents / 100)
      : ""
  );
  const [maxFuture, setMaxFuture] = useState(
    () => String(bookingPolicy?.maxFutureBookings ?? "")
  );
  const [maxLengthMinutes, setMaxLengthMinutes] = useState(
    () => String(bookingPolicy?.maxReservationMinutes ?? "")
  );
  const [noticeMinutes, setNoticeMinutes] = useState(
    () => String(bookingPolicy?.minimumNoticeMinutes ?? "")
  );
  const [horizonDays, setHorizonDays] = useState(
    () => String(bookingPolicy?.bookingHorizonDays ?? "")
  );
  const [startIncrement, setStartIncrement] = useState(
    () => String(bookingPolicy?.startTimeIncrementMinutes ?? "")
  );
  const [fixedMinutes, setFixedMinutes] = useState(
    () => String(bookingPolicy?.fixedReservationMinutes ?? "")
  );
  const [bufferBefore, setBufferBefore] = useState(
    () => String(bookingPolicy?.bufferBeforeMinutes ?? "")
  );
  const [approvalRoles, setApprovalRoles] = useState<string[]>(
    () => bookingPolicy?.bookingApprovalRequiredRoles ?? []
  );
  const [approvalGroupIds, setApprovalGroupIds] = useState<number[]>(
    () => bookingPolicy?.bookingApprovalRequiredGroups?.map((g) => g.id) ?? []
  );
  const [bufferAfter, setBufferAfter] = useState(
    () => String(bookingPolicy?.bufferAfterMinutes ?? "")
  );
  const ledgerOn = useOrgLedgerSettings().data?.enabled === true;
  const [minCreditDollars, setMinCreditDollars] = useState(() =>
    bookingPolicy?.minimumBalanceCents != null
      ? String(bookingPolicy.minimumBalanceCents / 100)
      : ""
  );
  const [maxOwedDollars, setMaxOwedDollars] = useState(() =>
    bookingPolicy?.balanceMaximumCents != null
      ? String(bookingPolicy.balanceMaximumCents / 100)
      : ""
  );
  const [dispatchMinDollars, setDispatchMinDollars] = useState(() =>
    bookingPolicy?.dispatchMinimumBalanceCents != null
      ? String(bookingPolicy.dispatchMinimumBalanceCents / 100)
      : ""
  );
  const [dispatchMaxOwedDollars, setDispatchMaxOwedDollars] = useState(() =>
    bookingPolicy?.dispatchBalanceMaximumCents != null
      ? String(bookingPolicy.dispatchBalanceMaximumCents / 100)
      : ""
  );
  const [pending, setPending] = useState<
    | PrefField
    | "requirePaymentMethod"
    | "multiDayEnabled"
    | "flyingDay"
    | "slotOffersEnabled"
    | "slotOfferPolicy"
    | "bookingRules"
    | "approvalRoles"
    | "approvalGroups"
    | null
  >(null);

  const [quietKey, setQuietKey] = useState(() => quietHoursKey(slotOfferSettings));
  const [maxPending, setMaxPending] = useState(
    String(slotOfferSettings?.maxPendingOffers ?? 10)
  );
  const [maxPendingPerMember, setMaxPendingPerMember] = useState(
    String(slotOfferSettings?.maxPendingOffersPerMember ?? 2)
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
  const zoneReadiness = useMultiDayReadiness();
  const zoneBlocked = zoneReadiness.data?.ready === false;

  useEffect(() => {
    setOverridePrices(prefs?.instructorsCanOverrideReservationPrices ?? false);
    setApprovedOnly(prefs?.personnelCanOnlyUseApprovedResources ?? false);
    setSlotOffers(slotOfferSettings?.enabled !== false);
    setRequirePaymentMethod(bookingPolicy?.requirePaymentMethod ?? false);
    setMultiDay(bookingPolicy?.multiDayEnabled ?? false);
    setFlyingDayKey(flyingDayKeyFromPolicy(bookingPolicy));
    setCancelLockHours(String(bookingPolicy?.cancelEditLockHours ?? ""));
    setLateFeeDollars(
      bookingPolicy?.lateCancelFeeCents != null
        ? String(bookingPolicy.lateCancelFeeCents / 100)
        : ""
    );
    setMaxFuture(String(bookingPolicy?.maxFutureBookings ?? ""));
    setMaxLengthMinutes(String(bookingPolicy?.maxReservationMinutes ?? ""));
    setNoticeMinutes(String(bookingPolicy?.minimumNoticeMinutes ?? ""));
    setHorizonDays(String(bookingPolicy?.bookingHorizonDays ?? ""));
    setStartIncrement(String(bookingPolicy?.startTimeIncrementMinutes ?? ""));
    setFixedMinutes(String(bookingPolicy?.fixedReservationMinutes ?? ""));
    setBufferBefore(String(bookingPolicy?.bufferBeforeMinutes ?? ""));
    setBufferAfter(String(bookingPolicy?.bufferAfterMinutes ?? ""));
    setApprovalRoles(bookingPolicy?.bookingApprovalRequiredRoles ?? []);
    setApprovalGroupIds(bookingPolicy?.bookingApprovalRequiredGroups?.map((g) => g.id) ?? []);
    setMinCreditDollars(
      bookingPolicy?.minimumBalanceCents != null
        ? String(bookingPolicy.minimumBalanceCents / 100)
        : ""
    );
    setMaxOwedDollars(
      bookingPolicy?.balanceMaximumCents != null
        ? String(bookingPolicy.balanceMaximumCents / 100)
        : ""
    );
    setDispatchMinDollars(
      bookingPolicy?.dispatchMinimumBalanceCents != null
        ? String(bookingPolicy.dispatchMinimumBalanceCents / 100)
        : ""
    );
    setDispatchMaxOwedDollars(
      bookingPolicy?.dispatchBalanceMaximumCents != null
        ? String(bookingPolicy.dispatchBalanceMaximumCents / 100)
        : ""
    );
    setQuietKey(quietHoursKey(slotOfferSettings));
    setMaxPending(String(slotOfferSettings?.maxPendingOffers ?? 10));
    setMaxPendingPerMember(String(slotOfferSettings?.maxPendingOffersPerMember ?? 2));
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
    slotOfferSettings?.maxPendingOffersPerMember,
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
    bookingPolicy?.cancelEditLockHours,
    bookingPolicy?.lateCancelFeeCents,
    bookingPolicy?.maxFutureBookings,
    bookingPolicy?.maxReservationMinutes,
    bookingPolicy?.minimumNoticeMinutes,
    bookingPolicy?.bookingHorizonDays,
    bookingPolicy?.startTimeIncrementMinutes,
    bookingPolicy?.fixedReservationMinutes,
    bookingPolicy?.bufferBeforeMinutes,
    bookingPolicy?.bufferAfterMinutes,
    bookingPolicy?.minimumBalanceCents,
    bookingPolicy?.balanceMaximumCents,
    bookingPolicy?.dispatchMinimumBalanceCents,
    bookingPolicy?.dispatchBalanceMaximumCents,
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
    if (opt.key !== "24h" && zoneBlocked) {
      toast.error(zoneReadiness.data?.problem ?? "Set a time zone before restricting flying-day hours.");
      return;
    }
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
          toast.success("Offer rules updated");
        },
        onError: (err) => {
          revert();
          toast.error(
            err instanceof ApiError ? err.message : "Couldn't save those offer rules"
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

  function saveBookingRules(patch: {
    cancelEditLockHours?: number | null;
    lateCancelFeeCents?: number | null;
    maxFutureBookings?: number | null;
    maxReservationMinutes?: number | null;
    minimumNoticeMinutes?: number | null;
    bookingHorizonDays?: number | null;
    startTimeIncrementMinutes?: number | null;
    fixedReservationMinutes?: number | null;
    bufferBeforeMinutes?: number | null;
    bufferAfterMinutes?: number | null;
    minimumBalanceCents?: number | null;
    balanceMaximumCents?: number | null;
    dispatchMinimumBalanceCents?: number | null;
    dispatchBalanceMaximumCents?: number | null;
  }) {
    setPending("bookingRules");
    update.mutate(
      { bookingPolicy: patch },
      {
        onSuccess: async () => {
          await rehydrate();
          toast.success("Booking rules updated");
        },
        onError: (err) => {
          toast.error(
            err instanceof ApiError ? err.message : "Couldn't save those booking rules"
          );
          // Revert from org after rehydrate fails; pull from last known policy
          setCancelLockHours(String(bookingPolicy?.cancelEditLockHours ?? ""));
          setLateFeeDollars(
            bookingPolicy?.lateCancelFeeCents != null
              ? String(bookingPolicy.lateCancelFeeCents / 100)
              : ""
          );
          setMaxFuture(String(bookingPolicy?.maxFutureBookings ?? ""));
          setMaxLengthMinutes(String(bookingPolicy?.maxReservationMinutes ?? ""));
          setNoticeMinutes(String(bookingPolicy?.minimumNoticeMinutes ?? ""));
          setHorizonDays(String(bookingPolicy?.bookingHorizonDays ?? ""));
          setStartIncrement(String(bookingPolicy?.startTimeIncrementMinutes ?? ""));
          setFixedMinutes(String(bookingPolicy?.fixedReservationMinutes ?? ""));
          setBufferBefore(String(bookingPolicy?.bufferBeforeMinutes ?? ""));
          setBufferAfter(String(bookingPolicy?.bufferAfterMinutes ?? ""));
    setApprovalRoles(bookingPolicy?.bookingApprovalRequiredRoles ?? []);
    setApprovalGroupIds(bookingPolicy?.bookingApprovalRequiredGroups?.map((g) => g.id) ?? []);
          setMinCreditDollars(
            bookingPolicy?.minimumBalanceCents != null
              ? String(bookingPolicy.minimumBalanceCents / 100)
              : ""
          );
          setMaxOwedDollars(
            bookingPolicy?.balanceMaximumCents != null
              ? String(bookingPolicy.balanceMaximumCents / 100)
              : ""
          );
          setDispatchMinDollars(
            bookingPolicy?.dispatchMinimumBalanceCents != null
              ? String(bookingPolicy.dispatchMinimumBalanceCents / 100)
              : ""
          );
          setDispatchMaxOwedDollars(
            bookingPolicy?.dispatchBalanceMaximumCents != null
              ? String(bookingPolicy.dispatchBalanceMaximumCents / 100)
              : ""
          );
        },
        onSettled: () => setPending(null),
      }
    );
  }

  const stripeReady = organization.billing?.stripeEnabled === true;
  const lockEnabled = cancelLockHours.trim() !== "";
  /**
   * The two length rules read as one sentence or they read as nothing.
   *
   * The server refuses a fixed length longer than the ceiling, so each picker offers only
   * the values that still agree with the other one's current setting. Without this the
   * pair is a trap: pick "every booking is 4 hours" under a 2 hour ceiling and the only
   * feedback is a validation toast that names neither control.
   */
  const fixedLengthValue = fixedMinutes === "" ? null : Number(fixedMinutes);
  const maxLengthValue = maxLengthMinutes === "" ? null : Number(maxLengthMinutes);
  const maxLengthOptions = MAX_LENGTH_OPTIONS.filter(
    (o) => o.value === "off" || fixedLengthValue == null || Number(o.value) >= fixedLengthValue
  );
  const fixedLengthOptions = FIXED_LENGTH_OPTIONS.filter(
    (o) => o.value === "off" || maxLengthValue == null || Number(o.value) <= maxLengthValue
  );
  const policyDisabled = pending !== null || !slotOffers;
  const policySaving = pending === "slotOfferPolicy";
  const rulesSaving = pending === "bookingRules";
  const rulesDisabled = pending !== null;

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
          description="Restrict students and renters to aircraft they're approved on. Approve them from the aircraft or from their profile. Admins and dispatchers can still assign anyone to any resource; rooms are unaffected."
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
              <p className="text-sm font-medium">Offer rules</p>
              <DocsHint topic="slot-offers" />
              {policySaving && (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Quiet hours use each airport&apos;s time zone (then the school zone). A
              pending offer reserves the aircraft until someone accepts, declines, or
              the offer ends. Decline cooldown stops re-offering the same person an
              overlapping window on that aircraft after they decline or let an offer
              expire.
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
                label="Max pending offers per person"
                docs="slot-offer-max-pending-per-member"
                value={maxPendingPerMember}
                disabled={policyDisabled}
                onValueChange={(value) => {
                  const previous = maxPendingPerMember;
                  setMaxPendingPerMember(value);
                  saveSlotOfferPolicy(
                    { maxPendingOffersPerMember: Number(value) },
                    () => setMaxPendingPerMember(previous)
                  );
                }}
                options={[
                  { value: "1", label: "1" },
                  { value: "2", label: "2" },
                  { value: "3", label: "3" },
                  { value: "5", label: "5" },
                  { value: "10", label: "10" },
                ]}
              />
              <PolicySelect
                label="Offer window when slot is within 24 hours"
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
                label="Offer window when slot is further out"
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
          {zoneBlocked && flyingDayKey !== "24h" && (
            <p className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-500">
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              <span>{zoneReadiness.data?.problem}</span>
            </p>
          )}
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

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium">Booking and cancellation rules</p>
            <DocsHint topic="booking-policy-rules" />
            {rulesSaving && (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            All off by default. Turn on only what your school needs. These are shared
            calendar rules: they apply to every booking on the schedule, including the
            ones the front desk makes, and members see a clear reason when a rule refuses
            a booking or cancel.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <PolicySelect
              label="Cancel and edit lock"
              docs="booking-policy-rules"
              hint="Inside this window, members cannot cancel or edit. Front desk, instructors, and technicians can still override."
              value={cancelLockHours === "" ? "off" : cancelLockHours}
              disabled={rulesDisabled}
              onValueChange={(value) => {
                if (value === "off") {
                  setCancelLockHours("");
                  setLateFeeDollars("");
                  saveBookingRules({ cancelEditLockHours: null, lateCancelFeeCents: null });
                  return;
                }
                setCancelLockHours(value);
                saveBookingRules({ cancelEditLockHours: Number(value) });
              }}
              options={[
                { value: "off", label: "Off" },
                { value: "1", label: "1 hour before start" },
                { value: "2", label: "2 hours before start" },
                { value: "4", label: "4 hours before start" },
                { value: "12", label: "12 hours before start" },
                { value: "24", label: "24 hours before start" },
                { value: "48", label: "48 hours before start" },
              ]}
            />

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Late-cancel fee (optional)
                </Label>
                <DocsHint topic="booking-policy-rules" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  placeholder="Off"
                  className="max-w-[8rem]"
                  value={lateFeeDollars}
                  disabled={rulesDisabled || !lockEnabled || !stripeReady}
                  onChange={(e) => setLateFeeDollars(e.target.value)}
                  onBlur={() => {
                    const raw = lateFeeDollars.trim();
                    if (raw === "") {
                      saveBookingRules({ lateCancelFeeCents: null });
                      return;
                    }
                    const dollars = Number(raw);
                    if (!Number.isFinite(dollars) || dollars <= 0) {
                      setLateFeeDollars("");
                      saveBookingRules({ lateCancelFeeCents: null });
                      return;
                    }
                    saveBookingRules({ lateCancelFeeCents: Math.round(dollars * 100) });
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {!lockEnabled
                  ? "Turn on the cancel and edit lock first. Inside that window, members can cancel by agreeing to this fee."
                  : !stripeReady
                    ? "Connect Stripe under Billing before setting a fee."
                    : "Inside the lock window, members can still cancel if they agree to this fee. Staff cancels never charge."}
              </p>
            </div>

            <PolicySelect
              label="Max upcoming bookings per member"
              docs="booking-policy-rules"
              hint="Counts every future booking they already hold, including each date in a repeating series. A repeat that would push them over the limit is refused."
              value={maxFuture === "" ? "off" : maxFuture}
              disabled={rulesDisabled}
              onValueChange={(value) => {
                if (value === "off") {
                  setMaxFuture("");
                  saveBookingRules({ maxFutureBookings: null });
                  return;
                }
                setMaxFuture(value);
                saveBookingRules({ maxFutureBookings: Number(value) });
              }}
              options={[
                { value: "off", label: "Off" },
                { value: "1", label: "1" },
                { value: "2", label: "2" },
                { value: "3", label: "3" },
                { value: "5", label: "5" },
                { value: "7", label: "7" },
                { value: "10", label: "10" },
                { value: "15", label: "15" },
                { value: "20", label: "20" },
              ]}
            />

            <PolicySelect
              label="Start time interval"
              docs="booking-policy-rules"
              hint="Start times must land on this grid in the school's time zone, so the board does not fill with ragged times. The Start picker offers only these marks."
              value={startIncrement === "" ? "off" : startIncrement}
              disabled={rulesDisabled}
              onValueChange={(value) => {
                if (value === "off") {
                  setStartIncrement("");
                  saveBookingRules({ startTimeIncrementMinutes: null });
                  return;
                }
                if (zoneBlocked) {
                  toast.error(zoneReadiness.data?.problem ?? "Set a time zone before using a start interval.");
                  return;
                }
                setStartIncrement(value);
                saveBookingRules({ startTimeIncrementMinutes: Number(value) });
              }}
              options={START_INTERVAL_OPTIONS}
            />

            {/* Max length and fixed duration are a pair and are kept adjacent so the
                two-column grid puts them on one row: they are only comprehensible
                together, and the server refuses a fixed length above the ceiling. */}
            <PolicySelect
              label="Max reservation length"
              docs="booking-policy-rules"
              hint={
                fixedLengthValue != null
                  ? "The ceiling on a single booking. Every booking is already a fixed length, so this only has to be at least that long."
                  : "The longest a single booking may run. Use a fixed reservation duration instead if every booking should be the same length."
              }
              value={maxLengthMinutes === "" ? "off" : maxLengthMinutes}
              disabled={rulesDisabled}
              onValueChange={(value) => {
                if (value === "off") {
                  setMaxLengthMinutes("");
                  saveBookingRules({ maxReservationMinutes: null });
                  return;
                }
                setMaxLengthMinutes(value);
                saveBookingRules({ maxReservationMinutes: Number(value) });
              }}
              options={maxLengthOptions}
            />

            <PolicySelect
              label="Fixed reservation duration"
              docs="booking-policy-rules"
              hint={
                maxLengthValue != null
                  ? "Every booking is exactly this long and the End time is filled in for you. It cannot be longer than the max reservation length."
                  : "Every booking is exactly this long and the End time is filled in for you. Leave it off to let people choose their own end time up to the max length."
              }
              value={fixedMinutes === "" ? "off" : fixedMinutes}
              disabled={rulesDisabled}
              onValueChange={(value) => {
                if (value === "off") {
                  setFixedMinutes("");
                  saveBookingRules({ fixedReservationMinutes: null });
                  return;
                }
                setFixedMinutes(value);
                saveBookingRules({ fixedReservationMinutes: Number(value) });
              }}
              options={fixedLengthOptions}
            />

            <PolicySelect
              label="Minimum notice"
              docs="booking-policy-rules"
              hint="How far ahead a booking has to be made. Times inside this window stop being offered in the picker."
              value={noticeMinutes === "" ? "off" : noticeMinutes}
              disabled={rulesDisabled}
              onValueChange={(value) => {
                if (value === "off") {
                  setNoticeMinutes("");
                  saveBookingRules({ minimumNoticeMinutes: null });
                  return;
                }
                setNoticeMinutes(value);
                saveBookingRules({ minimumNoticeMinutes: Number(value) });
              }}
              options={NOTICE_OPTIONS}
            />

            <PolicySelect
              label="Booking horizon"
              docs="booking-policy-rules"
              hint="How far into the future anyone may book. Off leaves the standard one year limit in place."
              value={horizonDays === "" ? "off" : horizonDays}
              disabled={rulesDisabled}
              onValueChange={(value) => {
                if (value === "off") {
                  setHorizonDays("");
                  saveBookingRules({ bookingHorizonDays: null });
                  return;
                }
                if (zoneBlocked) {
                  toast.error(zoneReadiness.data?.problem ?? "Set a time zone before using a booking horizon.");
                  return;
                }
                setHorizonDays(value);
                saveBookingRules({ bookingHorizonDays: Number(value) });
              }}
              options={HORIZON_OPTIONS}
            />

            <PolicySelect
              label="Buffer before a booking"
              docs="booking-policy-rules"
              hint="Idle time the resource needs ahead of a booking, for preflight or a turnaround. Set on its own; it does not imply any buffer after."
              value={bufferBefore === "" ? "off" : bufferBefore}
              disabled={rulesDisabled}
              onValueChange={(value) => {
                if (value === "off") {
                  setBufferBefore("");
                  saveBookingRules({ bufferBeforeMinutes: null });
                  return;
                }
                setBufferBefore(value);
                saveBookingRules({ bufferBeforeMinutes: Number(value) });
              }}
              options={BUFFER_OPTIONS}
            />

            <PolicySelect
              label="Buffer after a booking"
              docs="booking-policy-rules"
              hint="Idle time after a booking, for tie-down and paperwork. A separate rule from the buffer before, so you can set either one alone."
              value={bufferAfter === "" ? "off" : bufferAfter}
              disabled={rulesDisabled}
              onValueChange={(value) => {
                if (value === "off") {
                  setBufferAfter("");
                  saveBookingRules({ bufferAfterMinutes: null });
                  return;
                }
                setBufferAfter(value);
                saveBookingRules({ bufferAfterMinutes: Number(value) });
              }}
              options={BUFFER_OPTIONS}
            />
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Booking approval required</p>
                  <p className="text-sm text-muted-foreground">
                    Members with these roles (or in selected groups) submit requests instead of booking instantly.
                    Staff scheduling on the board is unchanged.
                  </p>
                </div>
                <DocsHint topic="booking-approval-required" />
              </div>
              <div className="flex flex-wrap gap-2">
                {(["student", "renter", "instructor"] as const).map((role) => (
                  <PreferenceToggle
                    key={role}
                    label={role.charAt(0).toUpperCase() + role.slice(1)}
                    checked={approvalRoles.includes(role)}
                    disabled={rulesDisabled || pending != null}
                    onCheckedChange={(checked) => {
                      const next = checked
                        ? [...approvalRoles, role]
                        : approvalRoles.filter((r) => r !== role);
                      const prev = approvalRoles;
                      setApprovalRoles(next);
                      setPending("approvalRoles");
                      update.mutate(
                        {
                          bookingPolicy: {
                            bookingApprovalRequiredRoles: next,
                          },
                        },
                        {
                          onSuccess: async () => {
                            await rehydrate();
                            toast.success("Approval rules updated");
                          },
                          onError: (err) => {
                            setApprovalRoles(prev);
                            toast.error(
                              err instanceof ApiError ? err.message : "Couldn't save approval rules"
                            );
                          },
                          onSettled: () => setPending(null),
                        }
                      );
                    }}
                  />
                ))}
              </div>
              {(orgUserGroupsQ.data?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <Label>Groups requiring approval</Label>
                  <div className="flex flex-wrap gap-2">
                    {(orgUserGroupsQ.data ?? []).map((group) => {
                      const on = approvalGroupIds.includes(group.id);
                      return (
                        <PreferenceToggle
                          key={group.id}
                          label={group.name}
                          checked={on}
                          disabled={rulesDisabled || pending != null}
                          onCheckedChange={(checked) => {
                            const next = checked
                              ? [...approvalGroupIds, group.id]
                              : approvalGroupIds.filter((id) => id !== group.id);
                            const prev = approvalGroupIds;
                            setApprovalGroupIds(next);
                            setPending("approvalGroups");
                            update.mutate(
                              {
                                bookingPolicy: {
                                  bookingApprovalRequiredGroupIds: next,
                                } as unknown as Organization["bookingPolicy"],
                              },
                              {
                                onSuccess: async () => {
                                  await rehydrate();
                                  toast.success("Approval groups updated");
                                },
                                onError: (err) => {
                                  setApprovalGroupIds(prev);
                                  toast.error(
                                    err instanceof ApiError
                                      ? err.message
                                      : "Couldn't save approval groups"
                                  );
                                },
                                onSettled: () => setPending(null),
                              }
                            );
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

          </div>

          {ledgerOn && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Minimum credit to self-book
                  </Label>
                  <DocsHint topic="ledger-booking-gates" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    placeholder="Off"
                    className="max-w-[8rem]"
                    value={minCreditDollars}
                    disabled={rulesDisabled}
                    onChange={(e) => setMinCreditDollars(e.target.value)}
                    onBlur={() => {
                      const parsed = parseLedgerGateDollars(minCreditDollars);
                      if ("error" in parsed) {
                        toast.error(parsed.error);
                        setMinCreditDollars(
                          bookingPolicy?.minimumBalanceCents != null
                            ? String(bookingPolicy.minimumBalanceCents / 100)
                            : ""
                        );
                        return;
                      }
                      if ("clear" in parsed) {
                        setMinCreditDollars("");
                        saveBookingRules({ minimumBalanceCents: null });
                        return;
                      }
                      saveBookingRules({ minimumBalanceCents: parsed.cents });
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Students and renters on the booking need this much credit.
                  $0 means they cannot book while owing. Staff and instructor-led
                  bookings skip this. On a shared flight every billed seat is checked.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Maximum owing to self-book
                  </Label>
                  <DocsHint topic="ledger-booking-gates" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    placeholder="Off"
                    className="max-w-[8rem]"
                    value={maxOwedDollars}
                    disabled={rulesDisabled}
                    onChange={(e) => setMaxOwedDollars(e.target.value)}
                    onBlur={() => {
                      const parsed = parseLedgerGateDollars(maxOwedDollars);
                      if ("error" in parsed) {
                        toast.error(parsed.error);
                        setMaxOwedDollars(
                          bookingPolicy?.balanceMaximumCents != null
                            ? String(bookingPolicy.balanceMaximumCents / 100)
                            : ""
                        );
                        return;
                      }
                      if ("clear" in parsed) {
                        setMaxOwedDollars("");
                        saveBookingRules({ balanceMaximumCents: null });
                        return;
                      }
                      saveBookingRules({ balanceMaximumCents: parsed.cents });
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Block self-book once they owe more than this. $0 means any
                  negative balance is refused. Same staff bypass as payment method.
                </p>
              </div>
            </div>
          )}

          {ledgerOn && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Minimum credit to dispatch
                  </Label>
                  <DocsHint topic="ledger-dispatch-gates" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    placeholder="Off"
                    className="max-w-[8rem]"
                    value={dispatchMinDollars}
                    disabled={rulesDisabled}
                    onChange={(e) => setDispatchMinDollars(e.target.value)}
                    onBlur={() => {
                      const parsed = parseLedgerGateDollars(dispatchMinDollars);
                      if ("error" in parsed) {
                        toast.error(parsed.error);
                        setDispatchMinDollars(
                          bookingPolicy?.dispatchMinimumBalanceCents != null
                            ? String(bookingPolicy.dispatchMinimumBalanceCents / 100)
                            : ""
                        );
                        return;
                      }
                      if ("clear" in parsed) {
                        setDispatchMinDollars("");
                        saveBookingRules({ dispatchMinimumBalanceCents: null });
                        return;
                      }
                      saveBookingRules({ dispatchMinimumBalanceCents: parsed.cents });
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Checked at ramp-out, not when they book. Leave blank to skip
                  (book gates are not re-applied). Owners and admins still
                  override; dispatchers do not, so the front desk cannot launch
                  a member who is under the floor.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Maximum owing to dispatch
                  </Label>
                  <DocsHint topic="ledger-dispatch-gates" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    placeholder="Off"
                    className="max-w-[8rem]"
                    value={dispatchMaxOwedDollars}
                    disabled={rulesDisabled}
                    onChange={(e) => setDispatchMaxOwedDollars(e.target.value)}
                    onBlur={() => {
                      const parsed = parseLedgerGateDollars(dispatchMaxOwedDollars);
                      if ("error" in parsed) {
                        toast.error(parsed.error);
                        setDispatchMaxOwedDollars(
                          bookingPolicy?.dispatchBalanceMaximumCents != null
                            ? String(bookingPolicy.dispatchBalanceMaximumCents / 100)
                            : ""
                        );
                        return;
                      }
                      if ("clear" in parsed) {
                        setDispatchMaxOwedDollars("");
                        saveBookingRules({ dispatchBalanceMaximumCents: null });
                        return;
                      }
                      saveBookingRules({ dispatchBalanceMaximumCents: parsed.cents });
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Block ramp-out once they owe more than this. Independent of the
                  self-book ceiling.
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PolicySelect({
  label,
  docs,
  hint,
  value,
  disabled,
  onValueChange,
  options,
}: {
  label: string;
  docs?: DocsTopicKey;
  hint?: string;
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
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/*
 * Presets for the shared calendar rules.
 *
 * Every value sits inside the server's own bounds (notice 15 minutes to 1 year, horizon 1
 * to 730 days, interval 15/30/60 only, fixed length 15 minutes to 24 hours, buffers 5
 * minutes to 12 hours), so no preset here can come back as a validation error. Selects
 * rather than free number inputs for the same reason: the ranges are wide, the useful
 * values are few, and a typo in a box is a rule nobody meant to set.
 */
const MAX_LENGTH_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "120", label: "2 hours" },
  { value: "180", label: "3 hours" },
  { value: "240", label: "4 hours" },
  { value: "360", label: "6 hours" },
  { value: "480", label: "8 hours" },
  { value: "720", label: "12 hours" },
];

const FIXED_LENGTH_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "30", label: "30 minutes" },
  { value: "45", label: "45 minutes" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1 hour 30 minutes" },
  { value: "120", label: "2 hours" },
  { value: "180", label: "3 hours" },
  { value: "240", label: "4 hours" },
];

/** 15, 30 and 60 are the only intervals the server accepts. */
const START_INTERVAL_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "15", label: "Every 15 minutes" },
  { value: "30", label: "Every 30 minutes" },
  { value: "60", label: "On the hour" },
];

const NOTICE_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "120", label: "2 hours" },
  { value: "240", label: "4 hours" },
  { value: "720", label: "12 hours" },
  { value: "1440", label: "24 hours" },
  { value: "2880", label: "48 hours" },
];

const HORIZON_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "365 days" },
];

/** Shared by both buffers. They are independent rules that happen to want the same list. */
const BUFFER_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "5", label: "5 minutes" },
  { value: "10", label: "10 minutes" },
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "45", label: "45 minutes" },
  { value: "60", label: "1 hour" },
];

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
