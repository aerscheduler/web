import * as React from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CalendarX2,
  ChevronRight,
  LayoutDashboard,
  Loader2,
  LogOut,
  PlaneTakeoff,
  Receipt,
  Search as SearchIcon,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { canAccess } from "@/lib/permissions";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTimeZone } from "@/lib/use-timezone";
import { useTimeZonePreferences } from "@/features/queries";
import { highlightMatch } from "@/lib/highlight-match";
import {
  SEARCH_TYPE_ICON,
  SEARCH_TYPE_LABEL,
  SEARCH_TYPE_ORDER,
  searchLinkFor,
} from "@/lib/search-links";
import type { Role, SearchEntityType, SearchResult } from "@/types/api";
import { useGlobalSearch } from "@/features/queries";
import { cn } from "@/lib/utils";

type CommandMenuContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const CommandMenuContext = React.createContext<CommandMenuContextValue | null>(null);

/** Access the global search (e.g. ⌘K from anywhere). */
export function useCommandMenu() {
  const ctx = React.useContext(CommandMenuContext);
  if (!ctx) throw new Error("useCommandMenu must be used within CommandMenuProvider");
  return ctx;
}

/**
 * Nav destinations with a Stripe-style breadcrumb path for the "Go to" section.
 * `keywords` catch alternate names so "gng" / "go no go" still surface compliance.
 */
const NAV = [
  {
    to: "/dashboard",
    label: "Dashboard",
    path: ["Operations", "Dashboard"],
    keywords: ["home", "overview"],
    icon: LayoutDashboard,
  },
  {
    to: "/schedule",
    label: "Schedule",
    path: ["Operations", "Schedule"],
    keywords: ["calendar", "flights", "bookings", "reservations"],
    icon: CalendarDays,
  },
  {
    to: "/people",
    label: "People",
    path: ["Operations", "People"],
    keywords: ["members", "roster", "students", "instructors"],
    icon: Users,
  },
  {
    to: "/aircraft",
    label: "Aircraft",
    path: ["Operations", "Aircraft"],
    keywords: ["planes", "fleet", "resources", "n-number"],
    icon: PlaneTakeoff,
  },
  {
    to: "/billing",
    label: "Billing",
    path: ["Money", "Billing"],
    keywords: ["invoices", "payments", "money"],
    icon: Receipt,
  },
  {
    to: "/compliance",
    label: "Go / No-Go",
    path: ["Compliance", "Go / No-Go"],
    keywords: ["gng", "go no go", "currency", "documents"],
    icon: ShieldCheck,
  },
  {
    to: "/operations/cancellations",
    label: "Cancellations",
    path: ["Operations", "Cancellations"],
    keywords: ["cancelled", "cancel"],
    icon: CalendarX2,
  },
  {
    to: "/settings",
    label: "Settings",
    path: ["Settings"],
    keywords: ["preferences", "config", "organization"],
    icon: Settings,
  },
] as const;

/**
 * Stripe-style suggested filters. Selecting one scopes `GET /search` to that
 * type (already supported server-side). Keywords drive when the suggestion
 * appears as you type — same idea as Stripe surfacing `date:` for "da".
 */
