import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PlaneTakeoff,
  Receipt,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { applyTheme, getTheme, type Theme } from "@/lib/theme";
import { cn, initials } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/people", label: "People", icon: Users },
  { to: "/aircraft", label: "Aircraft", icon: PlaneTakeoff },
  { to: "/billing", label: "Billing", icon: Receipt },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-background">
      {/* mobile overlay */}
      {mobileOpen && (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <Sidebar
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 transition-transform md:static md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        onNavigate={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate: () => void;
}) {
  const { user, organization, organizations, switchOrg } = useAuth();
  const qc = useQueryClient();

  async function onSwitch(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = Number(e.target.value);
    if (!id || id === organization?.id) return;
    await switchOrg(id);
    qc.clear();
  }

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className
      )}
    >
      {/* brand */}
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="grid size-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
          <PlaneTakeoff className="size-5" />
        </span>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight text-white">
            AerScheduler
          </div>
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/55">
            Console
          </div>
        </div>
      </div>

      {/* org switcher */}
      <div className="px-3 pb-2">
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
            Organization
          </div>
          {organizations.length > 1 ? (
            <select
              value={organization?.id ?? ""}
              onChange={onSwitch}
              className="mt-0.5 w-full cursor-pointer bg-transparent text-sm font-medium text-white outline-none"
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id} className="text-foreground">
                  {o.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="mt-0.5 truncate text-sm font-medium text-white">
              {organization?.name ?? "—"}
            </div>
          )}
        </div>
      </div>

      {/* nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            activeProps={{
              className:
                "bg-sidebar-accent text-white shadow-sm before:opacity-100",
            }}
            className="group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-sidebar-primary before:opacity-0 hover:bg-sidebar-accent/50 hover:text-white"
          >
            <item.icon className="size-[18px] shrink-0" />
            {item.label}
          </Link>
        ))}
      </nav>

      {/* user */}
      <UserCard name={user?.name} email={user?.email} />
    </aside>
  );
}

function UserCard({ name, email }: { name?: string; email?: string }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sidebar-primary/25 text-xs font-semibold text-white">
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-medium text-white">
            {name ?? "Signed in"}
          </div>
          <div className="truncate text-[11px] text-sidebar-foreground/55">
            {email ?? ""}
          </div>
        </div>
        <button
          aria-label="Sign out"
          title="Sign out"
          onClick={() => {
            logout();
            navigate({ to: "/login" });
          }}
          className="grid size-8 shrink-0 place-items-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-white"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const [theme, setTheme] = useState<Theme>(() => getTheme());

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-md md:px-8">
      <button
        aria-label="Open menu"
        onClick={onMenu}
        className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent md:hidden"
      >
        <Menu className="size-5" />
      </button>
      <div className="flex-1" />
      <button
        aria-label="Toggle theme"
        onClick={toggle}
        className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
      </button>
    </header>
  );
}
