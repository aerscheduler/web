import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Shared shell for every org integration detail page.
 * Catalog cards live on Settings → Integrations; each provider gets its own route.
 */
export function IntegrationPageShell({
  icon: Icon,
  iconClassName,
  title,
  subtitle,
  status,
  accountLabel,
  actions,
  children,
  ...rest
}: {
  icon: LucideIcon;
  iconClassName?: string;
  title: string;
  subtitle: string;
  status?: ReactNode;
  accountLabel?: string | null;
  actions?: ReactNode;
  children: ReactNode;
  // Carries the help docs' `data-doc-shot` crop id through to this page's content
  // column, for the provider pages whose screenshot is the page rather than one card.
} & Omit<ComponentProps<"div">, "children" | "title">) {
  return (
    <div className="flex w-full flex-col gap-6" {...rest}>
      <div>
        <Link
          to="/settings"
          search={{ tab: "integrations", qbo: undefined }}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Integrations
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={cn(
                "grid size-12 shrink-0 place-items-center rounded-xl text-white shadow-sm",
                iconClassName ?? "bg-primary"
              )}
            >
              <Icon className="size-6" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em]">
                  {title}
                </h1>
                {status}
              </div>
              <p className="mt-0.5 max-w-2xl text-[13px] text-muted-foreground">{subtitle}</p>
              {accountLabel ? (
                <p className="mt-2 text-sm">
                  <span className="text-muted-foreground">Connected as</span>{" "}
                  <span className="font-medium">{accountLabel}</span>
                </p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </div>

      <div className="flex w-full flex-col gap-4">{children}</div>
    </div>
  );
}

/** Opinionated section block on an integration detail page. */
export function IntegrationSection({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="w-full rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="space-y-4 px-5 py-4">{children}</div>
      {footer ? (
        <div className="border-t border-border bg-muted/20 px-5 py-3">{footer}</div>
      ) : null}
    </section>
  );
}

/** Full-width catalog row — click opens the provider’s dedicated page. */
export function IntegrationCatalogCard({
  to,
  icon: Icon,
  iconClassName,
  title,
  description,
  status,
  disabled,
  disabledReason,
}: {
  /** Absolute path under the console, e.g. `/settings/integrations/quickbooks`. */
  to: "/settings/integrations/quickbooks";
  icon: LucideIcon;
  iconClassName?: string;
  title: string;
  description: string;
  status?: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const body = (
    <>
      <span
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-xl text-white shadow-sm",
          iconClassName ?? "bg-primary",
          disabled && "opacity-60"
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold tracking-tight">{title}</h3>
          {status}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        {disabled && disabledReason ? (
          <p className="mt-1.5 text-xs text-muted-foreground">{disabledReason}</p>
        ) : null}
      </div>
      {!disabled ? (
        <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      ) : null}
    </>
  );

  if (disabled) {
    return (
      <Card className="flex w-full max-w-none items-start gap-4 p-4 opacity-80 sm:p-5">
        {body}
      </Card>
    );
  }

  return (
    <Link
      to={to}
      search={{ qbo: undefined }}
      className="group block w-full max-w-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="flex w-full max-w-none items-start gap-4 p-4 transition-colors hover:bg-muted/40 sm:p-5">
        {body}
      </Card>
    </Link>
  );
}

const STATUS_TOOLTIPS: Record<string, string> = {
  connected:
    "QuickBooks is connected, an income item is mapped, and sync can run when enabled.",
  needs_mapping:
    "QuickBooks is connected, but setup isn’t finished — pick an income item below, then turn sync on.",
  needs_reconnect:
    "The QuickBooks connection expired or was revoked. Reconnect to resume syncing.",
  error: "Something went wrong with this connection. Check the last error or reconnect.",
  disconnected: "Not linked to a QuickBooks company yet. Connect to get started.",
};

export function integrationStatusBadge(
  status: "disconnected" | "connected" | "needs_mapping" | "needs_reconnect" | "error" | string
) {
  let badge: ReactNode;
  switch (status) {
    case "connected":
      badge = <Badge>Connected</Badge>;
      break;
    case "needs_mapping":
      badge = <Badge variant="secondary">Needs setup</Badge>;
      break;
    case "needs_reconnect":
      badge = <Badge variant="danger">Reconnect</Badge>;
      break;
    case "error":
      badge = <Badge variant="danger">Error</Badge>;
      break;
    default:
      badge = <Badge variant="outline">Not connected</Badge>;
      status = "disconnected";
  }

  const tip = STATUS_TOOLTIPS[status] ?? STATUS_TOOLTIPS.disconnected;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help">{badge}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}