const TYPE_FILTERS: {
  type: SearchEntityType;
  syntax: string;
  description: string;
  keywords: string[];
}[] = [
  {
    type: "person",
    syntax: "people:",
    description: "search people only",
    keywords: ["people", "person", "member", "student", "instructor"],
  },
  {
    type: "resource",
    syntax: "aircraft:",
    description: "search aircraft only",
    keywords: ["aircraft", "plane", "fleet", "resource", "n-number"],
  },
  {
    type: "reservation",
    syntax: "flights:",
    description: "search reservations only",
    keywords: ["flight", "flights", "reservation", "booking", "schedule"],
  },
  {
    type: "squawk",
    syntax: "squawks:",
    description: "search squawks only",
    keywords: ["squawk", "squawks", "maintenance", "defect"],
  },
  {
    type: "currency",
    syntax: "currencies:",
    description: "search currencies only",
    keywords: ["currency", "currencies", "medical", "bfr", "endorsement"],
  },
  {
    type: "document",
    syntax: "documents:",
    description: "search documents only",
    keywords: ["document", "documents", "license", "cert"],
  },
  {
    type: "announcement",
    syntax: "announcements:",
    description: "search announcements only",
    keywords: ["announcement", "announcements", "news"],
  },
  {
    type: "location",
    syntax: "locations:",
    description: "search locations only",
    keywords: ["location", "locations", "facility", "airport", "base"],
  },
  {
    type: "rating",
    syntax: "ratings:",
    description: "search ratings only",
    keywords: ["rating", "ratings", "rate", "rates"],
  },
];

/** Parse `people: jane` → { type: person, text: "jane" }. */
function parseTypedQuery(raw: string): { typeFilter: SearchEntityType | null; text: string } {
  const trimmed = raw.trim();
  const match = /^([a-z][\w-]*):\s*(.*)$/i.exec(trimmed);
  if (!match) return { typeFilter: null, text: raw };

  const prefix = match[1]!.toLowerCase();
  const rest = match[2] ?? "";
  const filter = TYPE_FILTERS.find(
    (f) =>
      f.syntax.replace(":", "").toLowerCase() === prefix ||
      f.keywords.some((k) => k === prefix) ||
      SEARCH_TYPE_LABEL[f.type].toLowerCase() === prefix
  );
  if (!filter) return { typeFilter: null, text: raw };
  return { typeFilter: filter.type, text: rest };
}

/**
 * `Jul 28` this year, `Jan 30, 2028` in any other.
 *
 * The console's short format drops the year, which is fine on a schedule you're
 * already looking at but wrong here: a medical "Expires Jan 30" reads as weeks
 * away when it is really two years out. The year appears only when it changes
 * the answer, so the common case stays short.
 */
function formatResultDate(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { timeZone, month: "short", day: "numeric" };
  try {
    const thisYear = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(new Date());
    const thatYear = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(date);
    if (thisYear !== thatYear) opts.year = "numeric";
    return new Intl.DateTimeFormat("en-US", opts).format(date);
  } catch {
    // An unknown zone (a stale row, a typo in org settings) must not blank the row.
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: undefined, year: "numeric" }).format(date);
  }
}

/**
 * How each server-sent badge should read. Grounded and expired are hard stops;
 * an open squawk is work outstanding; cancelled is neither — it's just a state,
 * and colouring it red implies something went wrong when usually nothing did.
 */
const BADGE_VARIANT: Record<string, React.ComponentProps<typeof Badge>["variant"]> = {
  Grounded: "danger",
  Expired: "danger",
  Expiring: "warning",
  "Not signed off": "warning",
  Open: "warning",
  Resolved: "warning",
  Verified: "success",
  Cancelled: "outline",
};

function navMatchesQuery(item: (typeof NAV)[number], q: string): boolean {
  if (!q) return true;
  const hay = [item.label, ...item.path, ...item.keywords].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token));
}

/**
 * Owns ⌘K open state. The actual Stripe-style search bar lives in the topbar
 * via {@link CommandMenuSearch} — this provider only shares open/close.
 */
export function CommandMenuProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

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

  return (
    <CommandMenuContext.Provider value={{ open, setOpen }}>
      {children}
    </CommandMenuContext.Provider>
  );
}

/**
 * Stripe-style search: sits in the topbar on desktop (dropdown), and goes
 * full-screen on mobile so the keyboard + results have room.
 */
