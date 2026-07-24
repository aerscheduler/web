import { Outlet, createRootRoute, Link } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => (
    <div className="grid min-h-dvh place-items-center bg-background p-8 text-center">
      <div className="max-w-sm">
        <p className="font-mono text-sm font-semibold text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Off the sectional</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          That page isn&rsquo;t on the chart. Let&rsquo;s get you back on course.
        </p>
        <Link
          to="/dashboard"
          className="mt-6 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  ),
});
