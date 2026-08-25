import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FlaskConical, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { roleLabel } from "@/lib/demo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The standing "none of this is real" bar, and what a visitor can do with the
 * sandbox: change who they are, or leave.
 *
 * ONE LINE AT EVERY WIDTH. This sits above every page, so whatever it costs it
 * costs everywhere, and on a phone the full sentence wrapped to three lines
 * with the buttons on a fourth, roughly a fifth of the screen, permanently. So
 * the prose is desktop-only and a phone gets the two facts that are actually
 * load-bearing: that this is a demo, and who you are in it.
 *
 * Rendered ABOVE the subscription gate, alongside the impersonation banner and
 * for the same reason stated there, the gate can replace the entire app shell,
 * and a banner living inside the shell would vanish exactly when the visitor most
 * needs the way out.
 *
 * The role switcher is the point of the whole feature. "Show me this as a
 * dispatcher" is the question a prospect actually has, and answering it without
 * seven sets of credentials to hand out is most of why the demo exists.
 */
export function DemoBanner() {
  const { isDemo, demo, user, roles, switchDemoRole, exitDemo } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  if (!isDemo || !demo) return null;

  const become = async (orgUserId: number, name: string) => {
    setBusy(true);
    try {
      await switchDemoRole(orgUserId);
      // Every cached query was answered for the previous role, and the roles see
      // deliberately different data, a student's own schedule is not the whole
      // board. Keeping any of it would show one role's data under another's name.
      qc.clear();
      toast.success(`Now viewing as ${name}`);
      // Land somewhere that role can actually use: staff get the dispatch view,
      // everyone else their own home. Mirrors postLoginPath without the checks
      // that cannot apply here (a demo account is verified and has an org).
      await navigate({ to: "/dashboard" });
    } catch {
      toast.error("Couldn't switch role", { description: "Try again in a moment." });
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    exitDemo();
    qc.clear();
    void navigate({ to: "/login" });
  };

  const current = roles.length ? roles.map(roleLabel).join(" + ") : "Demo";

  return (
    <div
      className="flex items-center gap-2 border-b border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm md:px-10"
      data-testid="demo-banner"
    >
      <FlaskConical className="size-4 shrink-0 text-sky-600 dark:text-sky-400" />

      {/* `min-w-0 truncate` rather than a breakpoint on the role: a visitor with
          four grants would otherwise be the one case that wraps. */}
      <p className="min-w-0 truncate">
        <span className="font-medium">Demo</span>
        <span className="text-muted-foreground"> &middot; {current}</span>
        <span className="hidden text-muted-foreground lg:inline">
          {" "}
          You&rsquo;re {user?.name ?? "a demo user"} at a made-up flight school. Change
          anything you like.
        </span>
      </p>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy}>
              Switch role
              <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>View the school as…</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {demo.identities.map((identity) => (
              <DropdownMenuItem
                key={identity.orgUserId}
                disabled={identity.orgUserId === demo.orgUserId}
                onSelect={() => void become(identity.orgUserId, identity.name)}
              >
                <div className="flex flex-col">
                  <span>{identity.roles.map(roleLabel).join(" + ")}</span>
                  <span className="text-xs text-muted-foreground">{identity.name}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Icon-only until there's room for the word, this is the way out, so
            it stays on the bar at every width rather than folding into a menu. */}
        <Button
          size="sm"
          variant="ghost"
          onClick={leave}
          disabled={busy}
          className="max-sm:px-2"
        >
          <LogOut className="size-4" />
          <span className="max-sm:sr-only">Exit</span>
        </Button>
      </div>
    </div>
  );
}
