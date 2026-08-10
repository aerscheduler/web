/**
 * Chrome for the checklist's mini-wizards.
 *
 * The point of these flows is that a checklist item is NOT navigation. Sending someone
 * to Settings → Billing to "connect billing" drops them on a page of unrelated switches
 * and makes them work out which one was the point. A flow instead asks for exactly the
 * fields that outcome needs, in order, and ends.
 *
 * Two rules for anything built on this shell:
 *
 * 1. **Only the fields the outcome needs.** Everything else stays in Settings. If a
 *    flow starts growing a section nobody has to fill in to finish, that section
 *    belongs on the settings page instead.
 * 2. **Never mark anything complete.** Completion is still derived from real data
 *    (`lib/onboarding-checklist.ts`), so a flow finishes by having actually created the
 *    thing, a reminder, an invite, a Connect account. That means a flow and the
 *    settings page can never disagree, and doing the work by hand ticks the box just
 *    the same.
 */

import * as React from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { ResponsiveModal, type ResponsiveModalSize } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Every flow is handed the same two callbacks and nothing else. */
export type FlowProps = {
  /** Close the flow. Completion is derived, so this is just "I'm done looking". */
  onClose: () => void;
};

export function FlowModal({
  open,
  onOpenChange,
  title,
  description,
  step,
  stepCount,
  size = "md",
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** 0-based. Omit both to hide the step dots, a one-screen flow doesn't need them. */
  step?: number;
  stepCount?: number;
  /** Wider for dense steps (choice lists, embedded forms). Default matches other dialogs. */
  size?: ResponsiveModalSize;
  /** Sticky action row, pass `FlowNav` / `FlowClose` here, not inside `children`. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size={size}
      footer={footer}
    >
      {stepCount && stepCount > 1 && step != null && (
        <div className="mb-4 flex items-center gap-1.5" aria-hidden>
          {Array.from({ length: stepCount }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i < step ? "bg-primary" : i === step ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>
      )}
      {children}
    </ResponsiveModal>
  );
}

/** A short "here's why this is worth doing" list. Used as step 1 by several flows. */
export function FlowBenefits({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5 text-sm">
      {items.map((t) => (
        <li key={t} className="flex items-start gap-2.5">
          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="text-muted-foreground">{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** One choice per row, the "do you have multiple aircraft?" shape. */
export function FlowChoice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
            value === o.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent/40"
          )}
        >
          <span
            className={cn(
              "grid size-4 shrink-0 place-items-center rounded-full border",
              value === o.value ? "border-primary" : "border-muted-foreground/40"
            )}
          >
            {value === o.value && <span className="size-2 rounded-full bg-primary" />}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">{o.label}</span>
            {o.hint && <span className="block text-xs text-muted-foreground">{o.hint}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Back / skip / primary, host in `FlowModal`'s `footer` so it stays pinned. */
export function FlowNav({
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled,
  busy,
  onSkip,
  skipLabel = "Skip",
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  busy?: boolean;
  onSkip?: () => void;
  skipLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {onBack && (
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back" disabled={busy}>
          <ArrowLeft className="size-4" />
        </Button>
      )}
      <div className="flex-1" />
      {onSkip && (
        <Button variant="ghost" onClick={onSkip} disabled={busy}>
          {skipLabel}
        </Button>
      )}
      {onNext && (
        <Button onClick={onNext} disabled={nextDisabled || busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {nextLabel}
          {!busy && <ArrowRight className="size-4" />}
        </Button>
      )}
    </div>
  );
}

/** Success-screen content. Pair with `FlowClose` in the modal footer. */
export function FlowDone({
  headline,
  body,
  children,
}: {
  headline: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklch,var(--success)_15%,transparent)] text-success">
          <Check className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="font-medium">{headline}</div>
          {body && <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>}
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/** Sticky "Done" for success screens, host in `FlowModal`'s `footer`. */
export function FlowClose({
  onClose,
  closeLabel = "Done",
}: {
  onClose: () => void;
  closeLabel?: string;
}) {
  return (
    <div className="flex justify-end">
      <Button onClick={onClose}>{closeLabel}</Button>
    </div>
  );
}
