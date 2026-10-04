/**
 * Member notification preferences against `GET/PATCH /orgUsers/preferences`.
 *
 * Email, push, and SMS share the same category keys. SMS requires a verified US
 * mobile on the profile first (`GET/POST /users/sms`).
 */

import { useState, type ReactNode } from "react";
import { Bell, Loader2, MessageSquare, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isAdmin, isInstructor, isTechnician } from "@/lib/permissions";
import {
  useConfirmSmsVerification,
  useOrgUserPreferences,
  useOwnerAircraft,
  useSmsOptOut,
  useSmsStatus,
  useStartSmsVerification,
  useUpdateOrgUserPreferences,
} from "@/features/queries";
import type { ChannelNotificationPreferences } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "@tanstack/react-router";
import { DocsHint } from "@/components/docs-hint";

type PrefKey = keyof ChannelNotificationPreferences;

/** Which groups of switches this person sees. */
type Sections = {
  admin: boolean;
  /** Everything about being one of the organization's people: off for an outside owner. */
  member: boolean;
  maintenance: boolean;
  endorsements: boolean;
  shop: PrefRow[] | null;
  owner: PrefRow[] | null;
  maintenanceRows: PrefRow[];
};

type PrefRow = {
  key: PrefKey;
  label: string;
  hint: string;
  /** What an unset switch means, where it is not simply on. */
  defaultOn?: boolean;
};

const RESERVATION_ROWS: PrefRow[] = [
  {
    key: "reservationCreated",
    label: "Reservation created",
    hint: "When someone books you on a flight or lesson.",
  },
  {
    key: "reservationUpdated",
    label: "Reservation updated",
    hint: "Time, aircraft, or crew changes on your bookings.",
  },
  {
    key: "reservationCanceled",
    label: "Reservation canceled",
    hint: "When a booking you're on is canceled.",
  },
  {
    key: "reservationCompleted",
    label: "Reservation completed",
    hint: "When a flight is reviewed / closed out.",
  },
  {
    key: "reservationReviewReminders",
    label: "Review reminders",
    hint: "Nudges to ramp in or close out a past booking.",
  },
  {
    key: "slotOffers",
    label: "Offers & standby",
    hint: "Time-sensitive offers that must be accepted before the offer window closes.",
  },
  {
    key: "bookingRequests",
    label: "Booking requests",
    hint: "When a member submits a request for approval, or when your request is approved or declined.",
  },
];

const BILLING_ROWS: PrefRow[] = [
  {
    key: "reservationInvoiceReceived",
    label: "Invoice received",
    hint: "When a new invoice is issued to you.",
  },
  {
    key: "reservationInvoicePaid",
    label: "Invoice paid",
    hint: "Confirmation after a successful payment.",
  },
  {
    key: "reservationInvoiceReminders",
    label: "Payment reminders",
    hint: "Nudges when an invoice is still unpaid.",
  },
  {
    key: "reservationInvoiceDeclined",
    label: "Payment declined",
    hint: "When a card charge fails.",
  },
];

const DOCUMENT_ROWS: PrefRow[] = [
  {
    key: "userDocumentReminders",
    label: "Document expirations",
    hint: "Medical, certificate, and other docs nearing expiry.",
  },
];

const CURRENCY_ROWS: PrefRow[] = [
  {
    key: "currencyReminders",
    label: "Currency expirations",
    hint: "Flight-review and other currency warnings.",
  },
];

const ENDORSEMENT_ROWS: PrefRow[] = [
  {
    key: "endorsementReminders",
    label: "Endorsement expirations",
    hint: "Solo and other timed sign-offs your students are about to lose.",
  },
];

const STATUS_ROWS: PrefRow[] = [
  {
    key: "grounded",
    label: "Grounded",
    hint: "When you're grounded or cleared to fly again.",
  },
];

const ANNOUNCEMENT_ROWS: PrefRow[] = [
  {
    key: "announcements",
    label: "Organization announcements",
    hint: "Organization-wide messages from admins.",
  },
];

