import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CircleHelp,
  CalendarPlus,
  Check,
  ChevronsUpDown,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Settings,
  TerminalSquare,
  User as UserIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  canCreateReservation,
  canSelfBook,
  isAdmin,
  isStaff,
  isTechnician,
  selfBookableTypes,
} from "@/lib/permissions";
import { SidebarNav, useRecordRecentPage } from "@/components/nav/sidebar-nav";
import { CommandMenuProvider, CommandMenuSearch } from "@/components/command-menu";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { QuickCreateProvider, useQuickCreate } from "@/components/quick-create";
import { LogoMark } from "@/components/logo";
import { ImpersonationBanner } from "@/components/developer/impersonation-banner";
import { FeedbackModal } from "@/components/feedback/feedback-modal";
import { initials } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AppShell({ children }: { children: ReactNode }) {
  // Recorded here rather than in the rail so history keeps accruing while the
  // rail is closed (mobile) — nav lives in `components/nav/sidebar-nav`.
  useRecordRecentPage();

  return (
    <ConfirmProvider>
      <CommandMenuProvider>
        <QuickCreateProvider>
          <SidebarProvider className="h-svh overflow-hidden">
            <AppSidebar />
            <SidebarEdgeToggle />
            <SidebarInset className="min-h-0">
              {/* Above the topbar and inside the content column — the desktop rail
                  is `fixed`, so a banner spanning the full window would sit under
                  it and lose its first words. */}
              <ImpersonationBanner />
              <Topbar />
              {/* main is the scroll container; the content wrapper adapts per page:
                  • Normal pages → `min-h-full`: fills the viewport when short and
                    GROWS with tall content, so the py-8 bottom padding is always
                    honored on overflow (a fixed `h-full` box lets overflowing
                    content spill past its padding → last section touches the edge).
                  • Full-height table pages → a <TableView>/<DataTable fill> tags
                    itself `data-fill-page`; the :has() rule then switches the
                    wrapper to a DEFINITE `h-full` so the flex-1 table is bounded
                    and its rows scroll internally. (min-height alone is indefinite,
                    so the table would expand to full content and scroll the whole
                    page — the regression this rule prevents.) */}
              {/* `min-w-0` matters as much as `min-h-0`: main is a flex item beside
                  the sidebar, and a flex item defaults to `min-width:auto`, so it
                  refuses to shrink below its content's min-content width. A page with
                  a wide table (Reports) then pushes main past the viewport, where the
                  wrapper's `overflow-hidden` silently CLIPS the right-hand columns
                  rather than letting them scroll. Shrinking is what lets each page's
                  own scroll container do its job. */}
              <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                <div className="mx-auto flex min-h-full w-full max-w-[1280px] flex-col px-4 py-5 md:px-10 md:py-8 [&:has([data-fill-page])]:h-full">
                  {children}
                </div>
              </main>
            </SidebarInset>
          </SidebarProvider>
        </QuickCreateProvider>
      </CommandMenuProvider>
    </ConfirmProvider>
  );
}

function AppSidebar() {
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <OrgSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SidebarNav />
      </SidebarContent>

      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
    </Sidebar>
  );
}

/**
 * Stripe-style collapse handle — a slim floating vertical line sitting a few px
 * to the right of the rail's border. Faintly visible at rest; on hover it tints
 * and grows a little, with a "Collapse" tooltip. When collapsed it sits flush at
 * the screen's left edge (flipping to "Expand") so it stays reachable. The hit
 * area is wider than the line for easy clicking. Desktop only; mobile uses the
 * topbar hamburger.
 */
function SidebarEdgeToggle() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          // Left edge of the (invisible, wider) hit area sits on the rail border;
          // pl-[3px] floats the visible line a few px into the content area.
          style={{ left: collapsed ? 0 : "var(--sidebar-width)" }}
          className="group/edge fixed top-1/2 z-30 hidden h-16 w-4 -translate-y-1/2 items-center justify-start pl-[3px] transition-[left] duration-200 ease-linear md:flex"
        >
          <span className="h-7 w-[3px] rounded-full bg-border transition-all duration-150 group-hover/edge:h-9 group-hover/edge:bg-muted-foreground/70" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {collapsed ? "Expand" : "Collapse"}
      </TooltipContent>
    </Tooltip>
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
      <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary">
        {organization?.profileImage ? (
          <img
            src={organization.profileImage}
            alt={organization.name}
            className="size-full object-cover"
          />
        ) : (
          <LogoMark onDark className="size-full p-1.5" />
        )}
      </div>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-semibold">{organization?.name ?? "AerScheduler"}</span>
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
    // Full reload to home — the new org's token drives a clean context, and "/"
    // routes to the right landing page (dashboard for staff, My day for members).
    window.location.assign("/");
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
  const { user, logout, membership, isDeveloper } = useAuth();
  const navigate = useNavigate();
  const avatarSrc = membership?.profileImage ?? undefined;
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
                {avatarSrc && (
                  <AvatarImage
                    src={avatarSrc}
                    alt={user?.name ?? ""}
                    className="rounded-lg object-cover"
                  />
                )}
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
              <Link to="/me/profile">
                <UserIcon />
                Account &amp; settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/me/notifications">
                <Bell />
                Notification settings
              </Link>
            </DropdownMenuItem>
            {isDeveloper && (
              <DropdownMenuItem asChild>
                <Link to="/developer">
                  <TerminalSquare />
                  Developer
                </Link>
              </DropdownMenuItem>
            )}
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
  const { roles } = useAuth();
  const { toggleSidebar } = useSidebar();
  const { openNewReservation } = useQuickCreate();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 shrink-0 bg-background">
      {/* Inner row shares the content's max-width + gutters so the search aligns
          with the page's left edge and the icons with its right edge. */}
      <div className="mx-auto flex h-12 w-full max-w-[1280px] items-center gap-2 px-4 md:px-10">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleSidebar}
          aria-label="Open navigation"
          className="md:hidden"
        >
          <Menu className="size-4" />
        </Button>

        {/* Stripe-style search — results drop down from this field */}
        <CommandMenuSearch />

        <div className="flex-1" />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Send feedback"
          onClick={() => setFeedbackOpen(true)}
        >
          <CircleHelp className="size-4" />
        </Button>
        <Button asChild variant="ghost" size="icon" aria-label="Notifications">
          <Link to="/notifications">
            <Bell className="size-4" />
          </Link>
        </Button>
        {isAdmin(roles) && (
          <Button asChild variant="ghost" size="icon" aria-label="Settings">
            <Link to="/settings">
              <Settings className="size-4" />
            </Link>
          </Button>
        )}

        {/* Stripe-style accent quick-create: opens a role-appropriate menu. */}
        {canCreateReservation(roles) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" aria-label="Create" className="ml-1 rounded-full">
                <Plus className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Create
              </DropdownMenuLabel>
              {isStaff(roles) && (
                <DropdownMenuItem onClick={openNewReservation}>
                  <CalendarPlus />
                  New reservation
                </DropdownMenuItem>
              )}
              {canSelfBook(roles) && (
                <DropdownMenuItem asChild>
                  <Link to="/me/book">
                    <CalendarPlus />
                    {/* A technician isn't booking a flight — they're pulling an
                        aircraft off the line. */}
                    {selfBookableTypes(roles).length === 1 && isTechnician(roles)
                      ? "Schedule maintenance"
                      : "Book a flight"}
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </header>
  );
}
