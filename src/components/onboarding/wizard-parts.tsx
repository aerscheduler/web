/**
 * The onboarding wizard's building blocks: a screen, a labelled field, and the Back /
 * Skip / Continue row. Shared by the wizard route and the shop's steps
 * (`shop-steps.tsx`) so every screen of setup reads as one flow.
 */

import * as React from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AUTH_CONTROL } from "@/components/auth-shell";

export function Step({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-tight text-balance sm:text-[32px]">{title}</h1>
      {sub && <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{sub}</p>}
      <div className="mt-8 space-y-4">{children}</div>
    </div>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5 [&_input]:h-11 [&_select]:h-11">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function Nav({
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled,
  busy,
  onSkip,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  busy?: boolean;
  onSkip?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 pt-2">
      {onBack && (
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back" disabled={busy}>
          <ArrowLeft className="size-4" />
        </Button>
      )}
      <div className="flex-1" />
      {onSkip && (
        <Button variant="ghost" onClick={onSkip} disabled={busy}>
          Skip for now
        </Button>
      )}
      <Button size="lg" className={AUTH_CONTROL} onClick={onNext} disabled={nextDisabled || busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {nextLabel}
        {!busy && <ArrowRight className="size-4" />}
      </Button>
    </div>
  );
}

/**
 * Pills where any number can be on, same look as {@link ChipQuestion}. Used for "What do
 * you do here yourself?", which sets the founder's own roles.
 */
export function MultiChipQuestion({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: readonly { id: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((opt) => {
          const on = value.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== opt.id) : [...value, opt.id])}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                on ? "border-primary bg-primary/5 text-primary" : "hover:bg-accent"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * An optional one-tap question: pills, at most one picked, and a short free-text
 * follow-up for the options that ask "which one?". Used for "how did you hear about us"
 * and "how do you schedule today" on the org-create page.
 */
export function ChipQuestion({
  id,
  label,
  options,
  value,
  onChange,
  detail,
  onDetailChange,
  detailPlaceholder,
}: {
  id: string;
  label: string;
  options: { id: string; label: string; detailLabel?: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
  /** Only needed when an option has a `detailLabel`. */
  detail?: string;
  onDetailChange?: (v: string) => void;
  detailPlaceholder?: string;
}) {
  const detailLabel = options.find((o) => o.id === value)?.detailLabel;
  return (
    <div>
      <Label>
        {label} <span className="font-normal text-muted-foreground">(optional)</span>
      </Label>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            aria-pressed={value === opt.id}
            onClick={() => onChange(value === opt.id ? null : opt.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              value === opt.id ? "border-primary bg-primary/5 text-primary" : "hover:bg-accent"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {detailLabel && value && onDetailChange ? (
        <div className="mt-3">
          <Field id={`${id}-detail`} label={detailLabel}>
            <Input
              id={`${id}-detail`}
              value={detail ?? ""}
              onChange={(e) => onDetailChange(e.target.value)}
              placeholder={detailPlaceholder}
              maxLength={255}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
