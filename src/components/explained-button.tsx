import * as React from "react";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

/**
 * A button that says on hover what pressing it will do, or why it cannot be pressed (Tony,
 * 2026-10-05: a button that is pressed into an error is a bad experience; disable it and explain).
 * The explanation is a hover card rather than a tooltip so it can hold the way to fix the reason
 * (add an owner's email, set a sales tax rate). A disabled button gets no pointer events, so the
 * card hangs on a wrapper, which a tap also opens on a touch screen.
 *
 * `summary` is the explanation as one plain sentence, read to a screen reader with the button.
 */
export function ExplainedButton({
  explain,
  summary,
  disabled,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { explain?: React.ReactNode; summary?: string }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  if (!explain) {
    return (
      <Button disabled={disabled} {...props}>
        {children}
      </Button>
    );
  }
  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={0} closeDelay={150}>
      <HoverCardTrigger asChild>
        <span className="inline-flex" tabIndex={disabled ? 0 : undefined} onClick={disabled ? () => setOpen((o) => !o) : undefined} data-explained={disabled ? "disabled" : "enabled"}>
          <Button disabled={disabled} aria-describedby={summary ? id : undefined} {...props}>
            {children}
          </Button>
          {summary && (
            <span id={id} className="sr-only">
              {summary}
            </span>
          )}
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-80 space-y-2 p-3 text-[13px] leading-relaxed" role="note">
        {explain}
      </HoverCardContent>
    </HoverCard>
  );
}
