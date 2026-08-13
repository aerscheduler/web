import { useEffect } from "react";
import { Outlet, createRootRoute, Link, useRouterState } from "@tanstack/react-router";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { SessionWatcher } from "@/components/session-watcher";
import { DemoWatcher } from "@/components/demo/demo-watcher";
import { ConsentBanner } from "@/components/consent-banner";
import { useOrgLedgerSettings } from "@/features/queries";
import { getToken } from "@/lib/api";

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});

/** Browser-tab titles per route, most-specific first (prefix match). */
const TITLES: Array<[string, string]> = [
  ["/me/schedule", "Schedule"],
  ["/me/book", "Book"],
  ["/me/invoices", "Invoices"],
  ["/me/payment-methods", "Payment methods"],
  ["/me/currencies", "Currencies"],
  ["/me/documents", "Documents"],
  ["/me/availability", "Availability"],
  ["/me/profile", "Profile"],
  ["/me/notifications", "Notification settings"],
  ["/me", "Home"],
  ["/dashboard", "Dashboard"],
  ["/schedule", "Calendar"],
  ["/people", "People"],
  ["/aircraft", "Aircraft"],
  ["/facilities", "Facilities"],
  ["/billing", "Billing"],
  ["/reports", "Reports"],
  ["/compliance", "Go / No-Go"],
  ["/maintenance", "Maintenance"],
  ["/operations/cancellations", "Cancellations"],
  ["/notifications", "Notifications"],
  ["/settings/integrations/quickbooks", "QuickBooks"],
  ["/settings", "Settings"],
  ["/onboarding", "Get started"],
  ["/join", "Join a school"],
  ["/demo", "Demo"],
  ["/login", "Sign in"],
  ["/signup", "Create account"],
  ["/auth/callback", "Signing in"],
  ["/forgot-password", "Reset password"],
  ["/reset-password", "Reset password"],
];

/** Keeps the browser-tab title in sync as the route changes. */
function RouteTitle() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ledgerQ = useOrgLedgerSettings({
    enabled: !!getToken(),
  });
  useEffect(() => {
    const match = TITLES.find(([p]) => pathname === p || pathname.startsWith(p + "/"));
    let label = match?.[1];
    if (pathname.startsWith("/me/invoices") && ledgerQ.data?.enabled === true) {
      label = "Billing";
    }
    document.title = label ? `${label} · AerScheduler` : "AerScheduler";
  }, [pathname, ledgerQ.data?.enabled]);
  return null;
}

function RootLayout() {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={200}>
        <RouteTitle />
        <SessionWatcher />
        <DemoWatcher />
        <Outlet />
        <ConsentBanner />
        <Toaster closeButton position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  );
}

function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background p-8 text-center">
      <div className="max-w-sm">
        <p className="font-mono text-sm font-semibold text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Off the sectional</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          That page isn&rsquo;t on the chart. Let&rsquo;s get you back on course.
        </p>
        <Button asChild className="mt-6">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
