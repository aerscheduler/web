import * as React from "react";
import type { Appearance } from "@stripe/stripe-js";

/** True when the console is in dark mode (class-based `.dark` on the root element). */
export function useIsDark(): boolean {
  const get = () =>
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
  const [dark, setDark] = React.useState(get);

  React.useEffect(() => {
    const obs = new MutationObserver(() => setDark(get()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return dark;
}

/**
 * Stripe Elements renders in its own iframe and can't read our CSS tokens, so we hand it an
 * appearance that mirrors the console: AerScheduler blue as the primary, matching surfaces and
 * radius, tuned for whichever theme is active.
 */
export function stripeAppearance(dark: boolean): Appearance {
  return {
    theme: dark ? "night" : "stripe",
    variables: {
      colorPrimary: "#1967d2",
      colorBackground: dark ? "#1b2430" : "#ffffff",
      colorText: dark ? "#e6e9ee" : "#363740",
      colorDanger: "#d92d20",
      borderRadius: "8px",
      fontSizeBase: "15px",
      spacingUnit: "4px",
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
  };
}
