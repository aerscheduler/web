import { createFileRoute } from "@tanstack/react-router";
import { guardRoute } from "@/lib/permissions";
import { QuickBooksIntegrationPage } from "@/components/integrations/quickbooks-page";

export const Route = createFileRoute("/_authed/settings/integrations/quickbooks")({
  beforeLoad: guardRoute("/settings"),
  validateSearch: (s: Record<string, unknown>) => ({
    qbo: typeof s.qbo === "string" ? s.qbo : undefined,
  }),
  component: QuickBooksRoute,
});

function QuickBooksRoute() {
  const { qbo } = Route.useSearch();
  return <QuickBooksIntegrationPage oauthResult={qbo} />;
}
