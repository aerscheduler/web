import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { queryClient } from "./lib/query";
import { AuthProvider } from "./lib/auth";
import { captureAttribution } from "./lib/attribution";
import {
  bootstrapAnalyticsConsent,
  startDwell,
  trackFilters,
  trackPageview,
} from "./lib/analytics";
import { onNavigation, startInteractionTracking } from "./lib/interaction-tracking";
import { startAds, startConsentMode } from "./lib/ads";
import { initTheme } from "./lib/theme";
import { silenceAbortedViewTransitions } from "./lib/view-transitions";
import "./styles.css";

initTheme();
// Before the router touches the URL and before any OAuth hop leaves our origin,
// both of which would take the campaign params with them. See lib/attribution.ts.
captureAttribution();
// Starts PostHog when consent already exists, or when US geo implies it. The banner
// uses the same helper so it does not flash for US visitors.
bootstrapAnalyticsConsent();
// Same consent, different question: gtag reports which ad click paid for this visit.
// No-ops until VITE_GOOGLE_ADS_ID is set. See lib/ads.ts.
// Unconditional: installs the Google tag under Consent Mode v2 denied defaults so an
// unconsented signup is still reported as a cookieless ping. startAds() is the gated
// half (Meta only).
startConsentMode();
startAds();
// Delegated click and field instrumentation. Safe to wire before consent exists: it
// routes through `track()`, which drops everything until PostHog is consented AND
// loaded. See lib/interaction-tracking.ts for why this is not per-component.
startInteractionTracking();

// See lib/view-transitions.ts: the router drops the ViewTransition it starts, so a
// skipped one rejects into nowhere and lands in PostHog as a crash.
silenceAbortedViewTransitions();

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
  // Before the pageview: leaving a screen closes any half-filled form on it as an
  // abandonment, and that belongs to the screen being left, not the one arriving.
  onNavigation();
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
