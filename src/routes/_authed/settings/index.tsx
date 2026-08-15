import { createFileRoute, redirect } from "@tanstack/react-router";
import { guardRoute } from "@/lib/permissions";
import { settingsSectionsFor, settingsTabOrDefault } from "@/lib/settings-sections";
import { isEnterpriseOrg } from "@/lib/enterprise";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { RAIL_ROW, SectionRail, type RailSection } from "@/components/section-rail";
import { OrganizationTab } from "@/components/settings/organization-tab";
import { BookingPreferencesTab } from "@/components/settings/booking-preferences-tab";
import { PlanTab } from "@/components/settings/plan-tab";
import { BillingTab } from "@/components/settings/billing-tab";
import { RatesTab } from "@/components/settings/rates-tab";
import { DocumentTypesTab } from "@/components/settings/document-types-tab";
import { GroupsTab } from "@/components/settings/groups-tab";
import { CurrencyTypesTab } from "@/components/settings/currency-types-tab";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import { ApiKeysTab } from "@/components/settings/api-keys-tab";
import { CostSplittingTab } from "@/components/settings/cost-splitting-tab";
import { MembershipsTab } from "@/components/settings/memberships-tab";
import { EnterpriseUpsell } from "@/components/settings/enterprise-upsell";

type SettingsSearch = {
  tab?: string;
  qbo?: string;
};

export const Route = createFileRoute("/_authed/settings/")({
  beforeLoad: (ctx) => {
    guardRoute("/settings")();
    const qbo = typeof ctx.search.qbo === "string" ? ctx.search.qbo : undefined;
    // Legacy OAuth return URL: /settings?qbo=… → dedicated QuickBooks page.
    if (qbo) {
      throw redirect({
        to: "/settings/integrations/quickbooks",
        search: { qbo },
      });
    }
  },
  validateSearch: (s: Record<string, unknown>): SettingsSearch => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
    qbo: typeof s.qbo === "string" ? s.qbo : undefined,
  }),
  component: SettingsPage,
});

/**
 * Settings is a rail of sections and one pane, same shell as Reports.
 *
 * Grouped so related decisions sit together, school identity first, then how money moves,
 * then how this school talks to the outside world. The active section stays in `?tab=` so
 * onboarding deep links and bookmarks keep working. The section list itself lives in
 * `lib/settings-sections.ts`, because the command palette offers these as destinations.
 */
const sectionsFor = (enterprise: boolean): RailSection[] =>
  settingsSectionsFor(enterprise).map((section) => ({
    label: section.label,
    items: section.tabs,
  }));

function SettingsPage() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const active = settingsTabOrDefault(search.tab);
  const { organization } = useAuth();
  const enterprise = isEnterpriseOrg(organization);
  const sections = sectionsFor(enterprise);

  const pick = (tab: string) => {
    void navigate({ search: (prev) => ({ ...prev, tab }), replace: true });
  };

  return (
    <TableView className="gap-5">
      <TableView.Header>
        <PageHeader
          title="Settings"
          subtitle="Manage your organization, billing, and integrations"
        />
      </TableView.Header>

      <div className={RAIL_ROW}>
        <SectionRail label="Settings" sections={sections} value={active} onChange={pick} />

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {active === "organization" && <OrganizationTab />}
          {active === "booking-preferences" && <BookingPreferencesTab />}
          {active === "plan" && <PlanTab />}
          {active === "memberships" && <MembershipsTab />}
          {active === "billing" && <BillingTab />}
          {active === "cost-splitting" && <CostSplittingTab />}
          {active === "rates" && <RatesTab />}
          {active === "documents" && <DocumentTypesTab />}
          {active === "groups" && <GroupsTab />}
          {active === "currencies" && <CurrencyTypesTab />}
          {active === "integrations" && <IntegrationsTab />}
          {/* Not in the rail without Enterprise, but still reachable by deep link, so it
              answers with the offer rather than an empty pane. */}
          {active === "api-keys" && (enterprise ? <ApiKeysTab /> : <EnterpriseUpsell />)}
        </div>
      </div>
    </TableView>
  );
}
