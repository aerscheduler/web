import * as React from "react";
import { Pencil, Phone, Plus, Star, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { DocsHint } from "@/components/docs-hint";

import {
  useAddResourceOwner,
  useRemoveResourceOwner,
  useResourceOwners,
  useUpdateResourceOwner,
} from "@/features/queries";
import type { OwnerConflict, Resource, ResourceOwner } from "@/types/api";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CardEmpty, CardSkeleton } from "@/components/detail/detail-page";
import { useConfirm } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Who owns this aircraft.
 *
 * Three different people show up here and the panel treats them the same, because to the
 * shop they are the same thing: somebody to call about this aeroplane. A leaseback owner
 * who also rents here, a partner in a co-owned plane, and a customer who walked in with a
 * 172 and has no account at all.
 *
 * The last one is the interesting case. Adding them creates a membership that is marked as
 * an outside party and left unclaimed: they go on the roster so they can be invoiced and
 * so their aircraft's history has somebody attached to it, they get none of the school's
 * notifications, and they cannot sign in. An invoice the shop sends them DOES reach them:
 * Stripe mails it to the address typed here, which is why that address can now be
 * corrected, and why the form checks it.
 */
export function ResourceOwners({ resource, canManage }: { resource: Resource; canManage: boolean }) {
  const q = useResourceOwners(resource.id);
  const [adding, setAdding] = React.useState(false);
  const owners = q.data ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-1.5">
          <CardTitle>Owners</CardTitle>
          <DocsHint topic="customer-aircraft-owners" />
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add owner
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {q.isPending ? (
          <CardSkeleton rows={2} />
        ) : q.isError ? (
          <CardEmpty>Couldn&apos;t load owners.</CardEmpty>
        ) : owners.length === 0 ? (
          <CardEmpty>
            {resource.use === "shop"
              ? "Nobody is listed as the owner of this aircraft yet. Add one so the work has somebody to bill."
              : "This aircraft belongs to the organization. Add an owner if it is a leaseback or somebody else's aeroplane."}
          </CardEmpty>
        ) : (
          owners.map((o) => <OwnerRow key={o.id} owner={o} resourceId={resource.id} canManage={canManage} />)
        )}
      </CardContent>

      <AddOwnerDialog resourceId={resource.id} open={adding} onOpenChange={setAdding} hasOwners={owners.length > 0} />
    </Card>
  );
}

