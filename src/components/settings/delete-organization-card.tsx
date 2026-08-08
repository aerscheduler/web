import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useDeleteOrganization } from "@/features/queries";
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
 * Delete the school.
 *
 * OWNER ONLY, AND THE LAST THING THE CONSOLE COULD NOT DO.
 *
 * `DELETE /organizations` has always existed behind `isOrgOwner`, and the iPhone app has
 * always offered it. The console did not, so our own help page listed "Delete the
 * organization (iOS app only)" among an owner's powers: an owner who had never installed
 * the app could not close their own school, and the honest answer to "how do I leave" was
 * "download an iPhone app".
 *
 * WHY THE NAME HAS TO BE TYPED. Nothing here is recoverable and nothing is soft-deleted:
 * the row goes, and every booking, invoice, training record and document goes with it. A
 * confirm dialog with a red button is the wrong weight of gesture for that, because the
 * muscle memory that dismisses a dialog is the same muscle memory that would destroy a
 * school. Typing the name cannot be done by accident.
 *
 * The server refuses while any invoice is unpaid, which is money owed to a real business,
 * so that refusal is surfaced as it comes back rather than being predicted here.
 */
export function DeleteOrganizationCard() {
  const { organization, roles, logout } = useAuth();
  const navigate = useNavigate();
  const remove = useDeleteOrganization();
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");

  //Owners only, mirroring `isOrgOwner` on the endpoint. An admin who could see this would
  //be looking at a button that can only ever 403.
  if (!organization || !roles.includes("owner")) return null;

  const name = organization.name ?? "";
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();

  async function confirm() {
    try {
      await remove.mutateAsync();
      toast.success("Organization deleted");
      //The session is pinned to an org that no longer exists, so staying signed in would
      //leave every request answering against a dead id.
      logout();
      await navigate({ to: "/login" });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't delete the organization");
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <TriangleAlert className="size-4" /> Delete this school
        </CardTitle>
        <CardDescription>
          Permanently deletes {name || "this organization"} and everything in it: bookings,
          invoices, training records, documents and every member&rsquo;s access. This cannot
          be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete organization
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Only an owner can do this, and only once every invoice is settled.
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
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Everything belonging to this school goes with it, and there is no way to get it
              back. Your members lose their access immediately.
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
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!matches || remove.isPending}
              onClick={(e) => {
                //The dialog closes itself on action, which would unmount this before the
                //request finished and lose the error message the server sends back.
                e.preventDefault();
                void confirm();
              }}
            >
              {remove.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Deleting…
                </>
              ) : (
                "Delete forever"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