/**
 * Email only. This is the one category that comes from AerScheduler rather than
 * from the school, and there is no push or SMS column behind it, so it is
 * rendered in the email section alone.
 */
const ONBOARDING_ROWS: PrefRow[] = [
  {
    key: "onboardingTips",
    label: "Getting started tips",
    hint: "Occasional setup suggestions from AerScheduler while your organization is new.",
  },
];

const ADMIN_ROWS: PrefRow[] = [
  {
    key: "joinedOrganization",
    label: "Member joined",
    hint: "When someone joins your organization.",
  },
];

const MAINTENANCE_ROWS: PrefRow[] = [
  {
    key: "maintenanceReminders",
    label: "Maintenance reminders",
    hint: "Aircraft inspection and due-item reminders.",
  },
];

const MAINTENANCE_ROWS_WITH_SHOP: PrefRow[] = [
  {
    key: "maintenanceReminders",
    label: "Maintenance reminders",
    hint: "Aircraft inspection and due-item reminders. Which customer aircraft is set under Customer aircraft inspections.",
  },
];

/**
 * The maintenance shop, for technicians (and admins who want them). `noTechnicians`: the
 * organization has no signed-in technicians, so the server has its admins hear new requests
 * until they turn it off.
 */
function shopRows(technician: boolean, noTechnicians: boolean): PrefRow[] {
  return [
    {
      key: "shopRequests",
      label: "New requests",
      hint: technician
        ? "When an aircraft owner asks for work."
        : noTechnicians
          ? "When an aircraft owner asks for work. On for admins while the organization has no technicians."
          : "When an aircraft owner asks for work. Off for admins until you turn it on.",
      defaultOn: technician || noTechnicians,
    },
    // Only a technician can be put on a job, so only a technician has jobs to hear about.
    ...(technician
      ? [
          {
            key: "shopJobActivity" as PrefKey,
            label: "Activity on my jobs",
            hint: "When you're put on a job, and when its owner answers, adds photos or updates the times.",
          },
        ]
      : []),
  ];
}

/** An aircraft owner's own aircraft. */
function ownerRows(withInspections: boolean): PrefRow[] {
  return [
    {
      key: "ownerJobUpdates",
      label: "Work on my aircraft",
      hint: "What the shop finds and sends you, and when your aircraft is booked in, arrives, is ready, or its date moves.",
    },
    ...(withInspections
      ? [
          {
            key: "maintenanceReminders" as PrefKey,
            label: "Inspection reminders",
            hint: "30 and 7 days before an inspection is due, when it is due, and overdue; 10 hours before and when due.",
          },
        ]
      : []),
  ];
}

type InspectionScope = "worked_on" | "all" | "off";

const SCOPE_LABEL: Record<InspectionScope, string> = {
  worked_on: "Aircraft I've worked on",
  all: "All customer aircraft",
  off: "Off",
};

/** Read-only facts the server adds for the shop's settings (GET /orgUsers/preferences). */
type ShopFacts = {
  /** Signed-in technicians exist. With none, admins hear new requests by default. */
  hasTechnicians?: boolean;
  /** The customer-inspection scope the server uses for this person: theirs, or their role's default here. */
  effectiveCustomerInspectionScope?: InspectionScope;
};

