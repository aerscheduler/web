import * as React from "react";
import { useRouterState } from "@tanstack/react-router";
import { bootstrapAnalyticsConsent, isPublicGuestBookingPath, setConsent } from "@/lib/analytics";
import { startAds, stopAds, syncGoogleConsent } from "@/lib/ads";
import { Button } from "@/components/ui/button";

/**
 * The cookie banner, for people who reach the console without passing through the
 * marketing site: a bookmark, the mobile app's "open on the web" link, an emailed
 * invitation.
 *
 * Consent lives on a `.aerscheduler.com` cookie shared with the marketing site, so the
 * common path (read a feature page, click a CTA, land here) never sees this twice.
 * Being asked again immediately after answering reads as the product being broken.
 *
 * US visitors are not prompted: product analytics is treated as granted there (see
 * `bootstrapAnalyticsConsent`). Non-US and unknown geo still get this card. An
 * explicit prior decline always wins over geo.
 *
 * Guest booking pages never show this card. An iframe on a school's site is their
 * visitor, not ours, and a share link should not put AerScheduler cookies over the
 * request form. Embeds also skip PostHog, ads, and replay.
 *
 * Deliberately bottom-left and small: the console is a working tool, and a modal in
 * front of a dispatcher's schedule on a Monday morning is not a reasonable thing to do
 * over analytics.
 */
export function ConsentBanner() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const [visible, setVisible] = React.useState(false);
  const hide = isPublicGuestBookingPath(pathname);

  React.useEffect(() => {
    // Country cookie is stamped by middleware on the HTML response, so it is already
    // readable when this effect runs. Read on the client only so we never flash the
    // banner at people who already decided (or who are in the US).
    if (hide) {
      setVisible(false);
      return;
    }
    if (bootstrapAnalyticsConsent()) setVisible(true);
  }, [pathname, search, hide]);

  React.useEffect(() => {
    if (!visible) return;
    document.documentElement.classList.add("consent-banner-open");
    return () => document.documentElement.classList.remove("consent-banner-open");
  }, [visible]);

  if (hide || !visible) return null;

  function decide(state: "granted" | "denied") {
    // setConsent starts or stops PostHog immediately, so accepting takes effect on this
    // page rather than the next one.
    setConsent(state);
    // Google is told either way: granted lifts it out of cookieless mode, denied puts it
    // back. stopAds() already calls syncGoogleConsent(), so only the grant path needs it.
    if (state === "granted") {
      syncGoogleConsent();
      startAds();
    } else {
      stopAds();
    }
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed bottom-4 left-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border bg-card p-4 shadow-lg"
    >
      <p className="text-sm font-medium">Cookies</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        We use cookies to see how AerScheduler gets used so we can improve it. Decline and
        we&rsquo;ll only keep what signing in requires.
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => decide("granted")}>
          Accept
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={() => decide("denied")}>
          Decline
        </Button>
      </div>
    </div>
  );
}
