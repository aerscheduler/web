import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authed/compliance")({
  component: CompliancePage,
});

function CompliancePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Go / No-Go"
        subtitle="Who and what can't fly right now — expired medicals, flight reviews, currencies, and grounded aircraft."
      />
      <p className="text-sm text-muted-foreground">Compliance board coming online…</p>
    </div>
  );
}
