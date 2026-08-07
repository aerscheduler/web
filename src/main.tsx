import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { queryClient } from "./lib/query";
import { AuthProvider } from "./lib/auth";
import { captureAttribution } from "./lib/attribution";
import { startAnalytics, startDwell, trackFilters, trackPageview } from "./lib/analytics";
import { initTheme } from "./lib/theme";
import "./styles.css";

initTheme();
// Before the router touches the URL and before any OAuth hop leaves our origin,
// both of which would take the campaign params with them. See lib/attribution.ts.
captureAttribution();
// No-op unless they already accepted the banner, here or on the marketing site.
startAnalytics();

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultViewTransition: true,
});

// Pageviews come from the router rather than PostHog's own history listener, so a
// TanStack navigation that only changes search params still counts as a view, which is
// how the dispatch board and every filtered table move.
router.subscribe("onResolved", ({ toLocation }) => {
  const search = toLocation.search as Record<string, unknown> | undefined;
  trackPageview(toLocation.pathname, search);
  trackFilters(toLocation.pathname, search);
  startDwell(toLocation.pathname);
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
