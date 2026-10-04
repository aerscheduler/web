import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Building2,
  GraduationCap,
  Headset,
  KeyRound,
  Loader2,
  Plane,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { isDemoSync, useAuth } from "@/lib/auth";
import { ApiError, isTokenExpired } from "@/lib/api";
import { getDemoMeta } from "@/lib/demo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LogoLockup } from "@/components/logo";

/**
 * Where a demo visitor may be sent. `?to=work-orders` opens the sample shop's job board,
 * for a mechanic sent here from the shop side of the site or from setup. An allowlist,
 * never a path, so the parameter cannot send anybody anywhere else.
 */
type Landing = "work-orders";

export const Route = createFileRoute("/demo")({
  validateSearch: (search: Record<string, unknown>): { to?: Landing } =>
    search.to === "work-orders" ? { to: "work-orders" } : {},
  component: DemoEntry,
});

type DemoRole =
  | "owner"
  | "admin"
  | "dispatcher"
  | "instructor"
  | "student"
  | "renter"
  | "technician"
  | "aircraftOwner";

/**
 * Who a visitor can be, asked FIRST (Tony, 2026-10-03). "Show me this as a dispatcher" is the
 * question a prospect actually has, and the old entry answered it only after dropping
 * everybody on the owner's dashboard and leaving the switcher in the banner to be found.
 *
 * Each role lands where that person works. The banner's "Switch role" still changes it later.
 */
const ROLES: { role: DemoRole; title: string; blurb: string; icon: LucideIcon }[] = [
  { role: "owner", title: "Owner", blurb: "Runs the operation: the whole board, billing and settings.", icon: Building2 },
  { role: "dispatcher", title: "Dispatcher", blurb: "The front desk: the day's schedule and booking for others.", icon: Headset },
  { role: "instructor", title: "Instructor", blurb: "Their own day, their students, closing out and grading lessons.", icon: GraduationCap },
  { role: "student", title: "Student", blurb: "Book a lesson, follow their training and pay their invoices.", icon: BookOpen },
  { role: "renter", title: "Renter", blurb: "Book an aircraft they are checked out in and pay for the flight.", icon: Plane },
  { role: "technician", title: "Mechanic", blurb: "Squawks, inspections and work orders, on the fleet and customers' aircraft.", icon: Wrench },
  // The shop's customer, from outside the organization: no roles, matched by `external`.
  {
    role: "aircraftOwner",
    title: "Aircraft owner",
    blurb: "Answer the shop's findings, see their aircraft's times and inspections, and pay the bill.",
    icon: KeyRound,
  },
];
// Admin is left off: in the sample it sees what the owner sees. It is still one click away in
// the banner's "Switch role". Seven cards leave one over, so the last card takes the whole row.

// A visitor who came for the shop sees the mechanic, then the mechanic's customer.
const SHOP_FIRST: DemoRole[] = ["technician", "aircraftOwner", "owner", "dispatcher", "instructor", "student", "renter"];

/**
 * The identity a card switches to. The outside owner has no roles, so it is found by the flag
 * the server sets on it; everyone else by their role.
 */
function identityFor(role: DemoRole) {
  const identities = getDemoMeta()?.identities ?? [];
  return role === "aircraftOwner"
    ? identities.find((i) => i.external)
    : identities.find((i) => !i.external && i.roles[0] === role);
}

/** Roles that can open the shop's work orders, so `?to=work-orders` means something to them. */
const SHOP_ROLES: DemoRole[] = ["owner", "admin", "technician"];

function landingFor(role: DemoRole, to: Landing | undefined) {
  if (to === "work-orders" && SHOP_ROLES.includes(role)) {
    return { to: "/maintenance", search: { view: "work-orders" } };
  }
  if (role === "technician") return { to: "/maintenance" };
  if (role === "owner" || role === "admin" || role === "dispatcher") return { to: "/dashboard" };
  return { to: "/me" };
}

