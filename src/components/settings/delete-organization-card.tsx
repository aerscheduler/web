import * as React from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  useCancelOrganizationDeletion,
  useDeleteOrganization,
} from "@/features/queries";
import { ApiError } from "@/lib/api";
import { DocsHint } from "@/components/docs-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function formatDeletionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Schedule or cancel deletion of the school.
 *
 * OWNER schedules via `DELETE /organizations` (30-day countdown). ADMIN or OWNER
 * cancels via `POST /organizations/cancelDeletion`. The school stays usable until
 * the countdown ends; every admin and owner is emailed and notified in-app.
 *
 * WHY THE NAME HAS TO BE TYPED (when scheduling). After 30 days nothing is
 * recoverable: the row goes, and every booking, invoice, training record and
 * document goes with it. Typing the name cannot be done by accident.
 *
 * The server refuses scheduling while any invoice is unpaid, which is money owed
 * to a real business, so that refusal is surfaced as it comes back.
 */
export function DeleteOrganizationCard() {
  const { organization, roles, rehydrate } = useAuth();
  const schedule = useDeleteOrganization();
  const cancel = useCancelOrganizationDeletion();
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");

  if (!organization) return null;

  const isOwner = roles.includes("owner");
  const isAdmin = roles.includes("admin") || isOwner;
  const scheduledAt = organization.scheduledDeletionAt ?? null;
  const isScheduled = !!scheduledAt;

  //Owners schedule. Admins (and owners) cancel. Anyone else never sees this card.
  if (!isScheduled && !isOwner) return null;
  if (isScheduled && !isAdmin) return null;

  const name = organization.name ?? "";
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();

  async function confirmSchedule() {
    try {
      await schedule.mutateAsync();
      await rehydrate();
      setOpen(false);
      setTyped("");
      toast.success("Deletion scheduled. You have 30 days to cancel.");
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Couldn't schedule organization deletion"
      );
    }
  }

  async function confirmCancel() {
    try {
      await cancel.mutateAsync();
      await rehydrate();
      toast.success("Deletion cancelled. Your school stays on AerScheduler.");
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Couldn't cancel organization deletion"
      );
    }
  }

  if (isScheduled && scheduledAt) {
    return (
      <Card className="border-amber-500/50" data-doc-shot="cancel-organization-deletion-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <TriangleAlert className="size-4" /> Deletion scheduled
            <DocsHint topic="delete-organization" />
          </CardTitle>
          <CardDescription>
            {name || "This organization"} is scheduled to be permanently deleted on{" "}
            <span className="font-medium text-foreground">
              {formatDeletionDate(scheduledAt)}
            </span>
            . Until then everything keeps working. Any admin or owner can cancel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="default"
            disabled={cancel.isPending}
            onClick={() => void confirmCancel()}
          >
            {cancel.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Cancelling…
              </>
            ) : (
              "Cancel deletion"
            )}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Cancelling clears the countdown. Nothing has been deleted yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <TriangleAlert className="size-4" /> Delete this organization
          <DocsHint topic="delete-organization" />
        </CardTitle>
        <CardDescription>
          Schedules {name || "this organization"} for permanent deletion in 30 days.
          Bookings, invoices, training records, documents and every member&rsquo;s access
          are removed when the countdown ends. Until then the school keeps working, and
          any admin or owner can cancel.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete organization
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Only an owner can schedule this, and only once every invoice is settled.
        </p>
      </CardContent>

      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setTyped("");
        }}
      >
        <AlertDialogContent data-doc-shot="delete-organization-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Schedule deletion of {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The school will be permanently deleted in 30 days. Until then everything
              keeps working, and any admin or owner can cancel from this page. Every
              admin and owner will be emailed.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="delete-org-confirm">
              Type <span className="font-medium text-foreground">{name}</span> to confirm
            </Label>
            <Input
              id="delete-org-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              placeholder={name}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={schedule.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!matches || schedule.isPending}
              onClick={(e) => {
                //The dialog closes itself on action, which would unmount this before the
                //request finished and lose the error message the server sends back.
                e.preventDefault();
                void confirmSchedule();
              }}
            >
              {schedule.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Scheduling…
                </>
              ) : (
                "Schedule deletion"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
