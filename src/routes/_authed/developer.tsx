import { useState, type FormEvent } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, KeyRound, ShieldAlert, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { isDeveloperSync, postLoginPath, useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RAIL_ROW, SectionRail, type RailSection } from "@/components/section-rail";
import { TableView } from "@/components/table-view";
import { OrganizationsTable } from "@/components/developer/organizations-table";

/**
 * Developer tools. Gated to the allowlisted developer accounts, but only for
 * tidiness: every endpoint behind this page is independently enforced server-side
 * by `isDeveloper()`, so reaching the route by URL gains nothing.
 */
export const Route = createFileRoute("/_authed/developer")({
  beforeLoad: () => {
    if (!isDeveloperSync()) throw redirect({ to: "/me" });
  },
  validateSearch: (s: Record<string, unknown>): { tab?: string } => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
  component: DeveloperPage,
});

/**
 * A rail, not tabs, for the reason section-rail.tsx gives: these sections are separate
 * screens rather than filtered views of one list, and the page is going to keep growing
 * sections. Two tabs were already the wrong shape, "log in as somebody" and "every
 * school we have" have nothing to do with each other.
 *
 * The active section lives in `?tab=`, matching Settings and Reports, so a link to a
 * particular tool survives being pasted to somebody else.
 */
const SECTIONS: RailSection[] = [
  {
    label: "Support",
    items: [{ value: "login-as", label: "Log in as", icon: UserCheck }],
  },
  {
    label: "Customers",
    items: [{ value: "organizations", label: "Organizations", icon: Building2 }],
  },
];

const DEFAULT_TAB = "login-as";

function DeveloperPage() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();

  const known = SECTIONS.flatMap((s) => s.items).map((i) => i.value);
  const active = search.tab && known.includes(search.tab) ? search.tab : DEFAULT_TAB;

  const pick = (tab: string) => {
    void navigate({ search: (prev) => ({ ...prev, tab }), replace: true });
  };

  return (
    <TableView className="gap-5">
      <TableView.Header>
        <PageHeader title="Developer" subtitle="Internal support tools. Not visible to customers." />
      </TableView.Header>

      <div className={RAIL_ROW}>
        <SectionRail label="Developer" sections={SECTIONS} value={active} onChange={pick} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          {active === "login-as" && <LoginAsTab />}
          {active === "organizations" && <OrganizationsTable />}
        </div>
      </div>
    </TableView>
  );
}

function LoginAsTab() {
  const { loginAs, isImpersonating, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once impersonating, the bearer token belongs to the target user, so the
  // server's isDeveloper() check would reject a second hop anyway. Say so up
  // front instead of letting the form fail with a bare 403.
  if (isImpersonating) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-amber-600 dark:text-amber-500" />
            Already signed in as someone else
          </CardTitle>
          <CardDescription>
            You are viewing the app as {user?.email ?? "another user"}. Exit that session using the
            banner at the top of the screen to get your developer account back, then you can log in
            as somebody else.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const target = email.trim().toLowerCase();

    if (!target) {
      setError("Enter the email of the account you want to open.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await loginAs(target);
      // Nothing cached belongs to this new user.
      qc.clear();
      toast.success(`Signed in as ${target}`);
      // Land exactly where a real login would put them, staff get /dashboard,
      // everyone else /me, and a user mid-signup gets /onboarding.
      await navigate({ to: postLoginPath() });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Could not sign in as that user. Check the email and try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" />
          Log in as
        </CardTitle>
        <CardDescription>
          Open the app as another user to reproduce what they are reporting. You get a real session
          with their permissions, so treat it as their account: anything you change, you changed for
          them. The session lasts one hour and is logged.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4 sm:max-w-md">
          <div className="grid gap-2">
            <Label htmlFor="loginAsEmail">Log in as</Label>
            <Input
              id="loginAsEmail"
              type="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="pilot@flightschool.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "loginAsEmailError" : undefined}
            />
            {error && (
              <p id="loginAsEmailError" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          {/* Enabled regardless of field state; validation happens on submit with a
              visible reason. (House rule, never ship a silently-disabled submit.) */}
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Signing in…" : "Log in as this user"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
