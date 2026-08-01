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
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrganizationTab } from "@/components/settings/organization-tab";
import { PlanTab } from "@/components/settings/plan-tab";
import { BillingTab } from "@/components/settings/billing-tab";
import { RatesTab } from "@/components/settings/rates-tab";
import { DocumentTypesTab } from "@/components/settings/document-types-tab";
import { GroupsTab } from "@/components/settings/groups-tab";
import { CurrencyTypesTab } from "@/components/settings/currency-types-tab";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import { ApiKeysTab } from "@/components/settings/api-keys-tab";

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

const TABS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "organization", label: "Organization", icon: Building2 },
  { value: "plan", label: "Plan", icon: BadgeDollarSign },
  { value: "billing", label: "Billing", icon: CreditCard },
  { value: "rates", label: "Instruction rates", icon: GraduationCap },
  { value: "documents", label: "Document types", icon: FileCog },
  { value: "groups", label: "Groups", icon: Layers },
  { value: "currencies", label: "Currency rules", icon: ShieldCheck },
  { value: "integrations", label: "Integrations", icon: Puzzle },
  { value: "api-keys", label: "API keys", icon: KeyRound },
];

function SettingsPage() {
  const search = Route.useSearch();
  const initialTab =
    search.tab && TABS.some((t) => t.value === search.tab) ? search.tab : "organization";

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manage your organization, billing, and integrations"
      />

      <Tabs key={initialTab} defaultValue={initialTab} className="gap-4">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="w-full justify-start sm:w-fit">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                  <Icon className="size-4" />
                  <span className="hidden sm:inline">{t.label}</span>
                  <span className="sm:hidden">{t.label.split(" ")[0]}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="organization">
          <OrganizationTab />
        </TabsContent>
        <TabsContent value="plan">
          <PlanTab />
        </TabsContent>
        <TabsContent value="billing">
          <BillingTab />
        </TabsContent>
        <TabsContent value="rates">
          <RatesTab />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentTypesTab />
        </TabsContent>
        <TabsContent value="groups">
          <GroupsTab />
        </TabsContent>
        <TabsContent value="currencies">
          <CurrencyTypesTab />
        </TabsContent>
        <TabsContent value="integrations" className="w-full">
          <IntegrationsTab />
        </TabsContent>

        <TabsContent value="api-keys" className="w-full">
          <ApiKeysTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
