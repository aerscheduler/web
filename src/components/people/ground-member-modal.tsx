import * as React from "react";
import { toast } from "sonner";
import { useUpdateMemberOrgUser } from "@/features/queries";
import type { OrganizationUser } from "@/types/api";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { memberName } from "./util";

/**
 * Grounding a member requires a reason.
 *
 * The reason is not decoration: the server emails and pushes it to the member
 * as the entire body of the "You were grounded" notice, defaulting to
 * "No reason provided." when it's absent (services/notification.ts). The console
 * used to ground from a bare confirm with no reason field at all — so a whole
 * school got grounded and told nothing, while the Flutter app has always
 * required one. This closes that gap.
 *
 * Presets cover what schools actually ground people for (the live data is almost
 * entirely missing-paperwork); "Something else" falls through to free text so the
 * list never becomes a cage.
 */
const PRESETS = [
  "Missing or expired documents",
  "Missing TSA documentation",
  "Rental agreement not on file",
  "Medical certificate expired",
  "Outstanding balance",
  "Currency lapsed",
  "Pending safety review",
] as const;

const OTHER = "__other__";

/** The server column is varchar(60) — keep the client honest about it. */
const MAX_REASON = 60;

export function GroundMemberModal({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: OrganizationUser | null;
}) {
  // The member's USER id, from the nested relation — see the note in types/api.ts.
  const targetUserId = member?.user?.id ?? 0;
  const mut = useUpdateMemberOrgUser(targetUserId);

  const [choice, setChoice] = React.useState<string>(PRESETS[0]);
  const [custom, setCustom] = React.useState("");
  //Validation happens on submit, not by greying the button out: a disabled control that
  //says nothing is the one thing this form must never do to somebody who is trying to
  //ground an aircraft's worth of people before the first lesson.
  const [error, setError] = React.useState<string | null>(null);
  const customRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (open) {
      setChoice(PRESETS[0]);
      setCustom("");
      setError(null);
    }
  }, [open]);

  const name = member ? memberName(member) : "this member";
  const reason = (choice === OTHER ? custom : choice).trim();
  const tooLong = reason.length > MAX_REASON;

  function handleGround() {
    if (!member || mut.isPending) return;

    if (reason.length === 0) {
      setError(`Say why. ${name.split(" ")[0]} is sent this and nothing else.`);
      customRef.current?.focus();
      return;
    }
    if (tooLong) {
      setError(`Keep it to ${MAX_REASON} characters.`);
      customRef.current?.focus();
      return;
    }
    setError(null);

    mut.mutate(
      { grounded: true, groundedReason: reason },
      {
        onSuccess: () => {
          toast.success(`${name} grounded.`);
          onOpenChange(false);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Couldn't ground this member."),
      }
    );
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Ground ${name}`}
      description="They won't be able to book or fly until you reinstate them. You can undo this any time."
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Reason</Label>
          <RadioGroup
            value={choice}
            onValueChange={(v) => {
              setChoice(v);
              setError(null);
            }}
            className="gap-2"
          >
            {[...PRESETS, OTHER].map((value) => {
              const isOther = value === OTHER;
              const checked = choice === value;
              const id = `ground-reason-${isOther ? "other" : value}`;
              return (
                <Label
                  key={value}
                  htmlFor={id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm font-normal transition-colors",
                    checked
                      ? "border-primary/40 bg-primary/5"
                      : "border-border hover:bg-muted/40"
                  )}
                >
                  <RadioGroupItem id={id} value={value} />
                  <span>{isOther ? "Something else…" : value}</span>
                </Label>
              );
            })}
          </RadioGroup>
        </div>

        {choice === OTHER && (
          <div className="space-y-1.5">
            <Label htmlFor="ground-reason-custom">Your reason</Label>
            <Textarea
              id="ground-reason-custom"
              ref={customRef}
              autoFocus
              rows={2}
              maxLength={MAX_REASON}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "ground-reason-error" : undefined}
              placeholder="e.g. Missing rental agreement and TSA docs"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                if (error) setError(null);
              }}
            />
            <p
              className={cn(
                "text-xs",
                tooLong ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {custom.trim().length}/{MAX_REASON}
            </p>
            {error && (
              <p id="ground-reason-error" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {name.split(" ")[0]} is emailed this reason, so write it for them — not for
          your own notes.
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleGround}
            disabled={mut.isPending}
            className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30"
          >
            {mut.isPending ? "Grounding…" : "Ground member"}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