export function CommandMenuSearch() {
  const { open, setOpen } = useCommandMenu();
  const isMobile = useIsMobile();
  const [query, setQuery] = React.useState("");
  /** Scopes search to one entity type — from a suggested filter or `people:` syntax. */
  const [typeFilter, setTypeFilter] = React.useState<SearchEntityType | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { logout, organization, roles, orgUserId } = useAuth();
  const R = roles as Role[];
  const tz = useTimeZone();
  // "Show the schedule in my zone" is an explicit opt-out of airport time, and it
  // has to win over a reservation's own zone — otherwise the palette quietly
  // contradicts the board the member is looking at.
  const prefersOwnZone = useTimeZonePreferences().data?.scheduleTimeZoneMode === "user";
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Promote `people: jane` into a People chip + query "jane" so the syntax
  // doesn't sit duplicated next to the chip.
  React.useEffect(() => {
    if (typeFilter) return;
    const { typeFilter: parsed, text } = parseTypedQuery(query);
    if (!parsed) return;
    setTypeFilter(parsed);
    setQuery(text);
  }, [query, typeFilter]);

  // Closing should reset; opening should focus the field (⌘K from anywhere).
  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setTypeFilter(null);
      return;
    }
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Lock background scroll while the mobile full-screen sheet is up.
  React.useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

  const highlightQuery = query.trim();

  // One server call behind everything below. Debounced so a fast typist sends
  // a handful of requests rather than one per keystroke; `enabled` keeps the
  // palette from fetching on pages where it was never opened.
  const debouncedQuery = useDebouncedValue(query, 200);
  const debouncedFilter = useDebouncedValue(typeFilter, 200);
  const search = useGlobalSearch(
    debouncedQuery,
    debouncedFilter ? { types: [debouncedFilter] } : undefined,
    { enabled: open && !!organization }
  );

  const run = React.useCallback(
    (fn: () => void) => {
      setOpen(false);
      fn();
    },
    [setOpen]
  );

  const openResult = React.useCallback(
    (result: SearchResult) => {
      const link = searchLinkFor(result, orgUserId);
      run(() =>
        navigate({
          to: link.to,
          ...(link.search ? { search: link.search } : {}),
        } as Parameters<typeof navigate>[0])
      );
    },
    [navigate, orgUserId, run]
  );

  const applyFilter = React.useCallback((type: SearchEntityType) => {
    setTypeFilter(type);
    // Clear the typed hint ("peo") — the chip is the filter now.
    setQuery("");
  }, []);

  const clearFilter = React.useCallback(() => {
    setTypeFilter(null);
  }, []);

  // Group hits by type, in the palette's display order rather than the server's.
  const grouped = React.useMemo(() => {
    const byType = new Map<SearchEntityType, SearchResult[]>();
    for (const result of search.data?.results ?? []) {
      const list = byType.get(result.type);
      if (list) list.push(result);
      else byType.set(result.type, [result]);
    }
    return SEARCH_TYPE_ORDER.filter((type) => byType.has(type)).map((type) => ({
      type,
      results: byType.get(type)!,
    }));
  }, [search.data]);

  const typed = highlightQuery.length > 0;
  const permittedTypes = search.data?.types ?? SEARCH_TYPE_ORDER;

  const navItems = NAV.filter((item) => canAccess(item.to, R) && navMatchesQuery(item, highlightQuery));

  // Suggested filters: keyword prefix match (Stripe "da" → date:), limited to
  // types this caller may actually search. Hidden once a filter is already on.
  const suggestedFilters = React.useMemo(() => {
    if (typeFilter || !typed) return [];
    const q = highlightQuery.toLowerCase();
    return TYPE_FILTERS.filter((f) => {
      if (!permittedTypes.includes(f.type)) return false;
      const labels = [f.syntax.replace(":", ""), SEARCH_TYPE_LABEL[f.type].toLowerCase(), ...f.keywords];
      return labels.some((k) => k.startsWith(q));
    }).slice(0, 4);
  }, [typeFilter, typed, highlightQuery, permittedTypes]);

  const hasResults = grouped.length > 0;
  const actionQ = highlightQuery.toLowerCase();
  const showActions =
    !typed || "sign out".includes(actionQ) || "logout".includes(actionQ) || "signout".includes(actionQ);
  // Only claim "nothing found" once the answer is actually in — a debounce gap
  // would otherwise flash "No results" over hits that are one tick away.
  const settled = !search.isFetching;
  const showEmpty =
    settled && !hasResults && navItems.length === 0 && suggestedFilters.length === 0 && !showActions;

  const browsing = !typed && !typeFilter;

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    // Backspace on an empty query clears the type chip — same muscle
    // memory as Stripe/Notion filter tokens.
    if (e.key === "Backspace" && query === "" && typeFilter) {
      e.preventDefault();
      clearFilter();
    }
  };

  const results = (
    <SearchResults
      showEmpty={showEmpty}
      typed={typed}
      highlightQuery={highlightQuery}
      suggestedFilters={suggestedFilters}
      navItems={navItems}
      grouped={grouped}
      browsing={browsing}
      showActions={showActions}
      fallbackZone={tz.zone}
      prefersOwnZone={prefersOwnZone}
      onApplyFilter={applyFilter}
      onNavigate={(to) => run(() => navigate({ to }))}
      onOpenResult={openResult}
      onSignOut={() =>
        run(() => {
          logout();
          qc.clear();
          navigate({ to: "/login" });
        })
      }
    />
  );

  const filterChip = typeFilter ? (
    <button
      type="button"
      onClick={clearFilter}
      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15"
    >
      {SEARCH_TYPE_LABEL[typeFilter]}
      <X className="size-3 opacity-70" />
    </button>
  ) : null;

  // —— Mobile: topbar trigger + full-screen sheet ——
  if (isMobile) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Search"
          className="flex h-8 w-full max-w-xs items-center gap-2 rounded-md bg-muted/70 px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted"
        >
          <SearchIcon className="size-4 shrink-0" />
          <span className="flex-1 text-left">Search</span>
        </button>

        {open &&
          createPortal(
            <div
              className="fixed inset-0 z-50 flex flex-col bg-background"
              style={{ paddingTop: "env(safe-area-inset-top)" }}
              role="dialog"
              aria-modal="true"
              aria-label="Search"
            >
              <Command shouldFilter={false} className="flex h-full flex-col overflow-hidden rounded-none">
                <div className="flex items-center gap-2 border-b px-3 py-2">
                  <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md bg-muted/70 px-2.5">
                    <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
                    {filterChip}
                    <CommandInput
                      ref={inputRef}
                      value={query}
                      onValueChange={setQuery}
                      placeholder={
                        typeFilter
                          ? `Search ${SEARCH_TYPE_LABEL[typeFilter].toLowerCase()}…`
                          : "Search…"
                      }
                      wrapperClassName="h-10 flex-1 border-0 px-0"
                      hideIcon
                      className="h-10 text-base placeholder:text-muted-foreground"
                      onKeyDown={onInputKeyDown}
                    />
                    {search.isFetching && typed && (
                      <Loader2
                        className="size-3.5 shrink-0 animate-spin text-muted-foreground"
                        aria-hidden
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="shrink-0 px-1.5 text-sm font-medium text-primary"
                  >
                    Cancel
                  </button>
                </div>

                <CommandList className="max-h-none flex-1 overscroll-contain">
                  {results}
                </CommandList>
              </Command>
            </div>,
            document.body
          )}
      </>
    );
  }

  // —— Desktop: inline field + floating dropdown ——
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40"
          aria-hidden
          onMouseDown={(e) => {
            e.preventDefault();
            setOpen(false);
          }}
        />
      )}

      <div className={cn("relative z-50 w-full max-w-xs", open && "max-w-md")}>
        <Command shouldFilter={false} className="overflow-visible bg-transparent">
          <div
            className={cn(
              "flex h-8 items-center gap-2 rounded-md bg-muted/70 px-2.5 text-[13px] transition-[box-shadow,background-color]",
              open && "bg-card shadow-sm ring-1 ring-border"
            )}
          >
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            {filterChip}
            <CommandInput
              ref={inputRef}
              value={query}
              onValueChange={(value) => {
                setQuery(value);
                if (!open) setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder={
                typeFilter
                  ? `Search ${SEARCH_TYPE_LABEL[typeFilter].toLowerCase()}…`
                  : "Search…"
              }
              wrapperClassName="h-8 flex-1 border-0 px-0"
              hideIcon
              className="h-8 text-[13px] placeholder:text-muted-foreground"
              onKeyDown={onInputKeyDown}
            />
            {search.isFetching && open && typed ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
            ) : (
              !open && (
                <kbd className="pointer-events-none hidden select-none items-center rounded bg-card px-1.5 font-mono text-[10px] font-medium text-muted-foreground shadow-sm sm:flex">
                  ⌘K
                </kbd>
              )
            )}
          </div>

          {open && (
            <div
              className="absolute top-full left-0 z-50 mt-1.5 w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-lg border bg-card text-popover-foreground shadow-lg"
              // Keep focus in the input when clicking results chrome.
              onMouseDown={(e) => e.preventDefault()}
            >
              <CommandList className="max-h-[min(420px,70vh)]">{results}</CommandList>

              <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <Kbd>↑</Kbd>
                    <Kbd>↓</Kbd>
                    navigate
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Kbd>↵</Kbd>
                    open
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Kbd>esc</Kbd>
                    close
                  </span>
                </div>
                {typed && hasResults && (
                  <span className="tabular-nums">
                    {search.data?.results.length ?? 0}
                    {Object.keys(search.data?.counts ?? {}).length > 1 ? " results" : " matches"}
                  </span>
                )}
              </div>
            </div>
          )}
        </Command>
      </div>
    </>
  );
}

