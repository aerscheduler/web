/**
 * Booking rules — four questions, phrased as decisions rather than settings.
 *
 * Settings → Organization presents these as a wall of switches with names like
 * `personnelCanOnlyUseApprovedResources`. Each one is a real policy question a school
 * has an opinion about; asked in plain words, they take a minute. The defaults shown
 * are the org's current values, so re-opening this is a review, not a reset.
 *
 * Everything here is also in Settings. This flow exists to make sure the questions get
 * ASKED once, not to be the only place they can be answered.
 */

import * as React from "react";
import { toast } from "sonner";
import { useUpdateOrganization } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FlowDone, FlowModal, FlowNav, type FlowProps } from "./flow-shell";

type Rules = {
  private: boolean;
  requirePaymentMethod: boolean;
  studentsCanOnlyFlyWithTheirInstructors: boolean;
  personnelCanOnlyUseApprovedResources: boolean;
};

const QUESTIONS: { key: keyof Rules; label: string; hint: string }[] = [
  {
    key: "private",
    label: "Approve people before they join",
    hint: "On: someone with your code requests access and an admin lets them in. Off: the code is enough.",
  },
  {
    key: "requirePaymentMethod",
    label: "Require a card on file to self-book",
    hint: "Applies to students and renters booking themselves. Staff and instructor-led bookings are never blocked.",
  },
  {
    key: "studentsCanOnlyFlyWithTheirInstructors",
    label: "Students fly only with their own instructor",
    hint: "On: a student can't book with a CFI they aren't assigned to.",
  },
  {
    key: "personnelCanOnlyUseApprovedResources",
    label: "Check people out on an aircraft first",
    hint: "On: a pilot can only book a tail they've been approved for.",
  },
];

export function RulesFlow({ onClose }: FlowProps) {
  const { organization, rehydrate } = useAuth();
  const update = useUpdateOrganization();
  const [done, setDone] = React.useState(false);

  const [rules, setRules] = React.useState<Rules>({
    private: Boolean(organization?.preferences?.private),
    requirePaymentMethod: Boolean(organization?.bookingPolicy?.requirePaymentMethod),
    studentsCanOnlyFlyWithTheirInstructors: Boolean(
      organization?.preferences?.studentsCanOnlyFlyWithTheirInstructors
    ),
    personnelCanOnlyUseApprovedResources: Boolean(
      organization?.preferences?.personnelCanOnlyUseApprovedResources
    ),
  });

  async function save() {
    try {
      await update.mutateAsync({
        preferences: {
          private: rules.private,
          studentsCanOnlyFlyWithTheirInstructors: rules.studentsCanOnlyFlyWithTheirInstructors,
          // The server keeps the mirror flag separate; a school that wants one almost
          // always means both, and splitting them is an advanced case for Settings.
          instructorsCanOnlyFlyWithTheirStudents: rules.studentsCanOnlyFlyWithTheirInstructors,
          personnelCanOnlyUseApprovedResources: rules.personnelCanOnlyUseApprovedResources,
        },
        bookingPolicy: { requirePaymentMethod: rules.requirePaymentMethod },
      });
      await rehydrate();
      setDone(true);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save your booking rules");
    }
  }

  return (
    <FlowModal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Set your booking rules"
      description="Four decisions. Change any of them later in Settings."
    >
      {done ? (
        <FlowDone
          headline="Booking rules saved."
          body="The schedule enforces these from now on — for the app and the console alike."
          onClose={onClose}
        />
      ) : (
        <div>
          <div className="space-y-3">
            {QUESTIONS.map((q) => (
              <div
                key={q.key}
                className="flex items-start justify-between gap-4 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <Label htmlFor={`rule-${q.key}`} className="text-sm">
                    {q.label}
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">{q.hint}</p>
                </div>
                <Switch
                  id={`rule-${q.key}`}
                  checked={rules[q.key]}
                  onCheckedChange={(v) => setRules((r) => ({ ...r, [q.key]: v }))}
                />
              </div>
            ))}
          </div>
          <FlowNav
            onNext={save}
            nextLabel="Save rules"
            busy={update.isPending}
            onSkip={onClose}
            skipLabel="Cancel"
          />
        </div>
      )}
    </FlowModal>
  );
}
