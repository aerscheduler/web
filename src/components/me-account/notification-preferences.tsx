/**
 * Member notification preferences — mirrors the mobile Email Preferences screen
 * against `GET/PATCH /orgUsers/preferences`.
 */

import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isAdmin, isTechnician } from "@/lib/permissions";
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

type EmailKey = keyof ChannelNotificationPreferences;

type PrefRow = {
  key: EmailKey;
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
    hint: "When a booking you’re on is canceled.",
  },
  {
    key: "reservationCompleted",
    label: "Reservation completed",
    hint: "When a flight is reviewed / closed out.",
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

const STATUS_ROWS: PrefRow[] = [
  {
    key: "grounded",
    label: "Grounded",
    hint: "When you’re grounded or cleared to fly again.",
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
  const email = prefsQ.data?.notificationPreferences?.emailNotificationPreferences;

  const patchEmailMaster = (value: boolean) => {
    update.mutate(
      { notificationPreferences: { emailEnabled: value } },
      {
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Couldn't save notification settings"),
      }
    );
  };

  const patchEmailPref = (key: EmailKey, value: boolean) => {
    update.mutate(
      {
        notificationPreferences: {
          emailNotificationPreferences: { [key]: value },
        },
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
  const saving = update.isPending;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Bell className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm">Email</CardTitle>
          {saving && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </CardHeader>
        <CardContent className="space-y-3">
          <SwitchRow
            id="email-enabled"
            label="Email notifications"
            hint="Master switch for all email alerts below."
            checked={emailEnabled}
            disabled={saving}
            onChange={patchEmailMaster}
          />

          {!emailEnabled ? (
            <p className="text-xs text-muted-foreground">
              Turn email on to choose which events reach your inbox. Account emails
              (invites, password reset) still send.
            </p>
          ) : (
            <>
              {showAdmin && (
                <PrefSection
                  title="Organization"
                  rows={ADMIN_ROWS}
                  email={email}
                  saving={saving}
                  onChange={patchEmailPref}
                />
              )}
              <PrefSection
                title="Reservations"
                rows={RESERVATION_ROWS}
                email={email}
                saving={saving}
                onChange={patchEmailPref}
              />
              <PrefSection
                title="Billing"
                rows={BILLING_ROWS}
                email={email}
                saving={saving}
                onChange={patchEmailPref}
              />
              <PrefSection
                title="Documents"
                rows={DOCUMENT_ROWS}
                email={email}
                saving={saving}
                onChange={patchEmailPref}
              />
              <PrefSection
                title="Currency"
                rows={CURRENCY_ROWS}
                email={email}
                saving={saving}
                onChange={patchEmailPref}
              />
              {showMaintenance && (
                <PrefSection
                  title="Maintenance"
                  rows={MAINTENANCE_ROWS}
                  email={email}
                  saving={saving}
                  onChange={patchEmailPref}
                />
              )}
              <PrefSection
                title="Status"
                rows={STATUS_ROWS}
                email={email}
                saving={saving}
                onChange={patchEmailPref}
              />
              <PrefSection
                title="Announcements"
                rows={ANNOUNCEMENT_ROWS}
                email={email}
                saving={saving}
                onChange={patchEmailPref}
              />
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Push notification categories are managed in the AerScheduler mobile app.
      </p>
    </div>
  );
}

function PrefSection({
  title,
  rows,
  email,
  saving,
  onChange,
}: {
  title: string;
  rows: PrefRow[];
  email: ChannelNotificationPreferences | null | undefined;
  saving: boolean;
  onChange: (key: EmailKey, value: boolean) => void;
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
            key={row.key}
            id={`email-${row.key}`}
            label={row.label}
            hint={row.hint}
            checked={email?.[row.key] ?? true}
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
            body="Notification preferences are per school. Accept an invite, then you can choose what email you get."
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Notification settings"
        subtitle="Choose which AerScheduler emails reach your inbox."
      />
      <NotificationPreferencesPanel />
    </div>
  );
}