function SearchResults({
  showEmpty,
  typed,
  highlightQuery,
  suggestedFilters,
  navItems,
  grouped,
  browsing,
  showActions,
  fallbackZone,
  prefersOwnZone,
  onApplyFilter,
  onNavigate,
  onOpenResult,
  onSignOut,
}: {
  showEmpty: boolean;
  typed: boolean;
  highlightQuery: string;
  suggestedFilters: Array<(typeof TYPE_FILTERS)[number]>;
  navItems: Array<(typeof NAV)[number]>;
  grouped: Array<{ type: SearchEntityType; results: SearchResult[] }>;
  browsing: boolean;
  showActions: boolean;
  fallbackZone: string;
  prefersOwnZone: boolean;
  onApplyFilter: (type: SearchEntityType) => void;
  onNavigate: (to: (typeof NAV)[number]["to"]) => void;
  onOpenResult: (result: SearchResult) => void;
  onSignOut: () => void;
}) {
  return (
    <>
      {showEmpty && (
        <CommandEmpty>
          {typed ? (
            <>
              No results for <span className="font-medium text-foreground">“{highlightQuery}”</span>
            </>
          ) : (
            "Nothing to show yet."
          )}
        </CommandEmpty>
      )}

      {suggestedFilters.length > 0 && (
        <CommandGroup heading="Suggested filters">
          {suggestedFilters.map((filter) => {
            const Icon = SEARCH_TYPE_ICON[filter.type];
            return (
              <CommandItem
                key={filter.type}
                value={`filter ${filter.syntax} ${filter.keywords.join(" ")}`}
                onSelect={() => onApplyFilter(filter.type)}
                className="gap-3"
              >
                <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-medium text-foreground">
                  {highlightMatch(filter.syntax, highlightQuery)}
                </span>
                <span className="flex-1 text-xs text-muted-foreground">{filter.description}</span>
                <Icon className="size-3.5! text-muted-foreground" />
              </CommandItem>
            );
          })}
        </CommandGroup>
      )}

      {navItems.length > 0 && (
        <>
          {suggestedFilters.length > 0 && <CommandSeparator />}
          <CommandGroup heading="Go to">
            {navItems.map((item) => (
              <CommandItem
                key={item.to}
                value={`nav ${item.label} ${item.path.join(" ")} ${item.keywords.join(" ")}`}
                onSelect={() => onNavigate(item.to)}
                className="gap-3"
              >
                <item.icon className="text-muted-foreground" />
                <NavPath path={item.path} query={highlightQuery} />
              </CommandItem>
            ))}
          </CommandGroup>
        </>
      )}

      {grouped.map(({ type, results }, index) => (
        <React.Fragment key={type}>
          {(index > 0 || navItems.length > 0 || suggestedFilters.length > 0) && <CommandSeparator />}
          <CommandGroup
            heading={
              browsing ? `Recent ${SEARCH_TYPE_LABEL[type].toLowerCase()}` : SEARCH_TYPE_LABEL[type]
            }
          >
            {results.map((result) => (
              <ResultItem
                key={`${type}-${result.id}`}
                result={result}
                query={highlightQuery}
                fallbackZone={fallbackZone}
                prefersOwnZone={prefersOwnZone}
                onSelect={onOpenResult}
              />
            ))}
          </CommandGroup>
        </React.Fragment>
      ))}

      {showActions && (
        <>
          <CommandSeparator />
          {/* Theme lives in Settings → Appearance and Profile → Appearance; it
              doesn't earn a slot in the command palette. */}
          <CommandGroup heading="Actions">
            <CommandItem value="sign out logout" onSelect={onSignOut}>
              <LogOut className="text-muted-foreground" />
              Sign out
            </CommandItem>
          </CommandGroup>
        </>
      )}
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border bg-background px-1 py-px font-sans text-[10px] font-medium text-muted-foreground shadow-xs">
      {children}
    </kbd>
  );
}

