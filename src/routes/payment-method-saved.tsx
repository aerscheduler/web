import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, XCircle } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";

/**
 * Where Stripe sends someone after the hosted "save a card" page.
 *
 * Deliberately PUBLIC. The mobile app opens that page in the system browser
 * (it has no Stripe SDK), and Stripe redirects here when it's done. Safari
 * usually has no console session, so gating this behind auth would answer a
 * finished card setup with a login form, which reads as "it didn't work".
 *
 * Nothing here talks to the API: the card is already attached by the time
 * Stripe redirects, and the app re-reads its list when it comes back to the
 * foreground. This page exists so the browser lands somewhere that says so.
 *
 * `?saved=1` is the success_url; without it, they backed out of Stripe's page.
 * See stripeSavePaymentMethodReturnUrl in server/src/utils/appLinks.ts.
 */
export const Route = createFileRoute("/payment-method-saved")({
  validateSearch: (search: Record<string, unknown>) => ({
    saved: search.saved === "1" || search.saved === 1 || search.saved === true,
  }),
  component: PaymentMethodSavedPage,
});

function PaymentMethodSavedPage() {
  const { saved } = Route.useSearch();

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <LogoMark className="size-10" />

      {saved ? (
        <CheckCircle2 className="size-12 text-[color-mix(in_oklch,var(--success,green)_80%,var(--foreground))]" />
      ) : (
        <XCircle className="size-12 text-muted-foreground" />
      )}

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {saved ? "Card saved" : "Nothing was saved"}
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {saved
            ? "You can close this tab. If you started from the AerScheduler app, switch back to it and your card will be there."
            : "You left before finishing, so no card was added and nothing was charged."}
        </p>
      </div>

      <Button asChild variant="outline">
        <Link to="/me/payment-methods">Open payment methods</Link>
      </Button>
    </div>
  );
}
