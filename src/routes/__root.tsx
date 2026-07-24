import { Outlet, createRootRoute, Link } from "@tanstack/react-router";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});

function RootLayout() {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={200}>
        <Outlet />
        <Toaster richColors closeButton position="bottom-right" />
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
