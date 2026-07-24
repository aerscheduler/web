import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { AvailabilityEditor } from "@/components/me-account/availability-editor";

export const Route = createFileRoute("/_authed/me/availability")({
  component: AvailabilityPage,
});

function AvailabilityPage() {
  return (
    <div>
      <PageHeader
        title="Availability"
        subtitle="Set the recurring hours students can book you against."
      />
      <AvailabilityEditor />
    </div>
  );
}
