/**
 * The first job, walked through: write up a finding, add labor and a part, send it to the
 * owner, raise the invoice.
 *
 * Shown on the work order a shop opened at the end of setup (`?tour=true`), so the first thing a
 * mechanic does in the product is the real work on a real tail at their own rates. Each step
 * is DONE FROM THE JOB'S DATA, never from a click on the guide, the same rule the setup
 * checklist keeps: add a finding from the Add menu instead of from here and the step still
 * ticks. The buttons only open the same forms the job page already has.
 */

import { Check, Hammer, Receipt, ScanSearch, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type FirstJobGuideStep = {
  id: string;
  title: string;
  body: string;
  done: boolean;
  /** The button, when the step can be done from here right now. */
  action?: { label: string; onClick: () => void };
  /** Why there is no button yet, when there is not. */
  waiting?: string;
};

const ICONS: Record<string, typeof Check> = {
  finding: ScanSearch,
  lines: Hammer,
  send: Send,
  invoice: Receipt,
};

/**
 * Compact on purpose: it sits above the job's own list, which takes the height it is given and
 * scrolls in place, so every line here is a line of the job pushed off screen. One row of
 * steps, and only the current step's explanation and button.
 */
export function FirstJobGuide({ steps, onClose }: { steps: FirstJobGuideStep[]; onClose: () => void }) {
  const next = steps.find((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;
  const NextIcon = next ? (ICONS[next.id] ?? Check) : Check;
  return (
    <section
      aria-label="Your first work order"
      data-testid="first-job-guide"
      className="shrink-0 rounded-xl border border-primary/25 bg-primary/[0.04] px-3.5 py-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold tracking-tight">
          {next ? "Your first job, start to finish" : "That is a whole job"}
          <span className="ml-2 font-normal text-muted-foreground">
            {doneCount} of {steps.length} done
          </span>
        </h2>
        <Button variant="ghost" size="icon" className="-my-1 -mr-1.5 size-7 shrink-0" onClick={onClose} aria-label="Hide this guide">
          <X className="size-4" />
        </Button>
      </div>
      <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {steps.map((step, i) => (
          <li key={step.id} className="flex items-center gap-1.5 text-xs" aria-current={step === next ? "step" : undefined}>
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
                step.done
                  ? "bg-success/15 text-success"
                  : step === next
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              )}
              aria-hidden
            >
              {step.done ? <Check className="size-3" /> : i + 1}
            </span>
            <span className={cn(step === next ? "font-medium text-foreground" : "text-muted-foreground", step.done && "line-through decoration-muted-foreground/40")}>
              {step.title}
              {step.done ? <span className="sr-only"> (done)</span> : null}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-2.5 flex flex-col gap-2 border-t border-primary/15 pt-2.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {next
            ? next.body
            : "Every job runs the same way: the owner's request, what you find, their answer, the work, the invoice. Everything here went on this job for real."}
        </p>
        {next?.action ? (
          <Button size="sm" className="shrink-0 self-start sm:self-auto" onClick={next.action.onClick}>
            <NextIcon className="size-3.5" /> {next.action.label}
          </Button>
        ) : next?.waiting ? (
          <p className="shrink-0 text-[11px] font-medium text-muted-foreground">{next.waiting}</p>
        ) : !next ? (
          <Button size="sm" variant="outline" className="shrink-0 self-start sm:self-auto" onClick={onClose}>
            Done
          </Button>
        ) : null}
      </div>
    </section>
  );
}
