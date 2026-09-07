import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LogoLockup } from "@/components/logo";

/**
 * Shared frame for sign-in / sign-up / password-reset / verify-email / onboarding.
 *
 * Chrome (logo, cross-link, copyright) sits on the viewport edges so desktop
 * uses the full screen. `auth` keeps a short form centered; `page` is a
 * top-aligned, centered column for the onboarding wizard.
 *
 * The middle band is the only scroller, so a tall signup on a short phone
 * does not clip Create account into a sliver under a growing page.
 * When the cookie banner is open, the outer shell shrinks (`pb-52`) so that
 * scroller can put the CTA above the card, not under it.
 */
export function AuthShell({
  children,
  aside,
  variant = "auth",
  scrollKey,
}: {
  children: ReactNode;
  aside?: ReactNode;
  variant?: "auth" | "page";
  /** Remount the middle scroller (e.g. onboarding step) so it starts at the top. */
  scrollKey?: string | number;
}) {
  const page = variant === "page";
  return (
    <div className="relative isolate flex h-dvh max-h-dvh flex-col overflow-hidden bg-background text-foreground in-[.consent-banner-open]:pb-52">
      <BrandBackdrop />

      <header className="relative z-10 flex shrink-0 items-center justify-between gap-3 px-5 py-4 sm:px-8 sm:py-5 lg:px-12">
        <LogoLockup />
        {aside ? (
          <div className="min-w-0 text-right text-[13px] leading-snug text-muted-foreground sm:text-sm">
            {aside}
          </div>
        ) : null}
      </header>

      <div
        key={scrollKey ?? "main"}
        className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-6 sm:px-8 sm:py-10 lg:px-12 lg:py-12"
      >
        <main
          className={cn(
            "w-full",
            page ? "mx-auto max-w-5xl" : "mx-auto max-w-[440px] sm:my-auto"
          )}
        >
          {children}
        </main>
      </div>

      <footer className="relative z-10 shrink-0 px-5 py-4 text-xs text-muted-foreground sm:px-8 lg:px-12">
        &copy; {new Date().getFullYear()} AerScheduler
      </footer>
    </div>
  );
}

/** 44px so the control is a real tap target on a phone, not the dashboard's h-8. */
export const AUTH_CONTROL = "h-11";

export function BrandBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="auth-glow-a absolute -left-[18%] -top-[40%] size-[70vmax] rounded-full opacity-40 dark:opacity-70"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklch, var(--foreground) 9%, transparent) 0%, transparent 68%)",
        }}
      />
      <div
        className="auth-glow-b absolute -right-[16%] -bottom-[28%] size-[80vmax] rounded-full opacity-35 dark:opacity-60"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklch, var(--foreground) 8%, transparent) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
