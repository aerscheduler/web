import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, Clock, CreditCard, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { isInstructor } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ProfileCard } from "@/components/me-account/profile-card";
import { MyTimeZoneCard } from "@/components/settings/time-zone-card";
import { SecurityCard } from "@/components/me-account/security-card";
import { GoogleCalendarCard } from "@/components/me-account/google-calendar-card";
import { AvailabilityEditor } from "@/components/me-account/availability-editor";
import { PaymentMethodsPanel } from "@/components/me-money/payment-methods-panel";
import { SignOutButton } from "@/components/me-account/sign-out-button";

const TABS = ["profile", "security", "calendar", "availability", "payments"] as const;
type ProfileTab = (typeof TABS)[number];

export const Route = createFileRoute("/_authed/me/profile")({
  // The active tab lives in the URL so it's deep-linkable (e.g. the Stripe
  // add-card return, and the redirects from the old /me/availability &
  // /me/payment-methods routes land on the right tab).
  validateSearch: (search: Record<string, unknown>): { tab?: ProfileTab } => {
    const t = search.tab;
    return typeof t === "string" && (TABS as readonly string[]).includes(t)
      ? { tab: t as ProfileTab }
      : {};
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { roles } = useAuth();
  const navigate = Route.useNavigate();
  const { tab } = Route.useSearch();
  const instructor = isInstructor(roles);

  // Availability is only relevant to people students book against (instructors),
  // matching where it used to live in the nav.
  const allowed = new Set<ProfileTab>([
    "profile",
    "security",
    "calendar",
    "payments",
    ...(instructor ? (["availability"] as ProfileTab[]) : []),
  ]);
  const active: ProfileTab = tab && allowed.has(tab) ? tab : "profile";

  return (
    <div>
      <PageHeader
        title="Profile & account"
        subtitle="Manage your personal details, availability, and payment methods."
      />

      <Tabs
        value={active}
        onValueChange={(v) => navigate({ search: { tab: v as ProfileTab }, replace: true })}
        className="gap-4"
      >
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="profile" className="gap-1.5">
            <UserRound className="size-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5">
            <ShieldCheck className="size-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5">
            <CalendarClock className="size-4" />
            Calendar
          </TabsTrigger>
          {instructor && (
            <TabsTrigger value="availability" className="gap-1.5">
              <Clock className="size-4" />
              Availability
            </TabsTrigger>
          )}
          <TabsTrigger value="payments" className="gap-1.5">
            <CreditCard className="size-4" />
            Payment methods
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <ProfileCard />
          {/* Lives on the profile tab rather than its own: it's a personal preference, and
              most people will set it once when they first travel and never look again. */}
          <MyTimeZoneCard />
        </TabsContent>
        <TabsContent value="security">
          <SecurityCard />
        </TabsContent>
        <TabsContent value="calendar">
          <GoogleCalendarCard />
        </TabsContent>
        {instructor && (
          <TabsContent value="availability">
            <AvailabilityEditor />
          </TabsContent>
        )}
        <TabsContent value="payments">
          <PaymentMethodsPanel />
        </TabsContent>
      </Tabs>

      <Separator className="my-5" />

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Sign out</p>
          <p className="text-xs text-muted-foreground">End your session on this device.</p>
        </div>
        <SignOutButton />
      </div>
    </div>
  );
}
