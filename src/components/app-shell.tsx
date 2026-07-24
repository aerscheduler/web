import type { ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronsUpDown,
  Clock,
  CreditCard,
  FileText,
  Home,
  ChartColumnBig,
  LayoutDashboard,
  LogOut,
  Menu,
  MonitorPlay,
  Moon,
  MoreHorizontal,
  PlaneTakeoff,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  User as UserIcon,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/components/theme-provider";
import { CommandMenuProvider, useCommandMenu } from "@/components/command-menu";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { LogoMark } from "@/components/logo";
import { initials } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };
type NavGroup = { label: string; items: NavItem[] };

/** Build the nav from the caller's roles — staff get the admin console; everyone gets a personal section. */
function navForRoles(roles: string[], isStaff: boolean): NavGroup[] {
  const has = (r: string) => roles.includes(r);
  const groups: NavGroup[] = [];

  if (isStaff) {
    groups.push({
      label: "Operations",
      items: [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/schedule", label: "Schedule", icon: CalendarDays },
        { to: "/people", label: "People", icon: Users },
        { to: "/aircraft", label: "Aircraft", icon: PlaneTakeoff },
        { to: "/facilities", label: "Facilities", icon: MonitorPlay },
      ],
    });
    groups.push({
      label: "Money",
      items: [
        { to: "/billing", label: "Billing", icon: Receipt },
        { to: "/reports", label: "Reports", icon: ChartColumnBig },
      ],
    });
    groups.push({ label: "Compliance", items: [{ to: "/compliance", label: "Go / No-Go", icon: ShieldCheck }] });
  }

  if (isStaff || has("technician")) {
    groups.push({ label: "Maintenance", items: [{ to: "/maintenance", label: "Maintenance", icon: Wrench }] });
  }

  // Personal section — every member gets this.
  const you: NavItem[] = [
    { to: "/me", label: "My day", icon: Home },
    { to: "/me/schedule", label: "My schedule", icon: CalendarDays },
    { to: "/me/book", label: "Book", icon: CalendarPlus },
    { to: "/me/invoices", label: "My invoices", icon: Wallet },
    { to: "/me/payment-methods", label: "Payment methods", icon: CreditCard },
    { to: "/me/currencies", label: "My currencies", icon: ShieldCheck },
    { to: "/me/documents", label: "My documents", icon: FileText },
  ];
  if (has("instructor")) you.push({ to: "/me/availability", label: "Availability", icon: Clock });
  you.push({ to: "/me/profile", label: "Profile", icon: UserIcon });
  groups.push({ label: "You", items: you });

  // Notifications + Settings live in the top bar (Stripe-style), not the left nav.
  return groups;
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ConfirmProvider>
      <CommandMenuProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <Topbar />
            <main className="flex-1 px-4 py-5 md:px-8 md:py-6">
              <div className="mx-auto w-full max-w-6xl">{children}</div>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </CommandMenuProvider>
    </ConfirmProvider>
  );
}

function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { roles, isStaff } = useAuth();
  const groups = navForRoles(roles, isStaff);

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <OrgSwitcher />
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active =
                    item.to === "/me"
                      ? pathname === "/me"
                      : pathname === item.to || pathname.startsWith(item.to + "/");
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link to={item.to}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
    </Sidebar>
  );
}

function OrgSwitcher() {
  const { organization, organizations, switchOrg } = useAuth();
  const qc = useQueryClient();
  const multi = organizations.length > 1;

  const button = (
    <SidebarMenuButton
      size="lg"
      className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
    >
      <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary p-1.5">
        <LogoMark onDark className="size-full" />
      </div>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-semibold">{organization?.name ?? "AerScheduler"}</span>
        <span className="truncate text-xs text-sidebar-foreground/60">Console</span>
      </div>
      {multi && <ChevronsUpDown className="ml-auto size-4 opacity-60" />}
    </SidebarMenuButton>
  );

  if (!multi) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>{button}</SidebarMenuItem>
      </SidebarMenu>
    );
  }

  async function onSwitch(id: number) {
    if (id === organization?.id) return;
    await switchOrg(id);
    qc.clear();
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            align="start"
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Organizations
            </DropdownMenuLabel>
            {organizations.map((o) => (
              <DropdownMenuItem key={o.id} onClick={() => void onSwitch(o.id)} className="gap-2">
                <div className="flex size-6 items-center justify-center rounded-md border bg-card text-[10px] font-semibold">
                  {initials(o.name)}
                </div>
                <span className="truncate">{o.name}</span>
                {o.id === organization?.id && <Check className="ml-auto size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const qc = useQueryClient();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  {initials(user?.name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user?.name ?? "Signed in"}</span>
                <span className="truncate text-xs text-sidebar-foreground/60">{user?.email}</span>
              </div>
              <MoreHorizontal className="ml-auto size-4 opacity-60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            side="top"
            align="start"
          >
            <DropdownMenuLabel className="flex flex-col">
              <span className="text-sm font-medium">{user?.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <UserIcon />
                Account &amp; settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={toggle}>
              {theme === "dark" ? <Sun /> : <Moon />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                logout();
                qc.clear();
                navigate({ to: "/login" });
              }}
            >
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function Topbar() {
  const { setOpen } = useCommandMenu();
  const { isStaff } = useAuth();
  const { toggleSidebar } = useSidebar();

  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3 md:px-6">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={toggleSidebar}
        aria-label="Open navigation"
        className="md:hidden"
      >
        <Menu className="size-4" />
      </Button>

      {/* Stripe-style search — borderless subtle fill; opens the ⌘K palette */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="flex h-8 w-full max-w-xs items-center gap-2 rounded-md bg-muted/70 px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 text-left">Search</span>
        <kbd className="pointer-events-none hidden select-none items-center rounded bg-card px-1.5 font-mono text-[10px] font-medium text-muted-foreground shadow-sm sm:flex">
          ⌘K
        </kbd>
      </button>

      <div className="flex-1" />

      <Button asChild variant="ghost" size="icon" aria-label="Notifications">
        <Link to="/notifications">
          <Bell className="size-4" />
        </Link>
      </Button>
      {isStaff && (
        <Button asChild variant="ghost" size="icon" aria-label="Settings">
          <Link to="/settings">
            <Settings className="size-4" />
          </Link>
        </Button>
      )}
    </header>
  );
}
