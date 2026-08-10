import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  useDeleteEmergencyContact,
  useEmergencyContacts,
  useSaveEmergencyContact,
} from "@/features/queries";
import type { EmergencyContact } from "@/types/api";
import { formatPhone, formatPhoneAsTyped, looksValid, telHref } from "@/lib/phone";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveModal } from "@/components/responsive-modal";
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
 * Who to call about this person in an emergency.
 *
 * A list rather than a fixed pair of fields, because schools routinely record two, a
 * spouse and a parent, and a student under 18 may have more. The primary one is what a
 * dispatcher reads first, so it sorts to the top and is badged.
 *
 * `userId` is a prop rather than read from auth, so this same card serves both "my own"
 * and, later, a staff member editing somebody else's from the person page. The server
 * decides whether the caller may write; `readOnly` only controls whether the buttons are
 * offered.
 */
export function EmergencyContactsCard({
  userId,
  readOnly = false,
  title = "Emergency contacts",
  description = "Who your school should call if something happens to you.",
}: {
  userId: number | null;
  readOnly?: boolean;
  title?: string;
  description?: string;
}) {
  const q = useEmergencyContacts(userId);
  const remove = useDeleteEmergencyContact(userId);

  const [editing, setEditing] = useState<EmergencyContact | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<EmergencyContact | null>(null);

  const contacts = q.data ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
          <UserRoundPlus className="size-4" />
        </span>
        <div className="flex-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {!readOnly && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {q.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : q.isError ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load emergency contacts.</p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {readOnly
              ? "Nobody on file."
              : "Nobody on file yet. Add the person your school should call."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    {c.isPrimary && (
                      <Badge variant="secondary" className="text-[11px]">
                        Primary
                      </Badge>
                    )}
                    {c.relationship && (
                      <span className="text-xs text-muted-foreground">{c.relationship}</span>
                    )}
                  </div>
                  <div className="mt-0.5 space-y-0.5 text-sm text-muted-foreground">
                    <div>
                      <a href={telHref(c.phone)} className="hover:text-foreground hover:underline">
                        {formatPhone(c.phone, c.phoneCountry)}
                      </a>
                      {c.altPhone && (
                        <>
                          {" · "}
                          <a
                            href={telHref(c.altPhone)}
                            className="hover:text-foreground hover:underline"
                          >
                            {formatPhone(c.altPhone, c.altPhoneCountry)}
                          </a>
                        </>
                      )}
                    </div>
                    {c.email && <div className="truncate">{c.email}</div>}
                    {c.notes && <div className="text-xs italic">{c.notes}</div>}
                  </div>
                </div>

                {!readOnly && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${c.name}`}
                      onClick={() => setEditing(c)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${c.name}`}
                      onClick={() => setConfirmDelete(c)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <EmergencyContactModal
        userId={userId}
        contact={editing}
        open={adding || editing != null}
        onOpenChange={(open) => {
          if (!open) {
            setAdding(false);
            setEditing(null);
          }
        }}
      />

      <AlertDialog
        open={confirmDelete != null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll no longer be listed as an emergency contact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = confirmDelete;
                if (!target) return;
                remove.mutate(target.id, {
                  onSuccess: () => toast.success("Emergency contact removed"),
                  onError: (err) =>
                    toast.error(
                      err instanceof ApiError ? err.message : "Couldn't remove that contact"
                    ),
                });
                setConfirmDelete(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/** One form for both add and edit, the fields are identical, only the id differs. */
function EmergencyContactModal({
  userId,
  contact,
  open,
  onOpenChange,
}: {
  userId: number | null;
  contact: EmergencyContact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveEmergencyContact(userId);

  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [phone, setPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);

  // Reset on every open so a cancelled edit doesn't leak into the next add, and an add
  // doesn't start with the last contact's details.
  //
  // Phones are seeded FORMATTED, not as the stored E.164, editing a box that says
  // "+17205550133" is how you get somebody to retype a number that was already correct.
  // The server re-normalizes whatever comes back, so nothing is lost by showing it the
  // readable way.
  useEffect(() => {
    if (!open) return;
    setName(contact?.name ?? "");
    setRelationship(contact?.relationship ?? "");
    setPhone(formatPhone(contact?.phone, contact?.phoneCountry));
    setAltPhone(formatPhone(contact?.altPhone, contact?.altPhoneCountry));
    setEmail(contact?.email ?? "");
    setNotes(contact?.notes ?? "");
    setIsPrimary(contact?.isPrimary ?? false);
  }, [open, contact]);

  const nameOk = name.trim().length > 0;
  // Required here, unlike everywhere else a phone appears: a contact with no number
  // cannot be contacted, which is the whole point of the record.
  const phoneOk = phone.trim().length > 0 && looksValid(phone);
  const altOk = looksValid(altPhone);
  const valid = nameOk && phoneOk && altOk;

  function submit() {
    if (!valid) return;
    save.mutate(
      {
        id: contact?.id,
        name: name.trim(),
        relationship: relationship.trim(),
        phone: phone.trim(),
        altPhone: altPhone.trim(),
        email: email.trim(),
        notes: notes.trim(),
        isPrimary,
      },
      {
        onSuccess: () => {
          toast.success(contact ? "Emergency contact updated" : "Emergency contact added");
          onOpenChange(false);
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Couldn't save that contact"),
      }
    );
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={contact ? "Edit emergency contact" : "Add emergency contact"}
      description="Someone your school can reach if there's an emergency."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            {contact ? "Save" : "Add contact"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ec-name">Name</Label>
            <Input
              id="ec-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dana Reyes"
              aria-invalid={name.length > 0 && !nameOk}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-relationship">Relationship</Label>
            <Input
              id="ec-relationship"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              placeholder="Spouse, parent, friend…"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ec-phone">Phone</Label>
            <Input
              id="ec-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhoneAsTyped(e.target.value))}
              placeholder="(303) 555-1234"
              aria-invalid={phone.length > 0 && !phoneOk}
            />
            {phone.length > 0 && !phoneOk && (
              <p className="text-xs text-destructive">That doesn&apos;t look like a valid number.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-alt">Another number</Label>
            <Input
              id="ec-alt"
              type="tel"
              inputMode="tel"
              value={altPhone}
              onChange={(e) => setAltPhone(formatPhoneAsTyped(e.target.value))}
              placeholder="Optional"
              aria-invalid={!altOk}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ec-email">Email</Label>
          <Input
            id="ec-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ec-notes">Notes</Label>
          <Textarea
            id="ec-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth knowing when calling, best time to reach them, another language spoken…"
            rows={2}
            maxLength={300}
          />
        </div>

        <label className="flex items-center gap-2.5 text-sm">
          <Checkbox
            checked={isPrimary}
            onCheckedChange={(v) => setIsPrimary(v === true)}
            aria-label="Call this person first"
          />
          Call this person first
        </label>
      </div>
    </ResponsiveModal>
  );
}
