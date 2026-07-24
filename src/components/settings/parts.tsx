import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** A labelled vertical field wrapper for settings forms. */
export function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** A read-only label:value row, right-aligned value. */
export function ReadOnlyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{children}</span>
    </div>
  );
}

/**
 * A preference toggle for a capability that isn't wired up yet: a disabled
 * `Switch` plus a "Coming soon" tooltip — surfaced rather than hidden so admins
 * can see what's on the roadmap.
 */
export function ComingSoonToggle({
  label,
  description,
  defaultOn = false,
}: {
  label: string;
  description?: string;
  defaultOn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          {label}
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Soon
          </span>
        </div>
        {description && (
          <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex shrink-0 cursor-not-allowed">
            <Switch
              disabled
              defaultChecked={defaultOn}
              aria-label={`${label} (coming soon)`}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent>Coming soon</TooltipContent>
      </Tooltip>
    </div>
  );
}