function OwnerRow({
  owner,
  resourceId,
  canManage,
}: {
  owner: ResourceOwner;
  resourceId: number;
  canManage: boolean;
}) {
  const confirm = useConfirm();
  const remove = useRemoveResourceOwner(resourceId);
  const update = useUpdateResourceOwner(resourceId);
  const [editing, setEditing] = React.useState(false);
  const name = owner.orgUser.user.name ?? "Unnamed owner";
  const phone = owner.orgUser.phone;
  // The real address for somebody who has not claimed their membership; the one on their
  // login is a synthetic placeholder that goes nowhere, so it is never shown.
  const contact = owner.orgUser.contactEmail ?? (owner.orgUser.claimedAt ? owner.orgUser.user.email : null);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <UserRound className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {/* Their page: contact details, every aircraft they own here, their invoices.
                Reachable from People too, but this is where somebody working on the
                aeroplane is standing when they want it. */}
            <Link
              to="/people/$orgUserId"
              params={{ orgUserId: String(owner.orgUser.id) }}
              className="truncate font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              {name}
            </Link>
            {owner.isPrimary && <Badge variant="secondary">Billed</Badge>}
            {owner.orgUser.external && !owner.orgUser.claimedAt && (
              <Badge variant="outline" title="On your roster, cannot sign in. Only invoices you send reach them.">
                Not signed up
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {[owner.title, contact].filter(Boolean).join(" · ") || (phone ? null : "No contact details")}
          </p>
          {/*
            A tel: link, because the reason technicians can see this panel at all is that
            ringing the owner about what the annual turned up is the job. The number used
            to be stored and never shown.
          */}
          {phone && (
            <a
              href={`tel:${phone.replace(/[^\d+]/g, "")}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Phone className="size-3" />
              {phone}
            </a>
          )}
        </div>
      </div>

      {canManage && (
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" title="Edit this owner" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
          </Button>
          {!owner.isPrimary && (
            <Button
              size="sm"
              variant="ghost"
              title="Send this aircraft's invoices to this owner"
              onClick={() =>
                update.mutate(
                  { ownerId: owner.id, isPrimary: true },
                  {
                    onSuccess: () => toast.success(`${name} will be billed for work on this aircraft`),
                    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update owner"),
                  }
                )
              }
            >
              <Star className="size-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            title="Remove this owner"
            onClick={async () => {
              const ok = await confirm({
                title: `Remove ${name} as an owner?`,
                // Says what does NOT happen, because that is the part people worry about.
                description:
                  "They stay on your roster with their invoices and history. Only the link to this aircraft is removed.",
                confirmLabel: "Remove",
                destructive: true,
              });
              if (!ok) return;
              remove.mutate(owner.id, {
                onSuccess: () => toast.success(`${name} removed`),
                onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't remove owner"),
              });
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
      {canManage && (
        <EditOwnerDialog owner={owner} resourceId={resourceId} open={editing} onOpenChange={setEditing} />
      )}
    </div>
  );
}

function AddOwnerDialog({
  resourceId,
  open,
  onOpenChange,
  hasOwners,
}: {
  resourceId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasOwners: boolean;
}) {
  const add = useAddResourceOwner(resourceId);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [showErrors, setShowErrors] = React.useState(false);
  const [conflict, setConflict] = React.useState<{ message: string; conflict: OwnerConflict } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setEmail("");
    setPhone("");
    setTitle("");
    setShowErrors(false);
    setConflict(null);
  }, [open]);

  // Editing the address after a conflict is a new question; the old answer no longer applies.
  React.useEffect(() => setConflict(null), [email]);

  const nameError = !name.trim() ? "An owner needs a name" : null;
  // Enough to catch the obvious typo before the server does. The server checks too.
  const emailError =
    email.trim() && !/^[^\s@,;:<>"'\\]+@[^\s@,;:<>"'\\]+\.[a-z]{2,}$/i.test(email.trim())
      ? "That email address doesn't look right"
      : null;

  const done = (who: string) => {
    toast.success(`${who} added as an owner`);
    onOpenChange(false);
  };
  const failed = (err: unknown) => toast.error(err instanceof Error ? err.message : "Couldn't add owner");

  const send = (extra: { createAnyway?: boolean } = {}) =>
    add.mutate(
      {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        title: title.trim() || undefined,
        // The first owner is the one who gets the bill, because an aircraft with owners
        // and nobody to invoice is a work order that cannot be finished.
        isPrimary: !hasOwners,
        ...extra,
      },
      {
        onSuccess: () => done(name.trim()),
        onError: (err) => {
          //A 409 is not a failure, it is a question: somebody already holds this address.
          //The server used to answer it silently, merging two people on a shared address
          //or duplicating a member who already flies here.
          if (err instanceof ApiError && err.status === 409) {
            const body = err.body as { message?: string; conflict?: OwnerConflict } | undefined;
            if (body?.conflict) {
              setConflict({ message: body.message ?? err.message, conflict: body.conflict });
              return;
            }
          }
          failed(err);
        },
      }
    );

  const pickExisting = (orgUserId: number, who: string) =>
    add.mutate(
      { orgUserId, title: title.trim() || undefined, isPrimary: !hasOwners },
      { onSuccess: () => done(who), onError: failed }
    );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameError || emailError) {
      setShowErrors(true);
      return;
    }
    send();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an owner</DialogTitle>
        </DialogHeader>
        <form id="add-owner-form" onSubmit={submit} className="space-y-4" autoComplete="off">
          <div className="space-y-1.5">
            <Label htmlFor="owner-name">Name</Label>
            <Input
              id="owner-name"
              autoFocus
              placeholder="Dale Whitcomb"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={showErrors && !!nameError}
            />
            {showErrors && nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="owner-email">Email</Label>
              <Input
                id="owner-email"
                type="email"
                placeholder="owner@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={showErrors && !!emailError}
              />
              {showErrors && emailError && <p className="text-xs text-destructive">{emailError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="owner-phone">Phone</Label>
              <Input
                id="owner-phone"
                placeholder="555-0142"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="owner-title">Role</Label>
            <Input
              id="owner-title"
              placeholder="Owner, co-owner, operator…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          {conflict && (
            <div role="alert" className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
              <p>{conflict.message}</p>
              <div className="flex flex-wrap gap-2">
                {conflict.conflict.kind !== "archived" && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={add.isPending}
                    onClick={() => pickExisting(conflict.conflict.orgUserId, conflict.conflict.name)}
                  >
                    Use {conflict.conflict.name}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={add.isPending}
                  onClick={() => send({ createAnyway: true })}
                >
                  Add {name.trim() || "them"} as a new person
                </Button>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            They go on your roster so you can invoice them and keep this aircraft&apos;s history together. They
            won&apos;t get your organization&apos;s notifications or be able to sign in, but invoices you send them go to
            this email address.
          </p>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="add-owner-form" disabled={add.isPending}>
            {add.isPending ? "Adding…" : "Add owner"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Correct an owner.
 *
 * For somebody the shop wrote down, that is their name, address and phone. Those used to
 * be impossible to fix from anywhere: the server accepted a role and the billed flag and
 * nothing else, so a typo in the address was permanent, every invoice kept going to it,
 * and re-adding the owner with the right address minted a second person.
 *
 * For a member who owns an aeroplane (a leaseback), only their ROLE on this aircraft is
 * editable here. Their name and contact details are theirs, changed from their own
 * profile; the desk rewriting a member's login address from an aircraft page would be a
 * quiet way to take over their account, and the server refuses it.
 */
function EditOwnerDialog({
  owner,
  resourceId,
  open,
  onOpenChange,
}: {
  owner: ResourceOwner;
  resourceId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateResourceOwner(resourceId);
  const isOutsideParty = owner.orgUser.external && !owner.orgUser.claimedAt;
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [showErrors, setShowErrors] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(owner.orgUser.user.name ?? "");
    setEmail(owner.orgUser.contactEmail ?? "");
    setPhone(owner.orgUser.phone ?? "");
    setTitle(owner.title ?? "");
    setShowErrors(false);
  }, [open, owner]);

  const nameError = isOutsideParty && !name.trim() ? "An owner needs a name" : null;
  const emailError =
    isOutsideParty && email.trim() && !/^[^\s@,;:<>"'\\]+@[^\s@,;:<>"'\\]+\.[a-z]{2,}$/i.test(email.trim())
      ? "That email address doesn't look right"
      : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameError || emailError) {
      setShowErrors(true);
      return;
    }
    update.mutate(
      {
        ownerId: owner.id,
        title: title.trim() || null,
        ...(isOutsideParty
          ? { name: name.trim(), email: email.trim() || null, phone: phone.trim() || null }
          : {}),
      },
      {
        onSuccess: () => {
          toast.success("Owner updated");
          onOpenChange(false);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't update owner"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit owner</DialogTitle>
        </DialogHeader>
        <form id={`edit-owner-${owner.id}`} onSubmit={submit} className="space-y-4" autoComplete="off">
          {isOutsideParty ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor={`edit-owner-name-${owner.id}`}>Name</Label>
                <Input placeholder="Walter Brenner"
                  id={`edit-owner-name-${owner.id}`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={showErrors && !!nameError}
                />
                {showErrors && nameError && <p className="text-xs text-destructive">{nameError}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`edit-owner-email-${owner.id}`}>Email</Label>
                  <Input placeholder="owner@example.com"
                    id={`edit-owner-email-${owner.id}`}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={showErrors && !!emailError}
                  />
                  {showErrors && emailError && <p className="text-xs text-destructive">{emailError}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`edit-owner-phone-${owner.id}`}>Phone</Label>
                  <Input placeholder="(208) 555-0142" id={`edit-owner-phone-${owner.id}`} value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {owner.orgUser.user.name ?? "This owner"} is a member of your organization, so their name and contact details
              are changed from their own profile.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`edit-owner-title-${owner.id}`}>Role</Label>
            <Input
              id={`edit-owner-title-${owner.id}`}
              placeholder="Owner, co-owner, operator…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          {isOutsideParty && (
            <p className="text-xs text-muted-foreground">
              This corrects them everywhere, including on any other aircraft they own and on invoices you send them from
              now on.
            </p>
          )}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={`edit-owner-${owner.id}`} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
