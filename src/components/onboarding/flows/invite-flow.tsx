/**
 * Invite your team — pick who, then invite them.
 *
 * The old link dropped people on /people, a roster of the one person who exists,
 * with the invite affordance somewhere on it. The question that actually needs
 * answering first is "who am I inviting?", because the answer sets the roles — and
 * roles are the thing new admins get wrong when handed seven checkboxes.
 *
 * Several emails at once, because nobody hires one instructor.
 */

import * as React from "react";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { useInviteMember } from "@/features/queries";
import { ApiError } from "@/lib/api";
import type { InviteInput } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FlowChoice,
  FlowClose,
  FlowDone,
  FlowModal,
  FlowNav,
  type FlowProps,
} from "./flow-shell";

type Who = "instructor" | "student" | "renter" | "technician" | "office";

/** Who → the roles that actually get set. This mapping is the reason the flow exists. */
const ROLES: Record<Who, Partial<InviteInput>> = {
  instructor: { instructor: true },
  student: { student: true },
  renter: { renter: true },
  technician: { technician: true },
  // "Office staff" is the front desk: dispatch the board, but not org settings or money.
  office: { dispatcher: true },
};

const LABELS: { value: Who; label: string; hint: string }[] = [
  { value: "instructor", label: "Instructor", hint: "Teaches, and closes out their own flights" },
  { value: "student", label: "Student", hint: "Books lessons and pays their own invoices" },
  { value: "renter", label: "Renter", hint: "Rents aircraft solo, within your rules" },
  { value: "technician", label: "Technician", hint: "Maintenance, squawks, and grounding" },
  { value: "office", label: "Office staff", hint: "Runs the dispatch board — no settings or billing" },
];

export function InviteFlow({ onClose, defaultWho }: FlowProps & { defaultWho: Who }) {
  const invite = useInviteMember();
  const [step, setStep] = React.useState(0);
  const [who, setWho] = React.useState<Who>(defaultWho);
  const [emails, setEmails] = React.useState<string[]>([""]);
  const [sent, setSent] = React.useState(0);

  const valid = emails.map((e) => e.trim()).filter((e) => /.+@.+\..+/.test(e));

  async function send() {
    const results = await Promise.allSettled(
      valid.map((email) => invite.mutateAsync({ email, ...ROLES[who] } as InviteInput))
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - ok;
    if (ok === 0) {
      const first = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      toast.error(
        first?.reason instanceof ApiError ? first.reason.message : "Couldn't send the invitations"
      );
      return;
    }
    // Partial success is worth saying out loud — silently "succeeding" on 2 of 3 is how
    // someone ends up wondering where their third instructor went.
    if (failed > 0) toast.warning(`${ok} sent, ${failed} couldn't be sent — check those addresses.`);
    setSent(ok);
    setStep(2);
  }

  const footer =
    step === 0 ? (
      <FlowNav onNext={() => setStep(1)} />
    ) : step === 1 ? (
      <FlowNav
        onBack={() => setStep(0)}
        onNext={send}
        nextLabel={valid.length > 1 ? `Send ${valid.length} invitations` : "Send invitation"}
        nextDisabled={valid.length === 0}
        busy={invite.isPending}
      />
    ) : (
      <FlowClose onClose={onClose} />
    );

  return (
    <FlowModal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Invite your team"
      description="They'll get an email with a link that puts them straight in."
      step={step}
      stepCount={3}
      size="lg"
      footer={footer}
    >
      {step === 0 && (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">Who are you inviting?</p>
          <FlowChoice options={LABELS} value={who} onChange={setWho} />
        </div>
      )}

      {step === 1 && (
        <div>
          <Label className="text-sm">
            Email {emails.length > 1 ? "addresses" : "address"}
          </Label>
          <div className="mt-2 space-y-2">
            {emails.map((email, i) => (
              <Input
                key={i}
                value={email}
                autoFocus={i === 0}
                type="email"
                inputMode="email"
                placeholder={i === 0 ? "name@example.com" : "Another address (optional)"}
                onChange={(e) =>
                  setEmails((list) => list.map((v, j) => (j === i ? e.target.value : v)))
                }
              />
            ))}
          </div>
          {emails.length < 10 && (
            <button
              type="button"
              onClick={() => setEmails((l) => [...l, ""])}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground"
            >
              + Add another
            </button>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            They&rsquo;ll join as {LABELS.find((l) => l.value === who)?.label.toLowerCase()}. You can
            change anyone&rsquo;s roles later from People.
          </p>
        </div>
      )}

      {step === 2 && (
        <FlowDone
          headline={sent > 1 ? `${sent} invitations sent.` : "Invitation sent."}
          body="They'll appear in People as soon as they accept. Nothing else to do here."
        >
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEmails([""]);
                setStep(0);
              }}
            >
              Invite someone else
            </Button>
            <Button asChild variant="ghost" size="sm" onClick={onClose}>
              <Link to="/people">
                <Users className="size-4" /> Open People
              </Link>
            </Button>
          </div>
        </FlowDone>
      )}

      {invite.isPending && step === 1 && (
        <span className="sr-only" role="status">
          <Loader2 className="size-4 animate-spin" /> Sending invitations
        </span>
      )}
    </FlowModal>
  );
}
