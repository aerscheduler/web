import { useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { beaconDemoExit, beaconDemoHeartbeat, setDemoEndedHandler } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * How often a visible demo tab pings the server to keep its sandbox leased. Well under
 * the server's idle-lease window (see services/demo.ts), so a couple of dropped pings
 * never reclaim a live sandbox — but frequent enough that a closed or backgrounded tab
 * lapses soon after it goes quiet.
 */
const DEMO_HEARTBEAT_MS = 5 * 60 * 1000;

/**
 * Turns "this sandbox is gone" into an offer of another one.
 *
 * A demo ends whenever its org is rebuilt or retired — someone hit Reset, or it
 * was reseeded underneath this tab. Every id in the token then points at a
 * deleted row, and the server answers 410 `DEMO_ENDED`.
 *
 * The whole reason this is separate from <SessionWatcher> is what happens next.
 * That one signs the user out and sends them to /login. For a demo visitor,
 * /login is a form for an account they have never had and cannot create from
 * there — the product looking broken at the exact moment they were enjoying it.
 * Here the answer is "start another", which is one click and costs nothing.
 *
 * Renders nothing.
 */
export function DemoWatcher() {
  const { isDemo, exitDemo, startDemo } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const onEnded = useCallback(() => {
    exitDemo();
    // The cached data describes an org that no longer exists.
    qc.clear();

    toast.message("This demo ended", {
      description: "The sandbox was rebuilt. Start a fresh one to keep looking around.",
      duration: 10_000,
      action: {
        label: "Start again",
        onClick: () => {
          void startDemo()
            .then(() => navigate({ to: "/dashboard", replace: true }))
            .catch(() => toast.error("Couldn't start a new demo", { description: "Try again in a moment." }));
        },
      },
    });

    // Not /login — see the note above. /demo mints a session and walks straight
    // back in, so a visitor who ignores the toast still ends up somewhere useful.
    void navigate({ to: "/demo", replace: true });
  }, [exitDemo, startDemo, navigate, qc]);

  useEffect(() => {
    setDemoEndedHandler(onEnded);
    return () => setDemoEndedHandler(null);
  }, [onEnded]);

  // Keep the sandbox held while the visitor is actually looking at it, and hand it
  // straight back when they close the tab. With the server's short idle lease, this is
  // what stops a small pool filling up with abandoned tabs: a visible tab pings every
  // few minutes; a hidden tab stops pinging and lapses on its own; a closed tab releases
  // at once. A brief tab-switch is deliberately NOT a release — only a real page-close —
  // so flicking away and back keeps your place.
  useEffect(() => {
    if (!isDemo) return;
    const beat = () => {
      if (document.visibilityState === "visible") beaconDemoHeartbeat();
    };
    beat(); // assert the lease the moment the demo mounts
    const id = window.setInterval(beat, DEMO_HEARTBEAT_MS);
    const onVisible = () => beat(); // re-assert right after coming back to the tab
    const onLeave = () => beaconDemoExit();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [isDemo]);

  return null;
}
