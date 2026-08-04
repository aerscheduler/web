/**
 * Decide how a shared booking's cost divides — in one question.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS, AND WHAT IT REPLACED
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * The settings screen used to be the whole answer: six booking types × two charge lines,
 * twelve live billing controls open at once, each with five options, a paragraph and a
 * worked example. Every one of those twelve looked identical because they were all on the
 * default, so the repetition carried no information — and the first reaction to it was
 * "I'm scared to change anything," which for a page that decides who gets invoiced is the
 * worst possible outcome.
 *
 * The mistake was the shape, not the words. An operator does not arrive wanting to
 * configure a policy matrix; they arrive knowing ONE thing — what kind of operation they
 * run. That single fact already implies every rule, which is exactly what the presets are.
 * So this flow asks the one question an operator can answer without being taught anything,
 * and the matrix goes back to being what it should always have been: an escape hatch for
 * the minority who need a per-type exception.
 *
 * Two things are deliberate:
 *
 *  1. **It shows what it will do before it does it.** Billing must never be rewritten by a
 *     button whose effect could not be read first. The rules appear as sentences, not as a
 *     grid, because a grid is what made the settings page unreadable.
 *  2. **It never marks anything complete** — same rule as every flow here. It finishes by
 *     actually writing the rules, so the checklist ticks because the work is done, and
 *     doing it by hand in Settings ticks it just the same.
 *
 * Reachable from BOTH the checklist and the settings screen's primary button, on purpose:
 * one path to this decision, not two that can drift.
 */

import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { useApplySplitPreset, useSplitRules } from "@/features/queries";
import type { ReservationType, SplitRulesDescription } from "@/types/api";
import { ApiError } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { typeLabel } from "@/components/schedule/meta";
import { FlowChoice, FlowClose, FlowDone, FlowModal, FlowNav, type FlowProps } from "./flow-shell";

export function CostSplittingFlow({ onClose }: FlowProps) {
  const q = useSplitRules();
  const apply = useApplySplitPreset();
  const [picked, setPicked] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  const data = q.data;
  const preset = data?.presets.find((p) => p.key === picked) ?? null;

  // Nothing is being "replaced" for an operation setting this up for the first time, and
  // saying so removes the main reason to hesitate. Only warn when there IS something to lose.
  const hasRules = (data?.rules.length ?? 0) > 0;

  async function save() {
    if (!preset) return;
    try {
      await apply.mutateAsync(preset.key);
      setDone(preset.label);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save those rules");
    }
  }

  return (
    <FlowModal
      open
      onOpenChange={(o) => !o && onClose()}
      title={done ? "Cost splitting is set up" : "How should a shared booking be billed?"}
      description={
        done
          ? undefined
          : "Pick the kind of operation you run. It fills in sensible rules you can change later."
      }
      size="lg"
      footer={
        done ? (
          <FlowClose onClose={onClose} />
        ) : (
          <FlowNav
            onNext={save}
            nextLabel="Use these rules"
            nextDisabled={!preset}
            busy={apply.isPending}
            onSkip={onClose}
            skipLabel="Not now"
          />
        )
      }
    >
      {done ? (
        <FlowDone
          headline={`Set up like a ${done.toLowerCase()}.`}
          body="Bookings with two or more people will split automatically from your next close-out. A booking with one person is billed exactly as before, and invoices you've already raised don't change."
        />
      ) : q.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">
          Couldn't load the options. Close this and try again.
        </p>
      ) : (
        <div className="space-y-4">
          <FlowChoice
            value={picked}
            onChange={setPicked}
            options={data.presets.map((p) => ({
              value: p.key,
              label: p.label,
              hint: p.summary,
            }))}
          />

          {preset && <WhatThisDoes data={data} rules={preset.rules} hasRules={hasRules} />}
        </div>
      )}
    </FlowModal>
  );
}

/**
 * The chosen preset in plain sentences.
 *
 * Sentences rather than the badge grid the old preview used: the grid was a miniature of
 * the matrix that made the settings page unreadable, and reading "Ground · Instruction →
 * Each pays in full" requires already knowing the vocabulary this screen is supposed to
 * be teaching.
 */
function WhatThisDoes({
  data,
  rules,
  hasRules,
}: {
  data: SplitRulesDescription;
  rules: { reservationType: string | null; chargeLine: string; apportionment: string; rationale: string }[];
  hasRules: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="text-sm font-medium">What that means</div>
      <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
        {rules.map((r, i) => (
          <li key={i}>
            <span className="text-foreground">
              {r.reservationType ? typeLabel(r.reservationType as ReservationType) : "Every booking"}
            </span>
            {" — "}
            {data.copy.chargeLines[r.chargeLine as keyof typeof data.copy.chargeLines]?.label.toLowerCase()}
            {": "}
            <span className="text-foreground">
              {data.copy.apportionments[
                r.apportionment as keyof typeof data.copy.apportionments
              ]?.label.toLowerCase()}
            </span>
            .
          </li>
        ))}
      </ul>
      {/* "Each pays in full" is the only option that MULTIPLIES what the school collects
          rather than dividing it, and in a plain list it reads with exactly the same weight
          as "split evenly". Saying so here is the difference between choosing per-seat
          pricing and discovering it from a parent's phone call. */}
      {rules.some((r) => r.apportionment === "full_to_each") && (
        <p className="mt-2.5 flex items-start gap-1.5 border-t pt-2.5 text-xs font-medium text-amber-600 dark:text-amber-500">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            "Each pays in full" charges every person the whole amount, so a group brings in
            more than a single booking would. That's how a per-seat class is meant to work.
          </span>
        </p>
      )}

      <p className="mt-2.5 border-t pt-2.5 text-xs text-muted-foreground">
        {hasRules
          ? "This replaces the rules you have now. Nothing is billed differently until your next close-out, and invoices already raised don't change."
          : "You have no rules today, so nothing is being replaced. Nothing is billed differently until your next close-out."}
      </p>
    </div>
  );
}
