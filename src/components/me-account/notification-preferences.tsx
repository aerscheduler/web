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
import { Link } from "@tanstack/react-router";
import { DocsHint } from "@/components/docs-hint";

type PrefKey = keyof ChannelNotificationPreferences;

type PrefRow = {
  key: PrefKey;
  label: string;
  hint: string;
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
    hint: "School-wide messages from admins.",
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
    hint: "Occasional setup suggestions from AerScheduler while your school is new.",
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

export function NotificationPreferencesPanel() {
  const { roles } = useAuth();
  const prefsQ = useOrgUserPreferences();
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
  const saving = update.isPending;

  return (
    <div data-doc-shot="notification-preferences-maintenance" className="space-y-4">
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
        showAdmin={showAdmin}
        showMaintenance={showMaintenance}
        showEndorsements={showEndorsements}
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
        showAdmin={showAdmin}
        showMaintenance={showMaintenance}
        showEndorsements={showEndorsements}
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
                Verify {smsStatus.phone} to turn on text alerts for this school.
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
                    <Input
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
                    ? "Master switch for transactional texts for this school."
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
                  <PrefSection
                    channel="sms"
                    title="Reservations"
                    rows={RESERVATION_ROWS}
                    prefs={sms}
                    saving={saving}
                    onChange={(key, v) => patchPref("sms", key, v)}
                  />
                  <PrefSection
                    channel="sms"
                    title="Billing"
                    rows={BILLING_ROWS}
                    prefs={sms}
                    saving={saving}
                    onChange={(key, v) => patchPref("sms", key, v)}
                  />
                  <PrefSection
                    channel="sms"
                    title="Documents"
                    rows={DOCUMENT_ROWS}
                    prefs={sms}
                    saving={saving}
                    onChange={(key, v) => patchPref("sms", key, v)}
                  />
                  <PrefSection
                    channel="sms"
                    title="Currency"
                    rows={CURRENCY_ROWS}
                    prefs={sms}
                    saving={saving}
                    onChange={(key, v) => patchPref("sms", key, v)}
                  />
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
                  <PrefSection
                    channel="sms"
                    title="Status"
                    rows={STATUS_ROWS}
                    prefs={sms}
                    saving={saving}
                    onChange={(key, v) => patchPref("sms", key, v)}
                  />
                  <PrefSection
                    channel="sms"
                    title="Announcements"
                    rows={ANNOUNCEMENT_ROWS}
                    prefs={sms}
                    saving={saving}
                    onChange={(key, v) => patchPref("sms", key, v)}
                  />
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
  showAdmin,
  showMaintenance,
  showEndorsements,
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
  showAdmin: boolean;
  showMaintenance: boolean;
  showEndorsements: boolean;
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
            {showAdmin && (
              <PrefSection
                channel={channel}
                title="Organization"
                rows={ADMIN_ROWS}
                prefs={prefs}
                saving={saving}
                onChange={onPrefChange}
              />
            )}
            <PrefSection
              channel={channel}
              title="Reservations"
              rows={RESERVATION_ROWS}
              prefs={prefs}
              saving={saving}
              onChange={onPrefChange}
            />
            <PrefSection
              channel={channel}
              title="Billing"
              rows={BILLING_ROWS}
              prefs={prefs}
              saving={saving}
              onChange={onPrefChange}
            />
            <PrefSection
              channel={channel}
              title="Documents"
              rows={DOCUMENT_ROWS}
              prefs={prefs}
              saving={saving}
              onChange={onPrefChange}
            />
            <PrefSection
              channel={channel}
              title="Currency"
              rows={CURRENCY_ROWS}
              prefs={prefs}
              saving={saving}
              onChange={onPrefChange}
            />
            {showEndorsements && (
              <PrefSection
                channel={channel}
                title="Endorsements"
                rows={ENDORSEMENT_ROWS}
                prefs={prefs}
                saving={saving}
                onChange={onPrefChange}
              />
            )}
            {showMaintenance && (
              <PrefSection
                channel={channel}
                title="Maintenance"
                rows={MAINTENANCE_ROWS}
                prefs={prefs}
                saving={saving}
                onChange={onPrefChange}
              />
            )}
            <PrefSection
              channel={channel}
              title="Status"
              rows={STATUS_ROWS}
              prefs={prefs}
              saving={saving}
              onChange={onPrefChange}
            />
            <PrefSection
              channel={channel}
              title="Announcements"
              rows={ANNOUNCEMENT_ROWS}
              prefs={prefs}
              saving={saving}
              onChange={onPrefChange}
            />
            {/* Email only, there is no push or SMS column behind this one. */}
            {channel === "email" && (
              <PrefSection
                channel={channel}
                title="Getting started"
                rows={ONBOARDING_ROWS}
                prefs={prefs}
                saving={saving}
                onChange={onPrefChange}
              />
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
            checked={prefs?.[row.key] ?? true}
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
            body="Notification preferences are per school. Accept an invite, then you can choose what email, push, and SMS you get."
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
