import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, CreditCard, KeyRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { OrganizationBillingSettings } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/utils";

export const Route = createFileRoute("/_authed/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { organization } = useAuth();
  const billing = useQuery({
    queryKey: ["org-billing"],
    queryFn: () => api<OrganizationBillingSettings>("/organizations/billing"),
  });

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Organization profile and billing"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
              <Building2 className="size-4" />
            </span>
            <CardTitle>Organization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <Row label="Name" value={organization?.name ?? "—"} />
            <Row label="Type" value={organization?.organizationType ?? "Flight school"} />
            <Row
              label="Join code"
              value={
                organization?.code ? (
                  <span className="inline-flex items-center gap-1.5 font-mono">
                    <KeyRound className="size-3.5 text-muted-foreground" />
                    {organization.code}
                  </span>
                ) : (
                  "—"
                )
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
              <CreditCard className="size-4" />
            </span>
            <CardTitle>Billing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {billing.isLoading ? (
              <div className="space-y-3 py-1">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            ) : billing.isError || !billing.data ? (
              <p className="py-3 text-sm text-muted-foreground">
                Billing settings are unavailable for this organization.
              </p>
            ) : (
              <>
                <Row
                  label="Payments"
                  value={
                    billing.data.stripeEnabled ? (
                      <Badge variant="success">Stripe connected</Badge>
                    ) : (
                      <Badge variant="outline">Not connected</Badge>
                    )
                  }
                />
                <Row
                  label="Service fee"
                  value={
                    billing.data.serviceFeePercent != null
                      ? `${(billing.data.serviceFeePercent / 100).toLocaleString()}%`
                      : "—"
                  }
                />
                <Row
                  label="Default instructor rate"
                  value={`${formatMoney(billing.data.defaultInstructorRate)}/hr`}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Editing organization settings from the web console is coming soon. For now,
        changes are made in the mobile app.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}
