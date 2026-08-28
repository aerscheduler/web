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
import { useRealtime } from "@/lib/realtime";
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
import { DetailPanelOutlet, DetailPanelProvider } from "@/components/detail-panel";
import { QuickCreateProvider, useQuickCreate } from "@/components/quick-create";
import { LogoMark } from "@/components/logo";
import { ImpersonationBanner } from "@/components/developer/impersonation-banner";
import { DemoBanner } from "@/components/demo/demo-banner";
import { FeedbackModal } from "@/components/feedback/feedback-modal";
import { cn, initials } from "@/lib/utils";
import { WideModeProvider, useWideMode } from "@/lib/wide-mode";
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
  // rail is closed (mobile), nav lives in `components/nav/sidebar-nav`.
  useRecordRecentPage();

  const { organization } = useAuth();
  useRealtime({
    enabled: organization?.id != null,
    channels: ["notifications", "billing"],
    orgId: organization?.id ?? null,
  });

  return (
    <ConfirmProvider>
      <WideModeProvider>
      <CommandMenuProvider>
        <QuickCreateProvider>
         <DetailPanelProvider>
          <SidebarProvider className="h-svh overflow-hidden">
            <AppSidebar />
            <SidebarEdgeToggle />
            {/* `min-w-0` as much as `min-h-0`: the inset is a flex item beside the
                rail and defaults to `min-width:auto`, so it will not shrink below its
                content's min-content width. The detail panel is a fixed 384px that
                cannot shrink, so without this the inset grows to rail + content +
                panel and the panel is silently clipped off the right of the window. */}
            <SidebarInset className="min-h-0 min-w-0">
              {/* The detail panel is a sibling of the WHOLE content column, banners
                  and topbar included, so opening a record pushes the nav in beside
                  it rather than sliding under it. The panel then runs the full height
                  of the window and the topbar's right-hand icons stop sitting on top
                  of it. `min-h-0` here is what keeps `main` a bounded scroll container
                  once the panel is beside it. */}
              <div className="flex min-h-0 min-w-0 flex-1">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {/* Above the topbar and inside the content column, the desktop rail
                  is `fixed`, so a banner spanning the full window would sit under
                  it and lose its first words. */}
              <ImpersonationBanner />
              <DemoBanner />
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
                    page, the regression this rule prevents.)
                    md+ ONLY, and that gate is the point: a phone has no room to
                    spend on chrome, so a pinned header, a title, four stat cards,
                    a filter bar, can consume the whole viewport and leave the
                    bounded rows a two-line sliver (Billing's invoice list did
                    exactly that). Below md nothing is bounded, so the page simply
                    scrolls, which is what a phone wants anyway. */}
              {/* `min-w-0` matters as much as `min-h-0`: main is a flex item beside
                  the sidebar, and a flex item defaults to `min-width:auto`, so it
                  refuses to shrink below its content's min-content width. A page with
                  a wide table (Reports) then pushes main past the viewport, where the
                  wrapper's `overflow-hidden` silently CLIPS the right-hand columns
                  rather than letting them scroll. Shrinking is what lets each page's
                  own scroll container do its job, and it is equally what lets the
                  detail panel push the content in rather than sit on top of it. */}
              {/* A fill page hands its bottom padding to the fill column itself
                  (`md:pb-8` on <TableView>), so this wrapper drops its own, hence
                  `pb-0`. The wrapper is a fixed `h-full` box, and a column that
                  outgrows one (a header too tall to leave the table its floor)
                  paints straight past the wrapper's padding, which is how the last
                  row ended up flush against the window. Padding carried by the
                  overflowing element travels with it. Note this can't be solved by
                  moving the padding out to `main` either: a scroll container's end
                  padding is not re-applied after descendant overflow. */}
              <main className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto">
                <PageContainer>{children}</PageContainer>
              </main>
              </div>
              {/* Deliberately OUTSIDE the max-w-[1280px] wrapper: on a wide monitor
                  the panel spends the empty gutter, so the list barely narrows.
                  Zero-width until a page docks a record into it. */}
              <DetailPanelOutlet />
              </div>
            </SidebarInset>
          </SidebarProvider>
         </DetailPanelProvider>
        </QuickCreateProvider>
      </CommandMenuProvider>
      </WideModeProvider>
    </ConfirmProvider>
  );
}

/**
 * The column every page renders into.
 *
 * Its own component so it can read the wide preference from the provider mounted just
 * above it in `AppShell`; a hook called in `AppShell`'s own body could not see a context
 * that `AppShell` renders.
 */
function PageContainer({ children }: { children: ReactNode }) {
  const { wide } = useWideMode();
  return (
    <div
      className={cn(
        "mx-auto flex min-h-full w-full min-w-0 max-w-[1280px] flex-col px-4 py-5 md:px-10 md:py-8 md:[&:has([data-fill-page])]:h-full md:[&:has([data-fill-page])]:pb-0",
        // Growing and shrinking is a change of shape, and a shape that teleports reads as
        // a glitch: the eye has to re-find the list and the record rather than watch them
        // move. Short enough not to be in the way of somebody who toggles and keeps
        // working, and off entirely for anyone who asked for less motion.
        "transition-[max-width] duration-300 ease-out motion-reduce:transition-none",
        // Wide mode, and only on a page that asked for it by rendering the toggle. `:has()`
        // keeps this a pure CSS answer, so a page paints at its final width immediately
        // rather than flashing narrow while an effect registers. `lg:` because the cap only
        // binds on a window wider than it; below that this would change nothing.
        //
        // A BIGGER cap, not none: uncapped on an ultrawide put a title at one end of a
        // 3000px row and its buttons at the other. Keep in step with `WIDE_MAX_PX`, which
        // a Tailwind arbitrary value cannot read.
        // See lib/wide-mode.tsx for why the preference is global and the opt-in per page.
        wide && "lg:[&:has([data-wide-ok])]:max-w-[1680px]"
      )}
    >
      {children}
    </div>
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
 * Stripe-style collapse handle, a slim floating vertical line sitting a few px
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
      {/* Light tile, not the brand blue: the fallback mark is two-tone (navy
          wing over a blue arch), so on a brand-blue fill its blue half
          disappears and what's left reads as a stray navy tick. White backs it
          in both themes, the mark has no dark-surface variant to switch to. */}
      <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg border border-sidebar-border bg-white">
        {organization?.profileImage ? (
          <img
            src={organization.profileImage}
            alt={organization.name}
            className="size-full object-cover"
          />
        ) : (
          <LogoMark className="size-full p-1" />
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
    // Full reload to home, the new org's token drives a clean context, and "/"
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
  // Same reason as the rail's links: this menu lives INSIDE the mobile drawer,
  // so following one of these would leave the drawer over the page it opened.
  const { isMobile, setOpenMobile } = useSidebar();
  const dismiss = () => isMobile && setOpenMobile(false);

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
              <Link to="/me/profile" onClick={dismiss}>
                <UserIcon />
                Account &amp; settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/me/notifications" onClick={dismiss}>
                <Bell />
                Notification settings
              </Link>
            </DropdownMenuItem>
            {isDeveloper && (
              <DropdownMenuItem asChild>
                <Link to="/developer" onClick={dismiss}>
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

        {/* Stripe-style search, results drop down from this field */}
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
                    {/* A technician isn't booking a flight, they're pulling an
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
