import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { orgSlotOffersEnabled } from "@/lib/slot-offers-enabled";
import { PROFILE_TABS, PROFILE_TAB_VALUES, type ProfileTab } from "@/lib/profile-sections";
import { cn } from "@/lib/utils";
import { NARROW_PAGE } from "@/lib/page-width";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { RAIL_ROW, SectionRail, type RailSection } from "@/components/section-rail";
import { Button } from "@/components/ui/button";
import { ProfileCard } from "@/components/me-account/profile-card";
import { MechanicCertificateCard } from "@/components/me-account/mechanic-certificate-card";
import { MyMembershipCard } from "@/components/me-account/my-membership-card";
import { ContactDetailsCard } from "@/components/me-account/contact-details-card";
import { EmergencyContactsCard } from "@/components/me-account/emergency-contacts-card";
import { AppearanceCard } from "@/components/settings/appearance-card";
import { MyTimeZoneCard } from "@/components/settings/time-zone-card";
import { SecurityCard } from "@/components/me-account/security-card";
import { GoogleCalendarCard } from "@/components/me-account/google-calendar-card";
import { AvailabilityEditor } from "@/components/me-account/availability-editor";
import { StandbyPreferencesPanel } from "@/components/slot-offers/standby-preferences-panel";
import { PaymentMethodsPanel } from "@/components/me-money/payment-methods-panel";
import { LeaveOrganizationCard } from "@/components/me-account/leave-organization-card";

export const Route = createFileRoute("/_authed/me/profile")({
  // The active tab lives in the URL so it's deep-linkable (e.g. the Stripe
  // add-card return, and the redirects from the old /me/availability &
  // /me/payment-methods routes land on the right tab). Tab list is shared with
  // the command palette via `lib/profile-sections.ts`.
  validateSearch: (search: Record<string, unknown>): { tab?: ProfileTab } => {
    const t = search.tab;
    return typeof t === "string" && (PROFILE_TAB_VALUES as readonly string[]).includes(t)
      ? { tab: t as ProfileTab }
      : {};
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { roles, user, organization } = useAuth();
  const navigate = Route.useNavigate();
  const { tab } = Route.useSearch();
  const slotOffersOn = orgSlotOffersEnabled(organization);

  // Availability is only relevant to people students book against (instructors),
  // matching where it used to live in the nav. Tab list is shared with the palette.
  // Standby tab only when the school has slot offers enabled (default on).
  const visible = PROFILE_TABS.filter(
    (t) =>
      (!t.canShow || t.canShow(roles)) &&
      (t.value !== "standby" || slotOffersOn)
  );
  const allowed = new Set(visible.map((t) => t.value));
  const active: ProfileTab = tab && allowed.has(tab) ? tab : "profile";
  const sections: RailSection[] = [{ items: visible }];

  const pick = (next: string) => {
    void navigate({ search: { tab: next as ProfileTab }, replace: true });
  };

  return (
    <TableView className={cn("gap-5", NARROW_PAGE)}>
      <TableView.Header>
        <PageHeader
          title="Profile & account"
          subtitle="Manage your personal details, availability, and payment methods."
        />
      </TableView.Header>

      <div className={RAIL_ROW}>
        <SectionRail
          label="Profile & account"
          sections={sections}
          value={active}
          onChange={pick}
        />

        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto">
          {active === "profile" && (
            <>
              <ProfileCard />
              {/* Directly under who-you-are, because "what am I on and what does it cost" is
                  the first question a club member has about their own account. Renders nothing
                  when they are not on a plan. */}
              <MyMembershipCard />
              <ContactDetailsCard />
              {/* Only for the people who sign inspections off. On a student's profile it
                  would be a question they cannot answer, sitting above their emergency
                  contacts. */}
              {(roles.includes("technician") || roles.includes("admin") || roles.includes("owner")) && (
                <MechanicCertificateCard />
              )}
              <EmergencyContactsCard userId={user?.id ?? null} />
              <AppearanceCard />
              {/* Lives on the profile tab rather than its own: it's a personal preference, and
                  most people will set it once when they first travel and never look again. */}
              <MyTimeZoneCard />
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <Bell className="mt-0.5 size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Notifications</p>
                    <p className="text-xs text-muted-foreground">
                      Choose which booking, billing, and school emails and push alerts you receive.
                    </p>
                  </div>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to="/me/notifications">Manage</Link>
                </Button>
              </div>
            </>
          )}
          {active === "security" && (
            <>
              <SecurityCard />
              <LeaveOrganizationCard />
            </>
          )}
          {active === "calendar" && <GoogleCalendarCard />}
          {active === "availability" && allowed.has("availability") && <AvailabilityEditor />}
          {active === "standby" && allowed.has("standby") && <StandbyPreferencesPanel />}
          {active === "payments" && <PaymentMethodsPanel />}
        </div>
      </div>
    </TableView>
  );
}