export function NotificationPreferencesPanel() {
  const { roles, outsideOwner } = useAuth();
  const prefsQ = useOrgUserPreferences();
  const ownedQ = useOwnerAircraft();
  const smsQ = useSmsStatus();
  const update = useUpdateOrgUserPreferences();
  const startVerify = useStartSmsVerification();
  const confirmVerify = useConfirmSmsVerification();
  const optOut = useSmsOptOut();
  const [otp, setOtp] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);

  const emailEnabled = prefsQ.data?.notificationPreferences?.emailEnabled ?? true;
  const pushEnabled = prefsQ.data?.notificationPreferences?.pushEnabled ?? true;
  const smsEnabled = prefsQ.data?.notificationPreferences?.smsEnabled ?? false;
  const email = prefsQ.data?.notificationPreferences?.emailNotificationPreferences;
  const push = prefsQ.data?.notificationPreferences?.pushNotificationPreferences;
  const sms = prefsQ.data?.notificationPreferences?.smsNotificationPreferences;
  const smsStatus = smsQ.data;
  const smsVerified = Boolean(smsStatus?.smsPhoneVerifiedAt && smsStatus?.smsOptedInAt);
  const smsEligible = Boolean(smsStatus?.eligible);

  const patchMaster = (channel: "email" | "push" | "sms", value: boolean) => {
    update.mutate(
      {
        notificationPreferences:
          channel === "email"
            ? { emailEnabled: value }
            : channel === "push"
              ? { pushEnabled: value }
              : { smsEnabled: value },
      },
      {
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Couldn't save notification settings"),
      }
    );
  };

  const patchPref = (channel: "email" | "push" | "sms", key: PrefKey, value: boolean) => {
    update.mutate(
      {
        notificationPreferences:
          channel === "email"
            ? { emailNotificationPreferences: { [key]: value } }
            : channel === "push"
              ? { pushNotificationPreferences: { [key]: value } }
              : { smsNotificationPreferences: { [key]: value } },
      },
      {
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Couldn't save notification settings"),
      }
    );
  };

  if (prefsQ.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading notification settings…
      </div>
    );
  }

  if (prefsQ.isError || !prefsQ.data) {
    return <ErrorState error={prefsQ.error} onRetry={() => void prefsQ.refetch()} />;
  }

  const showAdmin = isAdmin(roles);
  const showMaintenance = isAdmin(roles) || isTechnician(roles);
  const showEndorsements = isAdmin(roles) || isInstructor(roles);
  // An aircraft owner from outside the organization hears only about their aircraft and bills.
  const member = !outsideOwner;
  const showShop = member && prefsQ.data.runsShop === true && showMaintenance;
  // Only an aircraft the shop looks after for them: nothing on this list fires for a leaseback.
  const showOwner = outsideOwner || (ownedQ.data ?? []).some((a) => a.use === "shop");
  const facts = prefsQ.data as typeof prefsQ.data & ShopFacts;
  const technician = isTechnician(roles);
  const noTechnicians = facts.hasTechnicians === false;
  const sections: Sections = {
    admin: showAdmin,
    member,
    maintenance: showMaintenance,
    endorsements: showEndorsements,
    shop: showShop ? shopRows(technician, noTechnicians) : null,
    maintenanceRows: showShop ? MAINTENANCE_ROWS_WITH_SHOP : MAINTENANCE_ROWS,
    owner: showOwner ? ownerRows(!showMaintenance) : null,
  };
  // Set: what they chose. Unset: what the server does for them here (their role's default, which
  // for an admin of a shop with no technicians is All), shown as the trigger's text with nothing
  // selected, so picking any option, the one shown included, saves it.
  const storedScope = prefsQ.data.notificationPreferences?.customerInspectionScope ?? null;
  const effectiveScope: InspectionScope =
    storedScope ?? facts.effectiveCustomerInspectionScope ?? (technician ? "worked_on" : noTechnicians ? "all" : "off");
  const saving = update.isPending;

  return (
    <div data-doc-shot="notification-preferences-maintenance" className="space-y-4">
      {showShop && (
        <Card data-doc-shot="notification-preferences-shop">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Customer aircraft inspections</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 basis-64 text-xs text-muted-foreground">
              Which customers' aircraft you hear about when an inspection comes due. An aircraft nobody here has worked on
              goes to everybody whose setting is not Off.
              {!technician && noTechnicians
                ? " While the organization has no technicians, admins hear about every customer aircraft unless they turn this off."
                : !technician && storedScope == null
                  ? " Off for admins until you pick one."
                  : ""}{" "}
              How you hear follows Maintenance reminders below.
            </p>
            <Select
              value={storedScope ?? ""}
              onValueChange={(v) =>
                update.mutate(
                  { notificationPreferences: { customerInspectionScope: v as InspectionScope } },
                  { onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save notification settings") }
                )
              }
              disabled={saving}
            >
              {/* Unset reads like a value, not a muted placeholder: it is what happens today. */}
              <SelectTrigger className="w-60 data-[placeholder]:text-foreground" aria-label="Customer aircraft inspections">
                <SelectValue placeholder={SCOPE_LABEL[effectiveScope]} />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SCOPE_LABEL) as InspectionScope[]).map((v) => (
                  <SelectItem key={v} value={v}>
                    {SCOPE_LABEL[v]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}
      <ChannelCard
        channel="email"
        title="Email"
        icon={<Bell className="size-4 text-muted-foreground" />}
        masterId="email-enabled"
        masterLabel="Email notifications"
        masterHint="Master switch for all email alerts below."
        offHint="Turn email on to choose which events reach your inbox. Account emails (invites, password reset) still send."
        enabled={emailEnabled}
        prefs={email}
        saving={saving}
        sections={sections}
        onMasterChange={(v) => patchMaster("email", v)}
        onPrefChange={(key, v) => patchPref("email", key, v)}
        shotId="me-notifications"
      />

      <ChannelCard
        channel="push"
        title="Push"
        icon={<Smartphone className="size-4 text-muted-foreground" />}
        masterId="push-enabled"
        masterLabel="Push notifications"
        masterHint="Master switch for alerts on your phone. Delivery needs the AerScheduler iOS app installed."
        offHint="Turn push on to choose which events alert your phone. Delivery still needs the iOS app signed in on a device."
        enabled={pushEnabled}
        prefs={push}
        saving={saving}
        sections={sections}
        onMasterChange={(v) => patchMaster("push", v)}
        onPrefChange={(key, v) => patchPref("push", key, v)}
        shotId="me-notifications-push"
      />

      {smsStatus?.available === true ? (
      <Card data-doc-shot="me-notifications-sms">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <MessageSquare className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm">SMS</CardTitle>
          {(saving || smsQ.isFetching) && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            SMS alerts are available for <span className="font-medium text-foreground">US mobile numbers only</span>.
            Other countries need local numbers we do not offer yet. Message and data rates may apply. Reply STOP to
            cancel anytime; reply HELP for help.
          </p>

          {!smsStatus?.phone ? (
            <p className="text-xs text-muted-foreground">
              Add a US mobile on your{" "}
              <Link to="/me/profile" className="underline underline-offset-2">
                profile
              </Link>{" "}
              before enabling SMS.
            </p>
          ) : !smsVerified ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Verify {smsStatus.phone} to turn on text alerts for this organization.
              </p>
              {!awaitingCode ? (
                <Button
                  size="sm"
                  disabled={startVerify.isPending}
                  onClick={() => {
                    startVerify.mutate(undefined, {
                      onSuccess: () => {
                        setAwaitingCode(true);
                        toast.success("Code sent. Check your texts.");
                      },
                      onError: (err) =>
                        toast.error(err instanceof ApiError ? err.message : "Couldn't send the code"),
                    });
                  }}
                >
                  {startVerify.isPending ? "Sending…" : "Send verification code"}
                </Button>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="sms-otp">6-digit code</Label>
                    <Input placeholder="123456"
                      id="sms-otp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="w-36"
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={confirmVerify.isPending || otp.length < 6}
                    onClick={() => {
                      confirmVerify.mutate(otp, {
                        onSuccess: () => {
                          setOtp("");
                          setAwaitingCode(false);
                          toast.success("Phone verified. You can turn on SMS below.");
                          void smsQ.refetch();
                        },
                        onError: (err) =>
                          toast.error(err instanceof ApiError ? err.message : "Couldn't verify that code"),
                      });
                    }}
                  >
                    {confirmVerify.isPending ? "Checking…" : "Verify"}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              <SwitchRow
                id="sms-enabled"
                label="SMS notifications"
                hint={
                  smsEligible
                    ? "Master switch for transactional texts for this organization."
                    : smsStatus.reason === "opted_out" || smsStatus.smsDisabledReason === "user_stop"
                      ? "You opted out. Reply START to your last AerScheduler text, then verify again here."
                      : "SMS is paused for this number. Re-verify or update your mobile on your profile."
                }
                checked={smsEnabled}
                disabled={saving || !smsEligible}
                onChange={(v) => {
                  if (!v) {
                    patchMaster("sms", false);
                    return;
                  }
                  patchMaster("sms", true);
                }}
              />
              {smsEnabled && smsEligible && (
                <>
                  {showAdmin && (
                    <PrefSection
                      channel="sms"
                      title="Organization"
                      rows={ADMIN_ROWS}
                      prefs={sms}
                      saving={saving}
                      onChange={(key, v) => patchPref("sms", key, v)}
                    />
                  )}
                  {member && (
                    <PrefSection
                      channel="sms"
                      title="Reservations"
                      rows={RESERVATION_ROWS}
                      prefs={sms}
                      saving={saving}
                      onChange={(key, v) => patchPref("sms", key, v)}
                    />
                  )}
                  <PrefSection
                    channel="sms"
                    title="Billing"
                    rows={BILLING_ROWS}
                    prefs={sms}
                    saving={saving}
                    onChange={(key, v) => patchPref("sms", key, v)}
                  />
                  {member && (
                    <PrefSection
                      channel="sms"
                      title="Documents"
                      rows={DOCUMENT_ROWS}
                      prefs={sms}
                      saving={saving}
                      onChange={(key, v) => patchPref("sms", key, v)}
                    />
                  )}
                  {member && (
                    <PrefSection
                      channel="sms"
                      title="Currency"
                      rows={CURRENCY_ROWS}
                      prefs={sms}
                      saving={saving}
                      onChange={(key, v) => patchPref("sms", key, v)}
                    />
                  )}
                  {showEndorsements && (
                    <PrefSection
                      channel="sms"
                      title="Endorsements"
                      rows={ENDORSEMENT_ROWS}
                      prefs={sms}
                      saving={saving}
                      onChange={(key, v) => patchPref("sms", key, v)}
                    />
                  )}
                  {showMaintenance && (
                    <PrefSection
                      channel="sms"
                      title="Maintenance"
                      rows={MAINTENANCE_ROWS}
                      prefs={sms}
                      saving={saving}
                      onChange={(key, v) => patchPref("sms", key, v)}
                    />
                  )}
                  {member && (
                    <PrefSection
                      channel="sms"
                      title="Status"
                      rows={STATUS_ROWS}
                      prefs={sms}
                      saving={saving}
                      onChange={(key, v) => patchPref("sms", key, v)}
                    />
                  )}
                  {member && (
                    <PrefSection
                      channel="sms"
                      title="Announcements"
                      rows={ANNOUNCEMENT_ROWS}
                      prefs={sms}
                      saving={saving}
                      onChange={(key, v) => patchPref("sms", key, v)}
                    />
                  )}
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={optOut.isPending}
                onClick={() => {
                  optOut.mutate(undefined, {
                    onSuccess: () => {
                      patchMaster("sms", false);
                      toast.success("Opted out of SMS.");
                    },
                    onError: (err) =>
                      toast.error(err instanceof ApiError ? err.message : "Couldn't opt out"),
                  });
                }}
              >
                Opt out of SMS
              </Button>
            </>
          )}
        </CardContent>
      </Card>
      ) : null}
    </div>
  );
}

function ChannelCard({
  channel,
  title,
  icon,
  masterId,
  masterLabel,
  masterHint,
  offHint,
  enabled,
  prefs,
  saving,
  sections,
  onMasterChange,
  onPrefChange,
  shotId,
}: {
  channel: "email" | "push" | "sms";
  title: string;
  icon: ReactNode;
  masterId: string;
  masterLabel: string;
  masterHint: string;
  offHint: string;
  enabled: boolean;
  prefs: ChannelNotificationPreferences | null | undefined;
  saving: boolean;
  sections: Sections;
  onMasterChange: (value: boolean) => void;
  onPrefChange: (key: PrefKey, value: boolean) => void;
  shotId: string;
}) {
  return (
    <Card data-doc-shot={shotId}>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        {icon}
        <CardTitle className="text-sm">{title}</CardTitle>
        {saving && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </CardHeader>
      <CardContent className="space-y-3">
        <SwitchRow
          id={masterId}
          label={masterLabel}
          hint={masterHint}
          checked={enabled}
          disabled={saving}
          onChange={onMasterChange}
        />

        {!enabled ? (
          <p className="text-xs text-muted-foreground">{offHint}</p>
        ) : (
          <>
            {sections.admin && (
              <PrefSection channel={channel} title="Organization" rows={ADMIN_ROWS} prefs={prefs} saving={saving} onChange={onPrefChange} />
            )}
            {sections.member && (
              <PrefSection channel={channel} title="Reservations" rows={RESERVATION_ROWS} prefs={prefs} saving={saving} onChange={onPrefChange} />
            )}
            <PrefSection channel={channel} title="Billing" rows={BILLING_ROWS} prefs={prefs} saving={saving} onChange={onPrefChange} />
            {sections.owner && (
              <PrefSection channel={channel} title="Your aircraft" rows={sections.owner} prefs={prefs} saving={saving} onChange={onPrefChange} />
            )}
            {sections.member && (
              <>
                <PrefSection channel={channel} title="Documents" rows={DOCUMENT_ROWS} prefs={prefs} saving={saving} onChange={onPrefChange} />
                <PrefSection channel={channel} title="Currency" rows={CURRENCY_ROWS} prefs={prefs} saving={saving} onChange={onPrefChange} />
              </>
            )}
            {sections.endorsements && (
              <PrefSection channel={channel} title="Endorsements" rows={ENDORSEMENT_ROWS} prefs={prefs} saving={saving} onChange={onPrefChange} />
            )}
            {sections.maintenance && (
              <PrefSection channel={channel} title="Maintenance" rows={sections.maintenanceRows} prefs={prefs} saving={saving} onChange={onPrefChange} />
            )}
            {sections.shop && (
              <PrefSection channel={channel} title="Maintenance shop" rows={sections.shop} prefs={prefs} saving={saving} onChange={onPrefChange} />
            )}
            {sections.member && (
              <>
                <PrefSection channel={channel} title="Status" rows={STATUS_ROWS} prefs={prefs} saving={saving} onChange={onPrefChange} />
                <PrefSection channel={channel} title="Announcements" rows={ANNOUNCEMENT_ROWS} prefs={prefs} saving={saving} onChange={onPrefChange} />
              </>
            )}
            {/* Email only, there is no push or SMS column behind this one. */}
            {channel === "email" && sections.member && (
              <PrefSection channel={channel} title="Getting started" rows={ONBOARDING_ROWS} prefs={prefs} saving={saving} onChange={onPrefChange} />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PrefSection({
  channel,
  title,
  rows,
  prefs,
  saving,
  onChange,
}: {
  channel: "email" | "push" | "sms";
  title: string;
  rows: PrefRow[];
  prefs: ChannelNotificationPreferences | null | undefined;
  saving: boolean;
  onChange: (key: PrefKey, value: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <Separator />
      <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="space-y-2">
        {rows.map((row) => (
          <SwitchRow
            key={`${channel}-${row.key}`}
            id={`${channel}-${row.key}`}
            label={row.label}
            hint={row.hint}
            checked={prefs?.[row.key] ?? row.defaultOn ?? true}
            disabled={saving}
            onChange={(value) => onChange(row.key, value)}
          />
        ))}
      </div>
    </div>
  );
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="mt-0.5"
      />
    </div>
  );
}

/** Full-page wrapper used by `/me/notifications`. */
export function NotificationPreferencesPage() {
  const { organization } = useAuth();

  if (organization === null) {
    return (
      <div>
        <PageHeader title="Notification settings" />
        <Card>
          <EmptyState
            icon={Bell}
            title="Join an organization first"
            body="Notification preferences are per organization. Accept an invite, then you can choose what email, push, and SMS you get."
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Notification settings"
        subtitle="Choose which AerScheduler emails, push alerts, and SMS texts reach you."
        actions={<DocsHint topic="notification-preferences" />}
      />
      <NotificationPreferencesPanel />
    </div>
  );
}
