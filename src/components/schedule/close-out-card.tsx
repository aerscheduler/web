import * as React from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * One folded-away part of a close-out.
 *
 * THE POINT IS THE SUMMARY, NOT THE FOLD.
 *
 * A shared ride opened four panels at once, each fully expanded: who pays what (five inputs
 * per person), a grader per student, the correction buttons, and the invoice. Three
 * students in one aircraft ran to roughly a screen and a half of form before the reader
 * reached anything telling them what to DO, and almost none of it needed touching on any
 * given booking.
 *
 * Folding alone would only trade a wall of inputs for a row of mystery buttons. So each
 * card has to answer its own question while shut: "3 payers, shares add up", "1 of 2
 * graded". Opening one is then a decision the reader makes knowing what is inside, and the
 * common case is that they never open it at all.
 *
 * `attention` is for a card whose summary is bad news. It opens itself, and it says so in
 * the header, because a close-out that cannot be billed must not be quiet about it.
 */
export function CloseOutCard({
  title,
  summary,
  icon: Icon,
  attention = false,
  defaultOpen = false,
  docShot,
  children,
}: {
  title: string;
  /** What the card would say if you opened it. Kept to a phrase. */
  summary?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  /** Something in here is blocking or wrong. Forces the card open and colours the summary. */
  attention?: boolean;
  defaultOpen?: boolean;
  docShot?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen || attention);

  // A problem that appears while the card is shut has to pull it open. The reverse is not
  // true: once a reader has opened or closed a card by hand, a background refetch must not
  // fold their work away underneath them.
  const wasAttention = React.useRef(attention);
  React.useEffect(() => {
    if (attention && !wasAttention.current) setOpen(true);
    wasAttention.current = attention;
  }, [attention]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-doc-shot={docShot}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50",
          open && "rounded-b-none",
          attention && "border-amber-500/50 bg-amber-500/5"
        )}
      >
        {attention ? (
          <TriangleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-500" />
        ) : (
          <Icon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="shrink-0 font-medium">{title}</span>
        {summary != null && (
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-right text-xs",
              attention ? "font-medium text-amber-600 dark:text-amber-500" : "text-muted-foreground"
            )}
          >
            {summary}
          </span>
        )}
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            summary == null && "ml-auto",
            open && "rotate-180"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="rounded-b-md border border-t-0 p-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
