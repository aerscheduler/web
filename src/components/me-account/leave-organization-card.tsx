import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useLeaveOrganization } from "@/features/queries";
import { ApiError } from "@/lib/api";
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

/**
 * Leave the school you are currently in.
 *
 * `POST /organizations/leave/:orgId` has always existed, and only the iPhone app called
 * it. The console could switch and join, but not leave, so our own help page told people
 * to download the app to resign from a school.
 *
 * WHY THE NAME HAS TO BE TYPED. Leaving is not recoverable from this chair: you need an
 * invite or the join code again. A confirm dialog alone is the wrong weight of gesture.
 * The server also refuses when you are the sole admin or sole owner; that refusal is
 * surfaced as it comes back.
 *
 * After a successful leave the session is still pinned to the org you left, so we sign
 * out (same as the iPhone sheet). Join again from /join if you have another school.
 */
export function LeaveOrganizationCard() {
  const { organization, logout } = useAuth();
  const navigate = useNavigate();
  const leave = useLeaveOrganization();
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");

  if (!organization) return null;

  const name = organization.name ?? "";
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();

  async function confirm() {
    if (!organization) return;
    try {
      await leave.mutateAsync(organization.id);
      toast.success(`Left ${name || "the organization"}`);
      logout();
      await navigate({ to: "/login" });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't leave the organization");
    }
  }

  return (
    <Card className="border-destructive/40" data-doc-shot="leave-organization-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <LogOut className="size-4" /> Leave this school
        </CardTitle>
        <CardDescription>
          Remove yourself from {name || "this organization"}. Your flight and billing
          history stays with the school. You will need an invite or the join code to come
          back.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Leave organization
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          You cannot leave if you are the only owner or the only admin.
        </p>
      </CardContent>

      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setTyped("");
        }}
      >
        <AlertDialogContent data-doc-shot="leave-organization-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave {name.trim()}?</AlertDialogTitle>
            <AlertDialogDescription>
              You lose access immediately. Bookings, invoices and training records that
              mention you stay with the school.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="leave-org-confirm">
              Type <span className="font-medium text-foreground">{name}</span> to confirm
            </Label>
            <Input
              id="leave-org-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              placeholder={name}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={leave.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!matches || leave.isPending}
              className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30"
              onClick={(e) => {
                e.preventDefault();
                void confirm();
              }}
            >
              {leave.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Leaving…
                </>
              ) : (
                "Leave school"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
