import type { LucideIcon } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, CreditCard, GraduationCap, Puzzle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrganizationTab } from "@/components/settings/organization-tab";
import { BillingTab } from "@/components/settings/billing-tab";
import { RatesTab } from "@/components/settings/rates-tab";
import { IntegrationsTab } from "@/components/settings/integrations-tab";

export const Route = createFileRoute("/_authed/settings")({
  component: SettingsPage,
});

const TABS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "organization", label: "Organization", icon: Building2 },
  { value: "billing", label: "Billing", icon: CreditCard },
  { value: "rates", label: "Instruction rates", icon: GraduationCap },
  { value: "integrations", label: "Integrations", icon: Puzzle },
];

function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manage your organization, billing, and integrations"
      />

      <Tabs defaultValue="organization" className="gap-6">
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
        <TabsContent value="billing">
          <BillingTab />
        </TabsContent>
        <TabsContent value="rates">
          <RatesTab />
        </TabsContent>
        <TabsContent value="integrations">
          <IntegrationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
