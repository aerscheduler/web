/**
 * Member notification preferences against `GET/PATCH /orgUsers/preferences`.
 *
 * Email and push share the same category keys. Push delivery still needs the iPhone
 * app installed (device token), but the category choices themselves are no longer
 * phone-only: saving them here is what the phone reads when it registers.
 */

import type { ReactNode } from "react";
import { Bell, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isAdmin, isInstructor, isTechnician } from "@/lib/permissions";
import {
  useOrgUserPreferences,
  useUpdateOrgUserPreferences,
} from "@/features/queries";
import type { ChannelNotificationPreferences } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

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
    key: "slotOffers",
    label: "Slot offers & standby",
    hint: "Time-sensitive offers that must be accepted before the hold window closes.",
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
  const update = useUpdateOrgUserPreferences();

  const emailEnabled = prefsQ.data?.notificationPreferences?.emailEnabled ?? true;
  const pushEnabled = prefsQ.data?.notificationPreferences?.pushEnabled ?? true;
  const email = prefsQ.data?.notificationPreferences?.emailNotificationPreferences;
  const push = prefsQ.data?.notificationPreferences?.pushNotificationPreferences;

  const patchMaster = (channel: "email" | "push", value: boolean) => {
    update.mutate(
      {
        notificationPreferences:
          channel === "email" ? { emailEnabled: value } : { pushEnabled: value },
      },
      {
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Couldn't save notification settings"),
      }
    );
  };

  const patchPref = (channel: "email" | "push", key: PrefKey, value: boolean) => {
    update.mutate(
      {
        notificationPreferences:
          channel === "email"
            ? { emailNotificationPreferences: { [key]: value } }
            : { pushNotificationPreferences: { [key]: value } },
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
  channel: "email" | "push";
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
  channel: "email" | "push";
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
            body="Notification preferences are per school. Accept an invite, then you can choose what email and push you get."
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Notification settings"
        subtitle="Choose which AerScheduler emails and push alerts reach you."
      />
      <NotificationPreferencesPanel />
    </div>
  );
}
