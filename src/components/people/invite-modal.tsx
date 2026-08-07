import { useState } from "react";
import { toast } from "sonner";
import type { InviteInput } from "@/types/api";
import { useInviteMember, useMembershipPlanOptions } from "@/features/queries";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { planPriceLine } from "@/lib/membership";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { INVITE_ROLE_OPTIONS, type RoleKey } from "./util";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RoleState = Partial<Record<RoleKey, boolean>>;

export function InviteModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const invite = useInviteMember();
  const [email, setEmail] = useState("");
  const [bulk, setBulk] = useState("");
  const [roles, setRoles] = useState<RoleState>({});
  const [submitting, setSubmitting] = useState(false);
  //Only offered when the school has plans, so the modal is unchanged at every school that
  //does not run memberships.
  const plans = useMembershipPlanOptions();
  const [planId, setPlanId] = useState("none");

  const emails = collectEmails(email, bulk);

  function reset() {
    setEmail("");
    setBulk("");
    setRoles({});
    setPlanId("none");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function submit() {
    if (emails.length === 0) {
      toast.error("Add at least one valid email address.");
      return;
    }
    const flags: RoleState = {};
    for (const opt of INVITE_ROLE_OPTIONS) {
      if (roles[opt.key]) flags[opt.key] = true;
    }

    setSubmitting(true);
    let ok = 0;
    const failed: string[] = [];
    for (const addr of emails) {
      try {
        await invite.mutateAsync({
          email: addr,
          ...flags,
          membershipPlanId: planId === "none" ? undefined : Number(planId),
        } as InviteInput);
        ok += 1;
      } catch {
        failed.push(addr);
      }
    }
    setSubmitting(false);

    if (ok > 0) {
      toast.success(
        `Invited ${ok} ${ok === 1 ? "person" : "people"}.` +
          (failed.length ? ` ${failed.length} couldn't be sent.` : "")
      );
      reset();
      onOpenChange(false);
    } else {
      toast.error(
        emails.length === 1 ? "Couldn't send that invite." : "Couldn't send any invites."
      );
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Invite people"
      description="Send an invite by email, or paste a whole roster at once."
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            inputMode="email"
            placeholder="pilot@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Roles</Label>
          <div className="flex flex-wrap gap-2">
            {INVITE_ROLE_OPTIONS.map((r) => {
              const id = `invite-role-${r.key}`;
              const checked = !!roles[r.key];
              return (
                <label
                  key={r.key}
                  htmlFor={id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                    checked
                      ? "border-primary/40 bg-primary/5 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={(v) =>
                      setRoles((prev) => ({ ...prev, [r.key]: v === true }))
                    }
                  />
                  {r.label}
                </label>
              );
            })}
          </div>
        </div>

        <Separator />

        {(plans.data?.length ?? 0) > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="invite-plan">Membership plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger id="invite-plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No membership</SelectItem>
                {(plans.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name} — {planPriceLine(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Applied when they accept, and not started — nothing is charged until you start
              it from their record.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="invite-bulk">Bulk invite</Label>
          <Textarea
            id="invite-bulk"
            rows={4}
            placeholder={"Paste emails, one per line…\nstudent1@example.com\nstudent2@example.com"}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {emails.length > 0
              ? `${emails.length} valid ${emails.length === 1 ? "address" : "addresses"} — everyone gets the roles above.`
              : "Everyone pasted here is invited with the roles selected above."}
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || emails.length === 0}>
            {submitting
              ? "Sending…"
              : emails.length > 1
                ? `Send ${emails.length} invites`
                : "Send invite"}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}

function collectEmails(single: string, bulk: string): string[] {
  const raw = [single, ...bulk.split(/[\n,;]/)]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const valid = raw.filter((e) => EMAIL_RE.test(e));
  return Array.from(new Set(valid));
}
