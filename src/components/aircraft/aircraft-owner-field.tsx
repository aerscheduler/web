import * as React from "react";
import { useMembers } from "@/features/queries";
import type { OrganizationUser } from "@/types/api";
import { memberEmail } from "@/components/people/util";
import { Combobox, type ComboOption } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Who owns a customer's aircraft, chosen while adding it (Tony, 2026-09-30): somebody already on
 * the roster, or a new person by name and how to reach them. Optional: the desk does not always
 * know on the first call, and more owners go on the aircraft's Owners panel.
 */
export type OwnerDraft =
  | { mode: "none" }
  | { mode: "existing"; orgUserId: number; name: string }
  | { mode: "new"; name: string; email: string; phone: string };

/** The server's answer when a new person's address is already somebody's (see the Owners panel). */
export type OwnerConflict = {
  message: string;
  conflict: { kind: string; orgUserId: number; name: string };
  onUse: () => void;
  onAddAnyway: () => void;
  pending: boolean;
};

const NONE = "none";

export const EMAIL_RE = /^[^\s@,;:<>"'\\]+@[^\s@,;:<>"'\\]+\.[a-z]{2,}$/i;

/**
 * Somebody already on the roster who is the "new person" being typed: the same address, or
 * failing that the same name. Asked before anything is saved, because every owner Murray's
 * staff added was themselves or a colleague, typed as a new person, and every one came back
 * "already a member with that email" from the server (2026-10-05 to 10-07); once, it was given up.
 */
export function rosterMatch(
  members: readonly OrganizationUser[] | undefined,
  draft: { name: string; email: string }
): { member: OrganizationUser; by: "email" | "name" } | null {
  const live = (members ?? []).filter((m) => !m.archivedAt);
  const email = draft.email.trim().toLowerCase();
  if (email && EMAIL_RE.test(email)) {
    const m = live.find((x) => (memberEmail(x) ?? "").trim().toLowerCase() === email);
    if (m) return { member: m, by: "email" };
  }
  const name = draft.name.trim().toLowerCase().replace(/\s+/g, " ");
  if (name.length >= 3) {
    const same = live.filter((x) => (x.user?.name ?? "").trim().toLowerCase().replace(/\s+/g, " ") === name);
    // Two people with one name is not a match: the address decides that.
    if (same.length === 1) return { member: same[0], by: "name" };
  }
  return null;
}

/** "Dylan Freiberg is already on your roster with this email." with the way to use them. */
export function RosterMatchNote({
  match,
  onUse,
  onNew,
  newLabel,
  pending,
  alreadyOwner,
}: {
  match: { member: OrganizationUser; by: "email" | "name" };
  onUse: () => void;
  /** It is somebody else: a different person with that name, or one sharing that address. */
  onNew?: () => void;
  newLabel?: string;
  pending?: boolean;
  /** They own this aircraft already: nothing to add. */
  alreadyOwner?: boolean;
}) {
  const name = match.member.user?.name ?? "Somebody";
  return (
    <div role="status" data-testid="roster-match" className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
      <p>
        {alreadyOwner
          ? `${name} already owns this aircraft.`
          : match.by === "email"
            ? `${name} is already on your roster with this email.`
            : `${name} is already on your roster.`}
      </p>
      {!alreadyOwner && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={pending} onClick={onUse}>
            Use {name}
          </Button>
          {onNew && (match.by === "name" || newLabel) && (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onNew}>
              {match.by === "name" ? "A different person" : newLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** What is wrong with the draft, if anything: only a new person has fields to get wrong. */
export function ownerDraftError(o: OwnerDraft): { name?: string; email?: string } {
  if (o.mode !== "new") return {};
  return {
    name: o.name.trim() ? undefined : "A new owner needs a name.",
    email: o.email.trim() && !EMAIL_RE.test(o.email.trim()) ? "That email address doesn't look right." : undefined,
  };
}

export function OwnerField({
  value,
  onChange,
  showErrors,
  conflict,
}: {
  value: OwnerDraft;
  onChange: (o: OwnerDraft) => void;
  showErrors: boolean;
  conflict: OwnerConflict | null;
}) {
  const membersQ = useMembers();
  const people: ComboOption[] = React.useMemo(
    () =>
      (membersQ.data ?? [])
        .filter((m) => !m.archivedAt)
        .map((m) => ({
          value: String(m.id),
          label: m.user?.name ?? `Member #${m.id}`,
          hint: m.external && !m.claimedAt ? "Owner, not a member" : undefined,
          // Found by address too: people often know the owner's email before their name.
          keywords: memberEmail(m) ? [memberEmail(m)!] : undefined,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [membersQ.data]
  );
  const err = ownerDraftError(value);
  const [notThem, setNotThem] = React.useState<number | null>(null);
  const match = value.mode === "new" ? rosterMatch(membersQ.data, value) : null;
  const shownMatch = match && match.member.id !== notThem ? match : null;

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="space-y-1.5">
        <Label htmlFor="ac-owner">Owner</Label>
        {value.mode === "new" ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">A new person</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ mode: "none" })}>
              Pick somebody instead
            </Button>
          </div>
        ) : (
          <Combobox
            id="ac-owner"
            options={[{ value: NONE, label: "Not known yet" }, ...people]}
            value={value.mode === "existing" ? String(value.orgUserId) : NONE}
            onChange={(v) => {
              if (v === NONE) return onChange({ mode: "none" });
              const p = people.find((o) => o.value === v);
              onChange({ mode: "existing", orgUserId: Number(v), name: p?.label ?? "" });
            }}
            placeholder="Who owns it"
            searchPlaceholder="Search people…"
            emptyText="Nobody by that name. Add them as a new person."
            action={{
              label: "Add a new person",
              onSelect: (typed) => onChange({ mode: "new", name: typed, email: "", phone: "" }),
            }}
          />
        )}
      </div>
      {value.mode === "new" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ac-owner-name">Name</Label>
            <Input
              id="ac-owner-name"
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
              placeholder="Dale Whitcomb"
              autoComplete="off"
              aria-invalid={showErrors && !!err.name}
            />
            {showErrors && err.name && <p className="text-xs text-destructive">{err.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ac-owner-email">Email</Label>
              <Input
                id="ac-owner-email"
                type="email"
                value={value.email}
                onChange={(e) => onChange({ ...value, email: e.target.value })}
                placeholder="owner@example.com"
                autoComplete="off"
                aria-invalid={showErrors && !!err.email}
              />
              {showErrors && err.email && <p className="text-xs text-destructive">{err.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ac-owner-phone">Phone</Label>
              <Input
                id="ac-owner-phone"
                value={value.phone}
                onChange={(e) => onChange({ ...value, phone: e.target.value })}
                placeholder="555-0142"
                autoComplete="off"
              />
            </div>
          </div>
        </div>
      )}
      {!conflict && shownMatch && (
        <RosterMatchNote
          match={shownMatch}
          onUse={() => onChange({ mode: "existing", orgUserId: shownMatch.member.id, name: shownMatch.member.user?.name ?? "" })}
          onNew={() => setNotThem(shownMatch.member.id)}
        />
      )}
      {conflict && (
        <div role="alert" className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <p>The aircraft is added. {conflict.message}</p>
          <div className="flex flex-wrap gap-2">
            {conflict.conflict.kind !== "archived" && (
              <Button type="button" size="sm" disabled={conflict.pending} onClick={conflict.onUse}>
                Use {conflict.conflict.name}
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" disabled={conflict.pending} onClick={conflict.onAddAnyway}>
              Add {value.mode === "new" ? value.name.trim() || "them" : "them"} as a new person
            </Button>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Billed for work on this aircraft. They go on your roster so you can invoice them; they cannot sign in.
        Co-owners go on the aircraft&apos;s Owners panel.
      </p>
    </div>
  );
}
