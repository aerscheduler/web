import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CalendarX2,
  LayoutDashboard,
  LogOut,
  PlaneTakeoff,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useAuth } from "@/lib/auth";
import { canAccess, isAdmin } from "@/lib/permissions";
import type { Role } from "@/types/api";
import { useMembers, usePlanes, useInvoices } from "@/features/queries";
import { resourceLabel } from "@/types/api";
import { formatMoney } from "@/lib/utils";

type CommandMenuContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const CommandMenuContext = React.createContext<CommandMenuContextValue | null>(null);

/** Access the global ⌘K palette (e.g. a topbar "Search…" button). */
export function useCommandMenu() {
  const ctx = React.useContext(CommandMenuContext);
  if (!ctx) throw new Error("useCommandMenu must be used within CommandMenuProvider");
  return ctx;
}

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/people", label: "People", icon: Users },
  { to: "/aircraft", label: "Aircraft", icon: PlaneTakeoff },
  { to: "/billing", label: "Billing", icon: Receipt },
  { to: "/compliance", label: "Go / No-Go", icon: ShieldCheck },
  { to: "/operations/cancellations", label: "Cancellations", icon: CalendarX2 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function CommandMenuProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { logout, organization, roles } = useAuth();
  const R = roles as Role[];

  // Entity search — client-side over cached lists (the API has no server search).
  // `enabled` only when the palette is open, so we don't fetch on every page.
  // Invoices are admin-only on the server, so only fetch them for admins.
  const members = useMembers(undefined, { enabled: open });
  const planes = usePlanes(undefined, { enabled: open });
  const invoices = useInvoices(undefined, { enabled: open && isAdmin(R) });

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const run = React.useCallback((fn: () => void) => {
    setOpen(false);
    fn();
  }, []);

  return (
    <CommandMenuContext.Provider value={{ open, setOpen }}>
      {children}
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Command palette"
        description="Search and jump to anything"
      >
        <CommandInput placeholder="Search people, aircraft, invoices — or type a command…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Go to">
            {NAV.filter((item) => canAccess(item.to, R)).map((item) => (
              <CommandItem
                key={item.to}
                value={`nav ${item.label}`}
                onSelect={() => run(() => navigate({ to: item.to }))}
              >
                <item.icon className="text-muted-foreground" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>

          {organization && (members.data?.length || planes.data?.length || invoices.data?.length) ? (
            <>
              <CommandSeparator />
              {planes.data && planes.data.length > 0 && (
                <CommandGroup heading="Aircraft">
                  {planes.data.slice(0, 6).map((p) => (
                    <CommandItem
                      key={`plane-${p.id}`}
                      value={`aircraft ${resourceLabel(p).name}`}
                      onSelect={() => run(() => navigate({ to: "/aircraft" }))}
                    >
                      <PlaneTakeoff className="text-muted-foreground" />
                      {resourceLabel(p).name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {members.data && members.data.length > 0 && (
                <CommandGroup heading="People">
                  {members.data.slice(0, 6).map((m) => (
                    <CommandItem
                      key={`member-${m.id}`}
                      value={`person ${m.user?.name ?? ""} ${m.user?.email ?? ""}`}
                      onSelect={() => run(() => navigate({ to: "/people" }))}
                    >
                      <Users className="text-muted-foreground" />
                      {m.user?.name ?? m.user?.email ?? "Member"}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {invoices.data && invoices.data.length > 0 && (
                <CommandGroup heading="Invoices">
                  {invoices.data.slice(0, 6).map((inv) => (
                    <CommandItem
                      key={`inv-${inv.id}`}
                      value={`invoice ${inv.id} ${inv.customer?.user?.name ?? ""}`}
                      onSelect={() => run(() => navigate({ to: "/billing" }))}
                    >
                      <Receipt className="text-muted-foreground" />
                      Invoice #{inv.id}
                      <span className="ml-auto tnum text-muted-foreground">
                        {formatMoney(inv.total)}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          ) : null}

          <CommandSeparator />
          {/* Theme lives in Settings → Appearance and Profile → Appearance; it
              doesn't earn a slot in the command palette. */}
          <CommandGroup heading="Actions">
            <CommandItem
              value="sign out logout"
              onSelect={() =>
                run(() => {
                  logout();
                  qc.clear();
                  navigate({ to: "/login" });
                })
              }
            >
              <LogOut className="text-muted-foreground" />
              Sign out
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </CommandMenuContext.Provider>
  );
}