/** Stripe-style breadcrumb path with match highlighting. */
function NavPath({ path, query }: { path: readonly string[]; query: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1 truncate">
      {path.map((segment, i) => (
        <React.Fragment key={`${segment}-${i}`}>
          {i > 0 && <ChevronRight className="size-3! shrink-0 text-muted-foreground/60" />}
          <span className={cn("truncate", i < path.length - 1 && "text-muted-foreground")}>
            {highlightMatch(segment, query)}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
}

function ResultItem({
  result,
  query,
  fallbackZone,
  prefersOwnZone,
  onSelect,
}: {
  result: SearchResult;
  query: string;
  fallbackZone: string;
  prefersOwnZone: boolean;
  onSelect: (result: SearchResult) => void;
}) {
  const Icon = SEARCH_TYPE_ICON[result.type];
  // A reservation carries the AIRPORT's zone and renders in it, the same rule
  // the board follows — unless this member asked to see schedules in their own.
  // Everything else has no clock of its own and uses the resolved zone.
  const zone = prefersOwnZone ? fallbackZone : result.timeZone ?? fallbackZone;
  const when = result.date ? formatResultDate(result.date, zone) : null;

  return (
    <CommandItem
      value={`${result.type}-${result.id} ${result.title} ${result.subtitle ?? ""}`}
      onSelect={() => onSelect(result)}
      className="items-start gap-3"
    >
      <Icon className="mt-0.5 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate">{highlightMatch(result.title, query)}</span>
          {result.badge && (
            <Badge variant={BADGE_VARIANT[result.badge] ?? "secondary"} className="shrink-0">
              {result.badge}
            </Badge>
          )}
        </div>
        {result.subtitle && (
          <p className="truncate text-xs text-muted-foreground">
            {highlightMatch(result.subtitle, query)}
          </p>
        )}
      </div>
      {when && (
        <span className="ml-auto shrink-0 self-center text-xs text-muted-foreground">
          {result.dateLabel} {when}
        </span>
      )}
    </CommandItem>
  );
}