/**
 * The way in. One click on the marketing site lands here, the visitor picks who to be, a
 * sandbox session is minted as that person, and they land where that person works.
 *
 * Nothing is minted until a role is picked, which also keeps visitors who bounce off this
 * screen from spending the per-IP budget.
 *
 * Deliberately has no sign-in form and no Google or Apple buttons. Those create REAL
 * accounts (`completeOAuthSignIn` writes a user row), which is the opposite of what someone
 * who clicked "try it without signing up" asked for, and the point of the demo is that there
 * is nothing to sign up for.
 */
function DemoEntry() {
  const { startDemo, switchDemoRole } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { to } = Route.useSearch();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<DemoRole | null>(null);
  const checked = useRef(false);

  // Already inside a live demo in this tab: navigating back to /demo means "take me to the
  // demo", not "throw that one away and ask again". Minting again would also spend the
  // per-IP budget for no reason.
  const [resuming] = useState(() => isDemoSync() && !isTokenExpired());
  useEffect(() => {
    if (!resuming || checked.current) return;
    checked.current = true;
    void navigate({
      ...(to === "work-orders" ? { to: "/maintenance", search: { view: "work-orders" } } : { to: "/dashboard" }),
      replace: true,
    } as never);
  }, [resuming, navigate, to]);

  async function start(role: DemoRole) {
    if (starting) return;
    setStarting(role);
    setError(null);
    try {
      // The sandbox starts as its owner; anyone else is one switch away.
      await startDemo();
      // Where the visitor lands follows who they actually are: a sandbox that does not offer
      // the picked identity leaves them as the owner, on the owner's page, not on another
      // role's page under the owner's name.
      let became: DemoRole = "owner";
      if (role !== "owner") {
        const identity = identityFor(role);
        if (identity) {
          await switchDemoRole(identity.orgUserId);
          qc.clear();
          became = role;
        }
      }
      await navigate({ ...landingFor(became, to), replace: true } as never);
    } catch (err) {
      setStarting(null);
      // The server's own message is the pool-aware one ("every sandbox is in use…" on a
      // busy pool), so prefer it; fall back only when it's missing.
      setError(
        err instanceof ApiError
          ? err.message ||
              (err.status === 503
                ? "Every demo sandbox is in use right now. Try again in a moment."
                : "The demo isn’t available right now. Try again in a moment.")
          : "We couldn't reach the server. Check your connection and try again."
      );
    }
  }

  if (resuming) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // The mechanic first for a visitor who came for the shop.
  const roles = to === "work-orders" ? [...ROLES].sort((a, b) => SHOP_FIRST.indexOf(a.role) - SHOP_FIRST.indexOf(b.role)) : ROLES;

  return (
    <div className="min-h-dvh bg-background px-6 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-10 flex justify-center">
          <LogoLockup />
        </div>
        <h1 className="text-center text-[28px] font-semibold tracking-tight text-balance sm:text-[32px]">
          Who do you want to try it as?
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-center text-[15px] leading-relaxed text-muted-foreground">
          A sample flight school with a fleet, a roster, a maintenance shop and a few months of
          history. Nothing here is real, and you can switch roles any time from the banner.
        </p>

        {error ? (
          <div className="mx-auto mt-6 max-w-xl rounded-lg border bg-muted/40 p-4 text-center text-sm" role="alert">
            <p>{error}</p>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => setError(null)}>
              Try again
            </Button>
          </div>
        ) : null}

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {roles.map(({ role, title, blurb, icon: Icon }, i) => (
            <button
              key={role}
              type="button"
              data-testid={`demo-role-${role === "aircraftOwner" ? "aircraft-owner" : role}`}
              onClick={() => void start(role)}
              disabled={starting != null}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40 disabled:cursor-default",
                // An odd card out takes the whole row rather than sitting alone in half of it.
                roles.length % 2 === 1 && i === roles.length - 1 && "sm:col-span-2",
                starting === role && "border-primary bg-primary/5 ring-1 ring-primary",
                starting != null && starting !== role && "opacity-50"
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
                {starting === role ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{title}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{blurb}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
