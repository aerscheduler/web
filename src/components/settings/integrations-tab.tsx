import { BookOpenCheck, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { canManageBillingSettings } from "@/lib/permissions";
import {
  IntegrationCatalogCard,
  integrationStatusBadge,
} from "@/components/integrations/integration-shell";
import { useQuickBooksSettings } from "@/features/queries";

/**
 * Org-level integrations catalog. Each card opens a dedicated provider page
 * (`/settings/integrations/:id`) that uses IntegrationPageShell.
 * Personal integrations (e.g. Google Calendar) stay on Profile.
 */
export function IntegrationsTab() {
  const { roles } = useAuth();
  const isOwner = canManageBillingSettings(roles);
  const settings = useQuickBooksSettings({ enabled: isOwner });

  return (
    <div className="flex w-full flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Connect accounting and other school-wide tools. Each integration has its own setup
        page.
      </p>

      <IntegrationCatalogCard
        to="/settings/integrations/quickbooks"
        icon={BookOpenCheck}
        iconClassName="bg-emerald-600"
        title="QuickBooks Online"
        description="Sync paid invoices to QuickBooks as Sales Receipts."
        status={
          !isOwner ? (
            integrationStatusBadge("disconnected")
          ) : settings.isLoading ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            integrationStatusBadge(settings.data?.status ?? "disconnected")
          )
        }
      />
    </div>
  );
}
