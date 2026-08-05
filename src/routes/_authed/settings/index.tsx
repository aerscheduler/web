import type { LucideIcon } from "lucide-react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { guardRoute } from "@/lib/permissions";
import {
  BadgeDollarSign,
  Building2,
  CreditCard,
  KeyRound,
  FileCog,
  GraduationCap,
  Layers,
  Puzzle,
  ShieldCheck,
  SlidersHorizontal,
  Split,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { cn } from "@/lib/utils";

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

type SettingsTab = {
  value: string;
  label: string;
  icon: LucideIcon;
};

/**
 * Settings is a rail of sections and one pane, same shell as Reports.
 *
 * Grouped so related decisions sit together — school identity first, then how
 * money moves, then how this school talks to the outside world. The active
 * section stays in `?tab=` so onboarding deep links and bookmarks keep working.
 */
const SECTIONS: { label: string; tabs: SettingsTab[] }[] = [
  {
    label: "School",
    tabs: [
      { value: "organization", label: "Organization", icon: Building2 },
      { value: "booking-preferences", label: "Booking preferences", icon: SlidersHorizontal },
      { value: "groups", label: "Groups", icon: Layers },
      { value: "documents", label: "Document types", icon: FileCog },
    ],
  },
  {
    label: "Billing",
    tabs: [
      { value: "plan", label: "Plan", icon: BadgeDollarSign },
      { value: "billing", label: "Billing", icon: CreditCard },
      { value: "rates", label: "Instruction rates", icon: GraduationCap },
      { value: "cost-splitting", label: "Cost splitting", icon: Split },
      { value: "currencies", label: "Currency rules", icon: ShieldCheck },
    ],
  },
  {
    label: "Connections",
    tabs: [
      { value: "integrations", label: "Integrations", icon: Puzzle },
      { value: "api-keys", label: "API keys", icon: KeyRound },
    ],
  },
];

const ALL_TABS = SECTIONS.flatMap((s) => s.tabs);

function SettingsPage() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const active =
    search.tab && ALL_TABS.some((t) => t.value === search.tab) ? search.tab : "organization";

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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 lg:flex-row">
        {/* Phone: a select instead of a tall two-level list. */}
        <div className="shrink-0 lg:hidden">
          <Select value={active} onValueChange={pick}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a section" />
            </SelectTrigger>
            <SelectContent>
              {SECTIONS.map((section) => (
                <SelectGroupForSection key={section.label} section={section} />
              ))}
            </SelectContent>
          </Select>
        </div>

        <nav
          aria-label="Settings"
          className="hidden w-60 shrink-0 overflow-y-auto lg:block"
        >
          <div className="space-y-4 pr-3">
            {SECTIONS.map((section) => (
              <div key={section.label}>
                <h2 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.label}
                </h2>
                <div className="space-y-0.5">
                  {section.tabs.map((tab) => {
                    const Icon = tab.icon;
                    const selected = tab.value === active;
                    return (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => pick(tab.value)}
                        aria-current={selected ? "page" : undefined}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                          selected
                            ? "bg-muted font-medium text-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {active === "organization" && <OrganizationTab />}
          {active === "booking-preferences" && <BookingPreferencesTab />}
          {active === "plan" && <PlanTab />}
          {active === "billing" && <BillingTab />}
          {active === "cost-splitting" && <CostSplittingTab />}
          {active === "rates" && <RatesTab />}
          {active === "documents" && <DocumentTypesTab />}
          {active === "groups" && <GroupsTab />}
          {active === "currencies" && <CurrencyTypesTab />}
          {active === "integrations" && <IntegrationsTab />}
          {active === "api-keys" && <ApiKeysTab />}
        </div>
      </div>
    </TableView>
  );
}

function SelectGroupForSection({
  section,
}: {
  section: { label: string; tabs: SettingsTab[] };
}) {
  return (
    <>
      <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {section.label}
      </div>
      {section.tabs.map((t) => (
        <SelectItem key={t.value} value={t.value}>
          {t.label}
        </SelectItem>
      ))}
    </>
  );
}
