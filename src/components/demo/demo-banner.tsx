import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FlaskConical, LogOut, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { roleLabel } from "@/lib/demo";
import { tokenExpiresAt } from "@/lib/api";
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
 * The standing "none of this is real" bar, and everything a visitor can do with
 * the sandbox: change who they are, put it back, or leave.
 *
 * Rendered ABOVE the subscription gate, alongside the impersonation banner and
 * for the same reason stated there — the gate can replace the entire app shell,
 * and a banner living inside the shell would vanish exactly when the visitor most
 * needs the way out.
 *
 * The role switcher is the point of the whole feature. "Show me this as a
 * dispatcher" is the question a prospect actually has, and answering it without
 * seven sets of credentials to hand out is most of why the demo exists.
 */
export function DemoBanner() {
  const { isDemo, demo, user, roles, switchDemoRole, resetDemo, exitDemo } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<null | "switch" | "reset">(null);

  if (!isDemo || !demo) return null;

  const become = async (orgUserId: number, name: string) => {
    setBusy("switch");
    try {
      await switchDemoRole(orgUserId);
      // Every cached query was answered for the previous role, and the roles see
      // deliberately different data — a student's own schedule is not the whole
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
      setBusy(null);
    }
  };

  const reset = async () => {
    setBusy("reset");
    try {
      await resetDemo();
      qc.clear();
      toast.success("Demo reset", { description: "Everything is back the way you found it." });
      await navigate({ to: "/dashboard" });
    } catch {
      toast.error("Couldn't reset the demo", { description: "Try again in a moment." });
    } finally {
      setBusy(null);
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
      className="flex flex-col gap-2 border-b border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm sm:flex-row sm:items-center sm:justify-between md:px-10"
      data-testid="demo-banner"
    >
      <div className="flex items-start gap-2.5">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <div>
          <span className="font-medium">
            Demo — you&rsquo;re {user?.name ?? "a demo user"} ({current})
          </span>{" "}
          <span className="text-muted-foreground">
            Sample data at a made-up flight school. Change anything you like.
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
        <TimeLeft />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy !== null}>
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

        <Button size="sm" variant="outline" onClick={() => void reset()} disabled={busy !== null}>
          <RotateCcw className="size-4" />
          Reset
        </Button>

        <Button size="sm" variant="ghost" onClick={leave} disabled={busy !== null}>
          <LogOut className="size-4" />
          Exit
        </Button>
      </div>
    </div>
  );
}

/**
 * How long is left, from the token's own `exp`.
 *
 * Shown because silent expiry is the worst version of this: a visitor mid-click
 * when the sandbox goes is owed some warning. Reading the token rather than
 * counting down from a stored duration means a refresh does not restart the
 * clock — and means the number on screen is the same number the server will
 * enforce.
 */
function TimeLeft() {
  const [left, setLeft] = useState<number | null>(() => remaining());

  useEffect(() => {
    const id = setInterval(() => setLeft(remaining()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (left === null) return null;

  const mins = Math.max(0, Math.round(left / 60_000));
  return (
    <span
      className={
        mins <= 5
          ? "hidden text-xs font-medium text-amber-600 sm:inline dark:text-amber-500"
          : "hidden text-xs text-muted-foreground sm:inline"
      }
    >
      {mins > 0 ? `${mins} min left` : "Ending now"}
    </span>
  );
}

function remaining(): number | null {
  const exp = tokenExpiresAt();
  return exp === null ? null : exp - Date.now();
}
