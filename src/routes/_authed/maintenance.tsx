import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ClipboardList, Plus, Wrench } from "lucide-react";
import { toast } from "sonner";
import {
  useSquawks,
  useResolveSquawk,
  useMaintenanceReminders,
} from "@/features/queries";
import type { Squawk } from "@/types/api";
import { guardRoute } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { useConfirm } from "@/components/confirm-dialog";
import { SquawkCard } from "@/components/maintenance/squawk-card";
import { ReminderCard } from "@/components/maintenance/reminder-card";
import { LogSquawkModal } from "@/components/maintenance/log-squawk-modal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authed/maintenance")({
  beforeLoad: guardRoute("/maintenance"),
  component: MaintenancePage,
});

function MaintenancePage() {
  const [addOpen, setAddOpen] = React.useState(false);

  const logButton = (
    <Button onClick={() => setAddOpen(true)}>
      <Plus className="size-4" /> Log a squawk
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Maintenance"
        subtitle="Squawks and upcoming maintenance across the fleet."
        actions={logButton}
      />

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Open squawks</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="reminders">Reminders</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="mt-4">
          <OpenSquawksTab onLog={() => setAddOpen(true)} />
        </TabsContent>
        <TabsContent value="resolved" className="mt-4">
          <ResolvedSquawksTab />
        </TabsContent>
        <TabsContent value="reminders" className="mt-4">
          <RemindersTab />
        </TabsContent>
      </Tabs>

      <LogSquawkModal open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

/** Shared loading/error frame — keeps every tab's four states consistent. */
function TabFrame({
  isLoading,
  error,
  onRetry,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error)
    return (
      <Card className="p-0">
        <ErrorState error={error} onRetry={onRetry} />
      </Card>
    );
  return <>{children}</>;
}

function OpenSquawksTab({ onLog }: { onLog: () => void }) {
  const q = useSquawks({ resolved: false });
  const confirm = useConfirm();
  const resolve = useResolveSquawk();
  const [resolvingId, setResolvingId] = React.useState<number | null>(null);

  const squawks = q.data ?? [];

  async function onResolve(squawk: Squawk) {
    const ok = await confirm({
      title: `Resolve "${squawk.title || "this squawk"}"?`,
      description: squawk.grounding
        ? "Resolving clears this squawk. The aircraft may still need a return-to-service check."
        : "This marks the squawk as resolved.",
      confirmLabel: "Resolve",
    });
    if (!ok) return;
    setResolvingId(squawk.id);
    resolve.mutate(
      { id: squawk.id, action: "resolve" },
      {
        onSuccess: () => toast.success("Squawk resolved."),
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Couldn't resolve that squawk."),
        onSettled: () => setResolvingId(null),
      }
    );
  }

  return (
    <TabFrame isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()}>
      {squawks.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={CheckCircle2}
            title="No open squawks — the fleet's clean."
            body="Anything a pilot reports shows up here until a technician signs it off."
            action={
              <Button onClick={onLog}>
                <Plus className="size-4" /> Log a squawk
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {squawks.map((s) => (
            <SquawkCard
              key={s.id}
              squawk={s}
              onResolve={onResolve}
              resolving={resolvingId === s.id}
            />
          ))}
        </div>
      )}
    </TabFrame>
  );
}

function ResolvedSquawksTab() {
  const q = useSquawks({ resolved: true });
  const squawks = q.data ?? [];

  return (
    <TabFrame isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()}>
      {squawks.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={ClipboardList}
            title="Nothing resolved yet"
            body="Squawks you sign off will be archived here for the record."
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {squawks.map((s) => (
            <SquawkCard key={s.id} squawk={s} />
          ))}
        </div>
      )}
    </TabFrame>
  );
}

function RemindersTab() {
  const q = useMaintenanceReminders();
  const reminders = q.data ?? [];

  return (
    <TabFrame isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()}>
      {reminders.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={Wrench}
            title="No maintenance reminders"
            body="Recurring inspections and due-by items will appear here as they're scheduled."
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {reminders.map((r) => (
            <ReminderCard key={r.id} reminder={r} />
          ))}
        </div>
      )}
    </TabFrame>
  );
}
