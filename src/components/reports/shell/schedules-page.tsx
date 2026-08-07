/**
 * Every scheduled report in one place.
 *
 * Schedules are otherwise reachable only through the saved view they belong to,
 * which is fine at two and unusable at six — there is no way to answer "what is
 * this school emailing out, and to whom" without opening every view in turn.
 * That question matters most for the reports nobody is checking.
 *
 * The failure state is the reason this page earns its keep. A schedule that has
 * stopped working is invisible by construction: nobody notices an email that
 * didn't arrive. So `lastError` is given a row of its own rather than a tooltip,
 * and a paused schedule is visibly paused rather than just absent from an inbox.
 */

import { useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  Loader2,
  Mail,
  MoreVertical,
  Pencil,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/states";
import { useConfirm } from "@/components/confirm-dialog";
import {
  useDeleteSchedule,
  useReportSchedules,
  useReportTimeZone,
  useSendScheduleNow,
  useUpdateSchedule,
} from "@/features/reports";
import { useOrgUsers } from "@/features/queries";
import { describeCoverage, describeSchedule } from "@/types/schedules";
import type { ReportSchedule } from "@/types/schedules";
import { zoneAbbreviation } from "@/lib/timezone";
import { ScheduleDialog } from "./schedule-dialog";
import { cn } from "@/lib/utils";

export function SchedulesPage() {
  const schedules = useReportSchedules();
  const members = useOrgUsers();
  const update = useUpdateSchedule();
  const remove = useDeleteSchedule();
  const sendNow = useSendScheduleNow();
  const timeZone = useReportTimeZone();
  const confirm = useConfirm();

  const [editing, setEditing] = useState<ReportSchedule | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);

  const nameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of members.data ?? []) {
      map.set(m.id, m.user?.name ?? m.user?.email ?? "Someone");
    }
    return map;
  }, [members.data]);

  const list = schedules.data ?? [];
  const zoneLabel = zoneAbbreviation(new Date(), timeZone);

  const describeRecipients = (schedule: ReportSchedule): string => {
    const inside = schedule.recipientOrgUserIds.map((id) => nameById.get(id)).filter(Boolean) as string[];
    const parts: string[] = [];
    if (inside.length <= 3) parts.push(...inside);
    else parts.push(`${inside.slice(0, 2).join(", ")} and ${inside.length - 2} more`);
    // Outside addresses are named in full rather than counted: an address
    // receiving the school's revenue every week is exactly the thing an owner
    // should be able to read at a glance.
    parts.push(...schedule.recipientEmails);
    return parts.join(", ") || "Nobody";
  };

  const destroy = async (schedule: ReportSchedule) => {
    const ok = await confirm({
      title: "Stop sending this report?",
      description: `"${schedule.reportView?.name ?? "This report"}" will no longer be emailed. The saved view is kept.`,
      confirmLabel: "Stop sending",
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(schedule.id);
      toast.success("Schedule removed");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not remove it");
    }
  };

  const test = async (schedule: ReportSchedule) => {
    setSendingId(schedule.id);
    try {
      await sendNow.mutateAsync(schedule.id);
      toast.success("Sent — check your inbox");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not send it");
    } finally {
      setSendingId(null);
    }
  };

  if (schedules.isLoading) {
    return <div className="h-64 animate-pulse rounded-lg bg-muted" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Scheduled reports</h2>
        <p className="text-sm text-muted-foreground">
          What this school emails out, to whom, and when it last went.
          {zoneLabel && ` Times are ${zoneLabel} at your school.`}
        </p>
      </div>

      {list.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={CalendarClock}
            title="Nothing scheduled yet"
            body="Open a report, save it as a view, then use the clock icon beside it to have it emailed on a cadence."
          />
        </Card>
      ) : (
        <div className="space-y-3" data-doc-shot="reports-schedules-page">
          {list.map((schedule) => (
            <Card
              key={schedule.id}
              className={cn("p-4", !schedule.isEnabled && "bg-muted/30")}
              // Only the failing card, so the documentation's crop selector picks
              // out the one card that article is about. Inert.
              data-doc-shot={schedule.lastError ? "schedule-card-failed" : undefined}
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-foreground">
                      {schedule.reportView?.name ?? "Deleted view"}
                    </p>
                    {schedule.reportName && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {schedule.reportName}
                      </span>
                    )}
                    {!schedule.isEnabled && (
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        Paused
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {describeSchedule(schedule)} · {describeCoverage(schedule.cadence).toLowerCase()}
                  </p>

                  <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                    <Mail className="mt-0.5 size-3.5 shrink-0" />
                    <span className="min-w-0">{describeRecipients(schedule)}</span>
                  </p>

                  {/* Given its own line: a schedule failing quietly is the whole
                      reason this page exists. */}
                  {schedule.lastError ? (
                    <p className="mt-2 flex items-start gap-1.5 text-sm text-destructive">
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                      <span>Last send failed — {schedule.lastError}</span>
                    </p>
                  ) : schedule.lastRunAt ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Last sent {new Date(schedule.lastRunAt).toLocaleString()}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">Not sent yet.</p>
                  )}
                </div>

                {schedule.isMine && (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={schedule.isEnabled}
                      aria-label={schedule.isEnabled ? "Pause this schedule" : "Resume this schedule"}
                      disabled={update.isPending}
                      onCheckedChange={(isEnabled) =>
                        update
                          .mutateAsync({ id: schedule.id, isEnabled })
                          .catch((err: any) => toast.error(err?.message ?? "Could not change that"))
                      }
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          {sendingId === schedule.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <MoreVertical className="size-4" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditing(schedule)}>
                          <Pencil className="size-3.5" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => test(schedule)}>
                          <Send className="size-3.5" /> Send now
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => destroy(schedule)}
                          className="text-destructive"
                        >
                          <Trash2 className="size-3.5" /> Stop sending
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>

              {!schedule.isMine && schedule.createdByName && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Set up by {schedule.createdByName}. Only they or an admin can change it.
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {editing?.reportView && (
        <ScheduleDialog
          key={editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          view={{ id: editing.reportView.id, name: editing.reportView.name }}
        />
      )}
    </div>
  );
}
