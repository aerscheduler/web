import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ClipboardList, Plus, Wrench } from "lucide-react";
import {
  useSquawks,
  useMaintenanceReminders,
} from "@/features/queries";
import { resourceLabel, type Squawk } from "@/types/api";
import { guardRoute } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { ListSearch, matchesSearch } from "@/components/list-search";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { SquawkCard } from "@/components/maintenance/squawk-card";
import { ReminderCard } from "@/components/maintenance/reminder-card";
import { LogSquawkModal } from "@/components/maintenance/log-squawk-modal";
import { ResolveSquawkModal } from "@/components/maintenance/resolve-squawk-modal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authed/maintenance")({
  beforeLoad: guardRoute("/maintenance"),
  component: MaintenancePage,
});

const tabPanelClass =
  "mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden";

function MaintenancePage() {
  const [addOpen, setAddOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const logButton = (
    <Button onClick={() => setAddOpen(true)}>
      <Plus className="size-4" /> Log a squawk
    </Button>
  );

  return (
    <TableView>
      <Tabs defaultValue="open" className="flex min-h-0 flex-1 flex-col gap-4">
        <TableView.Header>
          <PageHeader
            title="Maintenance"
            subtitle="Squawks and upcoming maintenance across the fleet."
            actions={logButton}
          />
          <TabsList>
            <TabsTrigger value="open">Open squawks</TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
            <TabsTrigger value="reminders">Reminders</TabsTrigger>
          </TabsList>
          <ListSearch
            value={search}
            onChange={setSearch}
            placeholder="Search squawks or reminders…"
            aria-label="Search maintenance"
          />
        </TableView.Header>

        <TabsContent value="open" className={tabPanelClass}>
          <OpenSquawksTab onLog={() => setAddOpen(true)} search={search} />
        </TabsContent>
        <TabsContent value="resolved" className={tabPanelClass}>
          <ResolvedSquawksTab search={search} />
        </TabsContent>
        <TabsContent value="reminders" className={tabPanelClass}>
          <RemindersTab search={search} />
        </TabsContent>
      </Tabs>

      <LogSquawkModal open={addOpen} onOpenChange={setAddOpen} />
    </TableView>
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
  if (isLoading)
    return (
      <TableView.Body>
        <CardGridSkeleton count={3} />
      </TableView.Body>
    );
  if (error)
    return (
      <Card className="min-h-0 flex-1 p-0">
        <ErrorState error={error} onRetry={onRetry} />
      </Card>
    );
  return <>{children}</>;
}

function OpenSquawksTab({ onLog, search }: { onLog: () => void; search: string }) {
  const q = useSquawks({ resolved: false });
  // Resolving needs a completion date (and optionally notes), so it opens a
  // form rather than a yes/no confirm — see ResolveSquawkModal.
  const [resolving, setResolving] = React.useState<Squawk | null>(null);

  const squawks = React.useMemo(
    () =>
      (q.data ?? []).filter((s) =>
        matchesSearch(
          [s.title, s.description, s.resource ? resourceLabel(s.resource).name : null],
          search
        )
      ),
    [q.data, search]
  );
  const empty = (q.data ?? []).length === 0;

  return (
    <TabFrame isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()}>
      {empty ? (
        <Card className="min-h-0 flex-1 p-0">
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
      ) : squawks.length === 0 ? (
        <Card className="min-h-0 flex-1 p-0">
          <EmptyState
            icon={ClipboardList}
            title="No matches"
            body="Nothing matches that search."
          />
        </Card>
      ) : (
        <TableView.Body>
          <div className="space-y-2.5">
            {squawks.map((s) => (
              <SquawkCard
                key={s.id}
                squawk={s}
                onResolve={setResolving}
                resolving={resolving?.id === s.id}
              />
            ))}
          </div>
        </TableView.Body>
      )}

      <ResolveSquawkModal
        squawk={resolving}
        open={resolving != null}
        onOpenChange={(o) => !o && setResolving(null)}
      />
    </TabFrame>
  );
}

function ResolvedSquawksTab({ search }: { search: string }) {
  const q = useSquawks({ resolved: true });
  const squawks = React.useMemo(
    () =>
      (q.data ?? []).filter((s) =>
        matchesSearch(
          [s.title, s.description, s.resource ? resourceLabel(s.resource).name : null],
          search
        )
      ),
    [q.data, search]
  );
  const empty = (q.data ?? []).length === 0;

  return (
    <TabFrame isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()}>
      {empty ? (
        <Card className="min-h-0 flex-1 p-0">
          <EmptyState
            icon={ClipboardList}
            title="Nothing resolved yet"
            body="Squawks you sign off will be archived here for the record."
          />
        </Card>
      ) : squawks.length === 0 ? (
        <Card className="min-h-0 flex-1 p-0">
          <EmptyState
            icon={ClipboardList}
            title="No matches"
            body="Nothing matches that search."
          />
        </Card>
      ) : (
        <TableView.Body>
          <div className="space-y-2.5">
            {squawks.map((s) => (
              <SquawkCard key={s.id} squawk={s} />
            ))}
          </div>
        </TableView.Body>
      )}
    </TabFrame>
  );
}

function RemindersTab({ search }: { search: string }) {
  const q = useMaintenanceReminders();
  const reminders = React.useMemo(
    () =>
      (q.data ?? []).filter((r) =>
        matchesSearch(
          [r.name, r.description, r.resource ? resourceLabel(r.resource).name : null],
          search
        )
      ),
    [q.data, search]
  );
  const empty = (q.data ?? []).length === 0;

  return (
    <TabFrame isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()}>
      {empty ? (
        <Card className="min-h-0 flex-1 p-0">
          <EmptyState
            icon={Wrench}
            title="No maintenance reminders"
            body="Recurring inspections and due-by items will appear here as they're scheduled."
          />
        </Card>
      ) : reminders.length === 0 ? (
        <Card className="min-h-0 flex-1 p-0">
          <EmptyState
            icon={Wrench}
            title="No matches"
            body="Nothing matches that search."
          />
        </Card>
      ) : (
        <TableView.Body>
          <div className="space-y-2.5">
            {reminders.map((r) => (
              <ReminderCard key={r.id} reminder={r} />
            ))}
          </div>
        </TableView.Body>
      )}
    </TabFrame>
  );
}
