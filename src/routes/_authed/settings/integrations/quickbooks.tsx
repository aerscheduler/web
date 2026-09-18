import { createFileRoute } from "@tanstack/react-router";
import { guardRoute } from "@/lib/permissions";
import { QuickBooksIntegrationPage } from "@/components/integrations/quickbooks-page";

export const Route = createFileRoute("/_authed/settings/integrations/quickbooks")({
  beforeLoad: guardRoute("/settings"),
  validateSearch: (s: Record<string, unknown>): { qbo?: string; reason?: string; tab?: string } => ({
    qbo: typeof s.qbo === "string" ? s.qbo : undefined,
    ...(typeof s.reason === "string" ? { reason: s.reason } : {}),
    ...(typeof s.tab === "string" ? { tab: s.tab } : {}),
  }),
  component: QuickBooksRoute,
});

function QuickBooksRoute() {
  const { qbo, reason, tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <QuickBooksIntegrationPage
      oauthResult={qbo}
      oauthReason={reason}
      tab={tab}
      // Replace, like Settings: moving between sections is not a trip worth a Back.
      onTab={(next) => void navigate({ search: (prev) => ({ ...prev, tab: next, qbo: undefined, reason: undefined }), replace: true })}
    />
  );
}
