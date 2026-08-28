import type { ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useWideMode } from "@/lib/wide-mode";
import { shortcutLabel } from "@/lib/platform";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function PageHeader({
  title,
  subtitle,
  actions,
  wide = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /**
   * This page can use the whole window, so offer the Wide toggle.
   *
   * The page's single opt-in: it both renders the control and marks the page for the app
   * shell, which drops its width cap on `:has([data-wide-ok])`. Set it on screens whose
   * content SCALES with width, boards, tables, the inbox, reports. Leave it off for forms
   * and prose, which do not read better wide however big the monitor is, and where a
   * control that changed nothing visible would just teach people the toggle is unreliable.
   */
  wide?: boolean;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-balance">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {(actions || wide) && (
        <div className="flex items-center gap-2">
          {actions}
          {wide && <WideToggle />}
        </div>
      )}
    </div>
  );
}

/**
 * The Wide control, and the marker the shell looks for.
 *
 * Deliberately last in the action row: it is a preference about the window rather than
 * something you do to this page, so it should not sit where the page's own verbs are.
 *
 * NOT called "fullscreen". Browsers have a real fullscreen API and an F11 that hides all
 * the chrome, and a control promising that and leaving the navigation in place is a
 * control that lied.
 *
 * Hidden below lg. The cap only binds on a window wider than it, so on a laptop or a phone
 * this is a button that visibly does nothing.
 */
function WideToggle() {
  const { wide, toggle } = useWideMode();
  const Icon = wide ? Minimize2 : Maximize2;
  const label = wide ? "Use a narrower layout" : "Use the full width";

  return (
    // The marker the shell's `:has()` reads. On the button itself rather than a stray span
    // so there is exactly one of them, and it cannot outlive the control it describes.
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-wide-ok
          aria-pressed={wide}
          aria-label={label}
          onClick={toggle}
          className="hidden lg:inline-flex"
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        <span className="ml-2 text-muted-foreground">{shortcutLabel("\\")}</span>
      </TooltipContent>
    </Tooltip>
  );
}
