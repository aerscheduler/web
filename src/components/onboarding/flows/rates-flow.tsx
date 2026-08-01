/**
 * Set an instruction rate — one type, one number.
 *
 * A lesson can't be priced until a rating has a rate against it, so this is the
 * smallest possible unblock: name the instruction you sell, say what it costs an hour.
 * The full rates table (multiple ratings, per-instructor overrides, who may teach what)
 * stays in Settings → Instruction rates.
 */

import * as React from "react";
import { toast } from "sonner";
import { useCreateRating } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/money-input";
import { cn } from "@/lib/utils";
import { FlowDone, FlowModal, FlowNav, type FlowProps } from "./flow-shell";

/** The certificates a school sells first. "Other" hands over to a free-text name. */
const COMMON = ["Private Pilot", "Instrument", "Commercial", "Flight Review", "Other"];

export function RatesFlow({ onClose }: FlowProps) {
  const create = useCreateRating();
  const [done, setDone] = React.useState(false);
  const [pick, setPick] = React.useState("Private Pilot");
  const [custom, setCustom] = React.useState("");
  const [rate, setRate] = React.useState(6500);

  const isOther = pick === "Other";
  const name = (isOther ? custom : pick).trim();

  async function save() {
    try {
      await create.mutateAsync({
        name: name || "Flight Instruction",
        defaultInstructorRate: rate,
        // Every instructor can teach it until someone says otherwise — the restricted
        // case is a Settings decision, not a first-run one.
        anyInstructorCanTeach: true,
      });
      setDone(true);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save the rate");
    }
  }

  return (
    <FlowModal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Set your instruction rate"
      description="One is enough to make lessons priceable. Add the rest in Settings."
    >
      {done ? (
        <FlowDone
          headline="Lessons are priceable."
          body={`${name} is set at $${(rate / 100).toFixed(2)}/hour. Close-outs will bill instruction automatically.`}
          onClose={onClose}
        />
      ) : (
        <div className="space-y-4">
          <div>
            <Label className="text-sm">What do you teach?</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {COMMON.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setPick(c)}
                  aria-pressed={pick === c}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    pick === c
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {isOther && (
            <div className="space-y-1.5">
              <Label htmlFor="rf-name">Name</Label>
              <Input
                id="rf-name"
                autoFocus
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Tailwheel endorsement"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="rf-rate">Instructor rate, per hour</Label>
            <MoneyInput id="rf-rate" cents={rate} onCentsChange={setRate} />
          </div>

          <FlowNav
            onNext={save}
            nextLabel="Save rate"
            nextDisabled={isOther && !custom.trim()}
            busy={create.isPending}
            onSkip={onClose}
            skipLabel="Cancel"
          />
        </div>
      )}
    </FlowModal>
  );
}
