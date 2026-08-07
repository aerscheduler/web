import * as React from "react";
import { readConsent, setConsent } from "@/lib/analytics";
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
 * Deliberately bottom-left and small: the console is a working tool, and a modal in
 * front of a dispatcher's schedule on a Monday morning is not a reasonable thing to do
 * over analytics.
 */
export function ConsentBanner() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    // Read on the client only. The answer lives in a cookie, and rendering from it
    // before mount would flash the banner at people who already decided.
    if (readConsent() === "unset") setVisible(true);
  }, []);

  if (!visible) return null;

  function decide(state: "granted" | "denied") {
    // setConsent starts or stops PostHog immediately, so accepting takes effect on this
    // page rather than the next one.
    setConsent(state);
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
