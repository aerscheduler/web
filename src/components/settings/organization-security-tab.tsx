import { ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { DeleteOrganizationCard } from "@/components/settings/delete-organization-card";

/**
 * Separates actions that affect the organization's ongoing access or existence from
 * its day-to-day profile and operational preferences.
 */
export function OrganizationSecurityTab() {
  const { organization } = useAuth();
  const deletionScheduled = organization?.scheduledDeletionAt != null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
            <ShieldCheck className="size-4" />
          </span>
          <div>
            <CardTitle>Organization security</CardTitle>
            <CardDescription>
              Sensitive actions that affect your organization and its members.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {deletionScheduled
              ? "An admin or owner can cancel the scheduled deletion before the 30-day countdown ends."
              : "No deletion is currently scheduled. Only an owner can schedule organization deletion."}
          </p>
        </CardContent>
      </Card>

      <DeleteOrganizationCard />
    </div>
  );
}
