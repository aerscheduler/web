import { format, isPast } from "date-fns";
import { CalendarClock, PlaneTakeoff } from "lucide-react";
import { resourceLabel } from "@/types/api";
import type { MaintenanceReminder } from "@/types/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ReminderCard({ reminder }: { reminder: MaintenanceReminder }) {
  const aircraft = reminder.resource ? resourceLabel(reminder.resource).name : null;
  const due = reminder.dueAt ? new Date(reminder.dueAt) : null;
  const overdue = due != null && reminder.resolvedAt == null && isPast(due);

  return (
    <Card className="flex items-start gap-3 p-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{reminder.name || "Maintenance reminder"}</span>
          {overdue && <Badge variant="danger">Overdue</Badge>}
        </div>
        {reminder.description && (
          <p className="text-sm text-muted-foreground">{reminder.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {aircraft && (
            <span className="inline-flex items-center gap-1">
              <PlaneTakeoff className="size-3.5" /> {aircraft}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3.5" />
            {due ? `Due ${format(due, "MMM d, yyyy")}` : "No due date"}
          </span>
        </div>
      </div>
    </Card>
  );
}
