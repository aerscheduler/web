import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAdTracking, useSetAdTracking } from "@/features/queries";
import { PreferenceToggle } from "@/components/settings/parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Settings, Airworthiness Directives: one switch (2026-10-17).
 *
 * It was four choices (Not here, I track them here, Find them for me, Somewhere else) and a
 * "What we could match" panel grading each aircraft on serial numbers. Only Find them for me
 * changed anything, and the library matches by make and model, never by serial, so the panel
 * graded something nothing used. What is missing on an aircraft is said on its ADs tab.
 *
 * Off by default, and saved the moment it is flipped, as every other preference toggle here.
 */
export function AdTrackingTab() {
  const q = useAdTracking();
  const save = useSetAdTracking();
  const enabled = save.isPending && save.variables ? save.variables.enabled : !!q.data?.enabled;

  async function toggle(next: boolean) {
    try {
      await save.mutateAsync({ enabled: next });
      toast.success(next ? "AerScheduler will find the ADs for your aircraft." : "AD finding is off.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that.");
    }
  }

  return (
    <Card data-doc-shot="ad-tracking-switch">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" />
          Airworthiness Directives
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <PreferenceToggle
            label="Find the ADs for our aircraft"
            docs="ad-tracking-mode"
            description="Lists every AD in the library that names each aircraft's make and model, engine or propeller, for an owner, admin or technician to decide. Alerts when a new one is published."
            checked={enabled}
            saving={save.isPending}
            onCheckedChange={(next) => void toggle(next)}
          />
        )}
        {enabled && (
          <p className="text-xs text-muted-foreground">
            They are under{" "}
            <Link to="/maintenance" search={{ view: "ads" }} className="font-medium text-foreground underline underline-offset-2">
              Maintenance, Fleet ADs
            </Link>{" "}
            and on each aircraft&rsquo;s ADs tab. AerScheduler never decides that an AD applies or does not; a person does.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
