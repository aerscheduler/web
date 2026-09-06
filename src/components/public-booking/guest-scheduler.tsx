import * as React from "react";
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns3,
  Globe,
  LayoutGrid,
  Loader2,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { isValidTimeZone } from "@/lib/timezone";
import { LogoMark } from "@/components/logo";
import {
  fetchPublicBookingSlots,
  submitPublicBookingRequest,
} from "@/features/public-booking";
import type { PublicBookableSlot, PublicBookingPage } from "@/types/public-booking";
import {
  guestBookingHtmlWasLoaded,
  isFramedWindow,
  parentFrameOrigin,
  parentMayEmbed,
} from "@/lib/public-booking-embed-hosts";
import {
  addDaysInZone,
  dateKey,
  daysWithSlots,
  formatDayHeading,
  formatStart,
  formatWeekdayHeader,
  heatmapOccupancy,
    heatmapRowMinutes,
    heatmapSlotOffset,
    heatmapNowTop,
    heatmapPastCover,
    HEAT_HOUR_PX,
    isFutureSlot,
    rangeCovers,
    reanchorCivilDay,
    slotsInWeek,
    slotsOnDay,
    startOfDayInZone,
    startOfMonth,
    startOfWeekMonday,
    slotFetchRange,
    unionLoadedRanges,
    zoneChoices,
} from "./scheduler-time";

export type SchedulerView = "column" | "heatmap" | "week";

const EMBED_SOURCE = "aerscheduler-book";
const MARKETING_URL = "https://www.aerscheduler.com";

function OrgLogo({
  name,
  src,
  className,
}: {
  name: string;
  src: string | null;
  className?: string;
}) {
  const [broken, setBroken] = React.useState(false);
  if (src && !broken) {
    return (
      <img
        src={src}
        alt={name}
        className={cn("object-contain", className)}
        onError={() => setBroken(true)}
      />
    );
  }
  return <LogoMark className={className} alt="AerScheduler" />;
}

function PoweredBy() {
  return (
    <a
      href={MARKETING_URL}
      target="_blank"
      rel="noreferrer"
      className="mt-5 text-[10px] font-medium text-muted-foreground/70 hover:text-muted-foreground"
    >
      AerScheduler
    </a>
  );
}

function ZoneSelect({
  zone,
  zones,
  onChange,
}: {
  zone: string;
  zones: string[];
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <Globe className="size-4 shrink-0" />
      <Select value={zone} onValueChange={onChange}>
        <SelectTrigger
          className="h-10 max-w-[min(100%,16rem)] border-0 bg-transparent px-0 shadow-none sm:h-7"
          aria-label="Time zone"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {zones.map((z) => (
            <SelectItem key={z} value={z}>
              {z.replace(/_/g, " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function postToParent(type: string, extra?: Record<string, unknown>) {
  if (typeof window === "undefined" || window.parent === window) return;
  const origin = parentFrameOrigin();
  if (!origin) return;
  window.parent.postMessage({ source: EMBED_SOURCE, type, ...extra }, origin);
}

function useEmbedBridge(active: boolean) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!active) return;
    postToParent("ready");
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      postToParent("resize", { height: Math.ceil(node.getBoundingClientRect().height) });
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [active]);
  return rootRef;
}

function useDesktopLayout() {
  const [desktop, setDesktop] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches
  );
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return desktop;
}

function useNow(ms = 30_000) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

export function GuestScheduler({
  orgSlug,
  offeringSlug,
  page,
  embedded = false,
}: {
  orgSlug: string;
  offeringSlug: string;
  page: PublicBookingPage;
  embedded?: boolean;
}) {
  const offeringZone =
    page.offering.location?.timeZone || page.organization.timeZone || "UTC";
  const zoneDefault = isValidTimeZone(offeringZone) ? offeringZone : "UTC";
  const [zone, setZone] = React.useState(zoneDefault);
  const [hour12, setHour12] = React.useState(true);
  const [view, setView] = React.useState<SchedulerView>("column");
  const [selectedDay, setSelectedDay] = React.useState(() => startOfDayInZone(new Date(), zoneDefault));
  const [weekStart, setWeekStart] = React.useState(() => startOfWeekMonday(new Date(), zoneDefault));
  const [monthCursor, setMonthCursor] = React.useState(() => startOfMonth(new Date(), zoneDefault));
  const [slots, setSlots] = React.useState<PublicBookableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = React.useState(true);
  const [slotsError, setSlotsError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<PublicBookableSlot | null>(null);
  const [step, setStep] = React.useState<"pick" | "details">("pick");
  const [submitted, setSubmitted] = React.useState(false);
  const [submittedEmail, setSubmittedEmail] = React.useState("");
  const embedAllowed = parentMayEmbed({
    framed: isFramedWindow(),
    parentOrigin: parentFrameOrigin(),
    allowedOrigins: page.organization.embedHosts ?? [],
    selfOrigin: typeof window !== "undefined" ? window.location.origin : "",
    htmlDocumentIsGuestBook: guestBookingHtmlWasLoaded(),
  });
  const rootRef = useEmbedBridge(embedded && embedAllowed);
  const desktop = useDesktopLayout();
  const now = useNow();
  const layoutView: SchedulerView = desktop ? view : "column";
  const loadedRangeRef = React.useRef<{ start: Date; end: Date } | null>(null);

  const range = React.useMemo(
    () => slotFetchRange(layoutView, monthCursor, weekStart, zone),
    [layoutView, monthCursor, weekStart, zone]
  );

  const pageKey = `${orgSlug}/${offeringSlug}`;
  const pageKeyRef = React.useRef(pageKey);

  React.useEffect(() => {
    if (pageKeyRef.current !== pageKey) {
      pageKeyRef.current = pageKey;
      loadedRangeRef.current = null;
      setSlots([]);
    }
    if (!embedAllowed) {
      setSlotsLoading(false);
      return;
    }
    if (rangeCovers(loadedRangeRef.current, range)) {
      setSlotsLoading(false);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    fetchPublicBookingSlots(orgSlug, offeringSlug, range.start.toISOString(), range.end.toISOString())
      .then((result) => {
        if (cancelled) return;
        const future = result.data.filter((slot) => isFutureSlot(slot));
        loadedRangeRef.current = unionLoadedRanges(loadedRangeRef.current, range);
        setSlots((prev) => {
          const map = new Map(prev.map((slot) => [`${slot.start}|${slot.resourceId ?? ""}`, slot]));
          for (const slot of future) {
            if (page.offering.allowResourceChoice && slot.resourceId == null) continue;
            const row = page.offering.allowResourceChoice
              ? slot
              : { ...slot, resourceLabel: undefined };
            map.set(`${row.start}|${row.resourceId ?? ""}`, row);
          }
          return [...map.values()];
        });
        setSlotsError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        loadedRangeRef.current = null;
        setSlots([]);
        setSlotsError(err instanceof ApiError ? err.message : "Could not load times.");
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug, offeringSlug, pageKey, range, page.offering.allowResourceChoice, embedAllowed]);

  React.useEffect(() => {
    if (!embedAllowed) return;
    track("public_booking_page_viewed", {
      org_slug: orgSlug,
      offering_slug: offeringSlug,
      embedded,
    });
  }, [orgSlug, offeringSlug, embedded, embedAllowed]);

  const liveSlots = React.useMemo(
    () => slots.filter((slot) => isFutureSlot(slot, now)),
    [slots, now]
  );
  const availableDays = React.useMemo(() => daysWithSlots(liveSlots, zone), [liveSlots, zone]);
  const daySlots = React.useMemo(
    () => slotsOnDay(liveSlots, selectedDay, zone),
    [liveSlots, selectedDay, zone]
  );

  React.useEffect(() => {
    if (availableDays.has(dateKey(selectedDay, zone))) return;
    const first = liveSlots[0];
    if (!first) return;
    const next = startOfDayInZone(new Date(first.start), zone);
    setSelectedDay(next);
    setMonthCursor(startOfMonth(next, zone));
  }, [availableDays, selectedDay, zone, liveSlots]);

  const prevViewRef = React.useRef(view);
  React.useEffect(() => {
    const prev = prevViewRef.current;
    prevViewRef.current = view;
    if (prev === "column" && view !== "column") {
      setWeekStart(startOfWeekMonday(selectedDay, zone));
    }
  }, [view]);

  function pickSlot(slot: PublicBookableSlot) {
    setSelected(slot);
    setSelectedDay(startOfDayInZone(new Date(slot.start), zone));
    setStep("details");
    track("public_booking_slot_selected", {
      org_slug: orgSlug,
      offering_slug: offeringSlug,
    });
  }

  const durationMin = page.offering.fixedReservationMinutes;
  const zones = zoneChoices(zoneDefault);
  const pageChrome = !embedded;
  const fullBleed = pageChrome && desktop && step === "pick" && layoutView !== "column";

  function changeZone(next: string) {
    setSelectedDay((prev) => reanchorCivilDay(prev, zone, next));
    setMonthCursor((prev) => startOfMonth(reanchorCivilDay(prev, zone, next), next));
    setWeekStart((prev) => startOfWeekMonday(reanchorCivilDay(prev, zone, next), next));
    setZone(next);
  }

  const viewToggle = <ViewToggle view={view} onChange={setView} />;

  function pickDay(day: Date) {
    const next = startOfDayInZone(day, zone);
    setSelectedDay(next);
    setMonthCursor(startOfMonth(next, zone));
    setWeekStart(startOfWeekMonday(next, zone));
  }

  const pickerNav = (
    <div className="mb-3 flex items-center justify-between gap-3 md:mb-4">
      {layoutView === "column" ? (
        <p className="text-sm font-medium">{formatDayHeading(selectedDay, zone)}</p>
      ) : (
        <WeekNav
          zone={zone}
          weekStart={weekStart}
          onWeek={(next) => {
            setWeekStart(next);
            setSelectedDay(next);
          }}
        />
      )}
      <div className="flex items-center justify-end gap-1">
        <HourToggle hour12={hour12} onChange={setHour12} />
        {desktop && (embedded || fullBleed) ? viewToggle : null}
      </div>
    </div>
  );

  const pickerBody = (
    <div
      className={cn(
        "relative flex flex-col",
        layoutView === "heatmap"
          ? "min-h-0 flex-1 overflow-hidden"
          : desktop
            ? "min-h-72 flex-1 overflow-y-auto overscroll-contain sm:min-h-0"
            : "overflow-visible"
      )}
      aria-busy={slotsLoading}
    >
      {slotsLoading && slots.length === 0 ? (
        <PickerSkeleton view={layoutView} />
      ) : slotsError ? (
        <p className="py-10 text-center text-sm text-destructive">{slotsError}</p>
      ) : (
        <div
          className={cn(
            "min-h-0 transition-opacity duration-200",
            layoutView === "heatmap" && "flex flex-1 flex-col",
            slotsLoading ? "pointer-events-none opacity-50" : "opacity-100"
          )}
        >
          {layoutView === "column" ? (
            <ColumnView
              zone={zone}
              hour12={hour12}
              slots={liveSlots}
              daySlots={daySlots}
              onPick={pickSlot}
            />
          ) : layoutView === "heatmap" ? (
            <HeatmapView
              weekStart={weekStart}
              zone={zone}
              hour12={hour12}
              now={now}
              slots={liveSlots}
              onPick={pickSlot}
            />
          ) : (
            <WeekChipsView
              weekStart={weekStart}
              zone={zone}
              hour12={hour12}
              slots={liveSlots}
              onPick={pickSlot}
            />
          )}
        </div>
      )}
      {slotsLoading ? (
        <p className="sr-only" role="status">
          Loading times…
        </p>
      ) : null}
    </div>
  );

  const details = selected ? (
    <DetailsStep
      page={page}
      orgSlug={orgSlug}
      offeringSlug={offeringSlug}
      slot={selected}
      zone={zone}
      hour12={hour12}
      onBack={() => {
        setStep("pick");
        setSelected(null);
      }}
      onSubmitted={(email) => {
        setSubmittedEmail(email);
        setSubmitted(true);
        if (embedded) postToParent("request-submitted");
        track("public_booking_request_submitted", {
          org_slug: orgSlug,
          offering_slug: offeringSlug,
        });
      }}
    />
  ) : null;

  const aside = (
    <aside className="shrink-0 p-4 md:border-b md:p-5 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
      <div className="flex items-center gap-3 md:block">
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white md:mb-4 md:size-14">
          <OrgLogo
            name={page.organization.name}
            src={page.organization.logo}
            className="size-full p-1"
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:text-xs">
            {page.organization.name}
          </p>
          <h1 className="truncate text-base font-semibold tracking-tight md:mt-1 md:text-xl">
            {page.offering.name}
          </h1>
        </div>
      </div>
      {page.offering.description ? (
        <p className="mt-2 hidden text-sm text-muted-foreground md:mt-2 md:block">
          {page.offering.description}
        </p>
      ) : null}
      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground md:mt-4 md:flex-col md:items-start md:space-y-2 md:gap-0">
        {durationMin ? (
          <li className="flex items-center gap-2">
            <Clock className="size-4 shrink-0" />
            {durationMin}m
          </li>
        ) : null}
        <li className="flex min-w-0 items-center gap-2">
          <ZoneSelect zone={zone} zones={zones} onChange={changeZone} />
        </li>
      </ul>
      <p className="mt-4 hidden text-sm text-muted-foreground md:block">
        Pick a time and submit a request. The front desk reviews it after you confirm your
        email. This does not book the aircraft until they approve it.
      </p>
      {step === "pick" ? (
        <MiniMonth
          selectedDay={selectedDay}
          monthCursor={monthCursor}
          zone={zone}
          availableDays={availableDays}
          onDay={pickDay}
          onMonth={setMonthCursor}
        />
      ) : null}
    </aside>
  );

  const successCard = (
    <div className="rounded-xl border bg-card p-8 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-[color-mix(in_oklch,var(--success)_15%,transparent)] text-success">
        <CheckCircle2 className="size-6" />
      </div>
      <h1 className="mt-4 text-lg font-semibold">Check your email</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {submittedEmail ? `We sent a confirmation link to ${submittedEmail}. ` : null}
        {page.organization.name} will only see this request after you confirm. This is a
        request, not a booking, until the front desk approves it.
      </p>
    </div>
  );

  if (submitted) {
    if (!pageChrome) {
      return (
        <div ref={rootRef}>{successCard}</div>
      );
    }
    return (
      <div className="flex min-h-svh flex-col items-center justify-center bg-muted/30 px-4 py-10">
        <div ref={rootRef} className="w-full max-w-lg">
          {successCard}
        </div>
        <PoweredBy />
      </div>
    );
  }

  if (!embedAllowed) {
    const blocked = (
      <div className="rounded-xl border bg-card p-8 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <ShieldOff className="size-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">This page cannot be shown here</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {page.organization.name} has not allowed this website to embed booking. Open the
          public link in its own tab instead.
        </p>
      </div>
    );
    if (!pageChrome) {
      return <div ref={rootRef}>{blocked}</div>;
    }
    return (
      <div className="flex min-h-svh flex-col items-center justify-center bg-muted/30 px-4 py-10">
        <div ref={rootRef} className="w-full max-w-lg">
          {blocked}
        </div>
        <PoweredBy />
      </div>
    );
  }

  const main = step === "details" && details ? details : (
    <>
      {pickerNav}
      {pickerBody}
    </>
  );

  return (
    <div className={cn(pageChrome && (desktop ? "relative min-h-svh w-full bg-muted/30" : "min-h-svh bg-background"))}>
      {pageChrome && desktop && step === "pick" && !fullBleed ? (
        <div className="absolute top-5 right-5 z-20">{viewToggle}</div>
      ) : null}

      {fullBleed ? (
        <div
          ref={rootRef}
          className="relative z-0 grid min-h-svh bg-background md:h-svh md:grid-cols-[18.5rem_minmax(0,1fr)] md:overflow-hidden"
        >
          {aside}
          <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">{main}</div>
        </div>
      ) : !desktop && !embedded ? (
        <div ref={rootRef} className="min-h-svh bg-background">
          {aside}
          <div className="px-4 pb-8">{main}</div>
          {pageChrome ? (
            <div className="flex justify-center pb-8">
              <PoweredBy />
            </div>
          ) : null}
        </div>
      ) : (
        <div
          className={cn(
            pageChrome &&
              "flex min-h-svh flex-col items-center px-4 pt-6 pb-8 md:justify-center md:px-6 md:pt-10 md:pb-10"
          )}
        >
          <div
            ref={rootRef}
            className={cn(
              "flex w-full flex-col overflow-hidden border bg-card",
              embedded
                ? "rounded-none sm:rounded-xl"
                : "max-w-5xl rounded-xl shadow-sm sm:max-h-[calc(100svh-8rem)]"
            )}
          >
            <div className="grid min-h-0 flex-1 lg:grid-cols-[18.5rem_minmax(0,1fr)]">
              {aside}
              <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">{main}</div>
            </div>
          </div>
          {pageChrome ? <PoweredBy /> : null}
        </div>
      )}
    </div>
  );
}

function PickerSkeleton({ view }: { view: SchedulerView }) {
  if (view === "heatmap") {
    return (
      <div className="grid h-full grid-cols-8 gap-px" aria-hidden>
        {Array.from({ length: 8 * 8 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }
  if (view === "week") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7" aria-hidden>
        {Array.from({ length: 7 }, (_, col) => (
          <div key={col} className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2" aria-hidden>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-2/3" />
    </div>
  );
}

export function GuestPageSkeleton({ embedded = false }: { embedded?: boolean }) {
  const card = (
    <div
      className={cn(
        "flex w-full flex-col bg-background",
        embedded
          ? "sm:overflow-hidden sm:rounded-xl sm:border sm:bg-card"
          : "md:max-w-5xl md:overflow-hidden md:rounded-xl md:border md:bg-card md:shadow-sm"
      )}
    >
      <div className="grid lg:grid-cols-[18.5rem_minmax(0,1fr)]">
        <aside className="space-y-3 p-4 md:border-b md:p-5 lg:border-r lg:border-b-0">
          <Skeleton className="size-12 rounded-xl sm:size-14" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-40" />
          <div className="grid grid-cols-7 gap-1 pt-2">
            {Array.from({ length: 35 }, (_, i) => (
              <Skeleton key={i} className="aspect-square w-full" />
            ))}
          </div>
        </aside>
        <div className="space-y-4 p-4 md:p-5">
          <div className="flex justify-between">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-10 w-16" />
          </div>
          <PickerSkeleton view="column" />
        </div>
      </div>
    </div>
  );
  if (embedded) return card;
  return (
    <div className="relative min-h-svh w-full bg-background md:bg-muted/30">
      <div className="absolute top-5 right-5 z-20 hidden md:block">
        <Skeleton className="h-8 w-[7.5rem] rounded-md" />
      </div>
      <div className="md:flex md:min-h-svh md:flex-col md:items-center md:justify-center md:px-6 md:pt-10 md:pb-10">
        {card}
      </div>
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: SchedulerView;
  onChange: (view: SchedulerView) => void;
}) {
  const items: { id: SchedulerView; label: string; icon: React.ReactNode }[] = [
    { id: "column", label: "Day view", icon: <CalendarIcon className="size-4" /> },
    { id: "heatmap", label: "Week calendar", icon: <LayoutGrid className="size-4" /> },
    { id: "week", label: "Week times", icon: <Columns3 className="size-4" /> },
  ];
  return (
    <div className="hidden rounded-md border bg-card shadow-sm md:flex" role="group" aria-label="Scheduler view">
      {items.map((item) => (
        <Button
          key={item.id}
          type="button"
          size="icon"
          variant={view === item.id ? "secondary" : "ghost"}
          className="size-10 rounded-none first:rounded-l-md last:rounded-r-md sm:size-8"
          aria-label={item.label}
          aria-pressed={view === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.icon}
        </Button>
      ))}
    </div>
  );
}

function HourToggle({ hour12, onChange }: { hour12: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex rounded-md border text-xs" role="group" aria-label="Time format">
      <Button
        type="button"
        size="sm"
        variant={hour12 ? "secondary" : "ghost"}
        className="h-10 rounded-none rounded-l-md px-3 sm:h-8 sm:px-2"
        aria-pressed={hour12}
        onClick={() => onChange(true)}
      >
        12h
      </Button>
      <Button
        type="button"
        size="sm"
        variant={!hour12 ? "secondary" : "ghost"}
        className="h-10 rounded-none rounded-r-md px-3 sm:h-8 sm:px-2"
        aria-pressed={!hour12}
        onClick={() => onChange(false)}
      >
        24h
      </Button>
    </div>
  );
}

function WeekNav({
  zone,
  weekStart,
  onWeek,
}: {
  zone: string;
  weekStart: Date;
  onWeek: (next: Date) => void;
}) {
  const today = startOfDayInZone(new Date(), zone);
  const weekEnd = addDaysInZone(weekStart, 6, zone);
  const label = `${formatDayHeading(weekStart, zone)} to ${formatDayHeading(weekEnd, zone)}`;
  return (
    <div className="flex w-full items-center gap-1 sm:w-auto sm:gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 shrink-0 px-2 sm:h-8 sm:px-3"
        aria-label="Earlier"
        disabled={dateKey(weekStart, zone) <= dateKey(startOfWeekMonday(today, zone), zone)}
        onClick={() => onWeek(addDaysInZone(weekStart, -7, zone))}
      >
        <ChevronLeft className="size-4" />
        <span className="hidden sm:inline">Earlier</span>
      </Button>
      <p className="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground sm:text-sm">
        {label}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 shrink-0 px-2 sm:h-8 sm:px-3"
        aria-label="Later"
        onClick={() => onWeek(addDaysInZone(weekStart, 7, zone))}
      >
        <span className="hidden sm:inline">Later</span>
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

function MiniMonth({
  selectedDay,
  monthCursor,
  zone,
  availableDays,
  onDay,
  onMonth,
}: {
  selectedDay: Date;
  monthCursor: Date;
  zone: string;
  availableDays: Set<string>;
  onDay: (day: Date) => void;
  onMonth: (month: Date) => void;
}) {
  const selected = startOfDayInZone(selectedDay, zone);
  return (
    <Calendar
      mode="single"
      timeZone={zone}
      month={monthCursor}
      startMonth={startOfMonth(new Date(), zone)}
      onMonthChange={(m) => onMonth(startOfMonth(m, zone))}
      selected={selected}
      onSelect={(d) => {
        if (!d) return;
        onDay(startOfDayInZone(d, zone));
      }}
      disabled={(d) => {
        const key = dateKey(d, zone);
        if (key < dateKey(new Date(), zone)) return true;
        return !availableDays.has(key);
      }}
      modifiers={{ available: (d) => availableDays.has(dateKey(d, zone)) }}
      className="mt-3 w-full bg-transparent p-0 [--cell-size:2.6rem] md:mt-4 md:[--cell-size:2rem]"
      classNames={{
        root: "w-full",
        month: "w-full",
        month_grid: "w-full",
      }}
      components={{
        DayButton: (props) => {
          const key = dateKey(props.day.date, zone);
          return (
            <CalendarDayButton
              {...props}
              data-available={availableDays.has(key) ? "true" : "false"}
              className={cn(props.className, "min-h-9 touch-manipulation sm:min-h-0")}
            />
          );
        },
      }}
    />
  );
}

function ColumnView({
  zone,
  hour12,
  slots,
  daySlots,
  onPick,
}: {
  zone: string;
  hour12: boolean;
  slots: PublicBookableSlot[];
  daySlots: PublicBookableSlot[];
  onPick: (slot: PublicBookableSlot) => void;
}) {
  if (slots.length === 0) return <EmptyTimes kind="month" />;
  if (daySlots.length === 0) {
    return <p className="text-sm text-muted-foreground">No open times this day. Pick another date.</p>;
  }
  return <TimeList slots={daySlots} zone={zone} hour12={hour12} onPick={onPick} />;
}

function TimeList({
  slots,
  zone,
  hour12,
  onPick,
}: {
  slots: PublicBookableSlot[];
  zone: string;
  hour12: boolean;
  onPick: (slot: PublicBookableSlot) => void;
}) {
  return (
    <div className="flex flex-col gap-2 md:max-h-112 md:overflow-y-auto md:pr-1">
      {slots.map((slot) => {
        const label = formatStart(slot, hour12, zone);
        const extra = slot.resourceLabel ? ` · ${slot.resourceLabel}` : "";
        return (
          <Button
            key={`${slot.start}-${slot.resourceId ?? ""}`}
            type="button"
            variant="outline"
            className="h-12 w-full touch-manipulation justify-center gap-2 rounded-lg text-sm md:h-10 md:justify-start"
            data-testid="slot-start"
            data-start={slot.start}
            onClick={() => onPick(slot)}
          >
            <span className="size-1.5 rounded-full bg-success" aria-hidden />
            {label}
            {extra}
          </Button>
        );
      })}
    </div>
  );
}

function weekDays(weekStart: Date, zone: string) {
  return Array.from({ length: 7 }, (_, i) => addDaysInZone(weekStart, i, zone));
}

function HeatmapView({
  weekStart,
  zone,
  hour12,
  now,
  slots,
  onPick,
}: {
  weekStart: Date;
  zone: string;
  hour12: boolean;
  now: Date;
  slots: PublicBookableSlot[];
  onPick: (slot: PublicBookableSlot) => void;
}) {
  const [cellChoices, setCellChoices] = React.useState<PublicBookableSlot[] | null>(null);
  React.useEffect(() => {
    setCellChoices(null);
  }, [weekStart, slots]);
  const days = React.useMemo(() => weekDays(weekStart, zone), [weekStart, zone]);
  const occupancy = React.useMemo(
    () => heatmapOccupancy(slots, weekStart, zone),
    [slots, weekStart, zone]
  );
  const hours = React.useMemo(
    () => heatmapRowMinutes(slots, weekStart, zone),
    [slots, weekStart, zone]
  );

  function pickCell(hits: PublicBookableSlot[]) {
    if (hits.length === 1) {
      setCellChoices(null);
      onPick(hits[0]);
      return;
    }
    if (hits.length > 1) setCellChoices(hits);
  }

  if (slots.length === 0 || hours.length === 0) return <EmptyTimes kind="week" />;

  const firstHour = hours[0]!;
  const lastHour = hours[hours.length - 1]!;
  const bodyH = hours.length * HEAT_HOUR_PX;
  const todayKey = dateKey(now, zone);
  const weekHasToday = days.some((day) => dateKey(day, zone) === todayKey);
  const todayIdx = days.findIndex((day) => dateKey(day, zone) === todayKey);
  const nowTop = weekHasToday ? heatmapNowTop(now, firstHour, lastHour, zone) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="-mx-4 min-h-0 flex-1 overflow-auto overscroll-contain px-4 sm:mx-0 sm:px-0">
        <div className="min-w-[48rem] sm:min-w-0" role="grid" aria-label="Week availability">
          <div
            className="sticky top-0 z-10 grid bg-background"
            style={{ gridTemplateColumns: `3.25rem repeat(7, minmax(0, 1fr))` }}
          >
            <div />
            {days.map((day) => (
              <div key={dateKey(day, zone)} className="px-1 py-2 text-center text-xs font-medium">
                {formatWeekdayHeader(day, zone)}
              </div>
            ))}
          </div>
          <div className="relative" style={{ height: bodyH }}>
            <div
              className="grid h-full"
              style={{ gridTemplateColumns: `3.25rem repeat(7, minmax(0, 1fr))` }}
            >
              <div className="relative">
                {hours.map((hour, i) => (
                  <div
                    key={hour}
                    className="absolute right-0 pr-2 text-right text-[11px] leading-5 text-muted-foreground"
                    style={{ top: i * HEAT_HOUR_PX }}
                  >
                    {formatHourLabel(hour, hour12)}
                  </div>
                ))}
              </div>
              {days.map((day) => {
                const dayKey = dateKey(day, zone);
                const pastH = heatmapPastCover(day, now, firstHour, hours.length, zone);
                const dayHits: { key: string; hits: PublicBookableSlot[] }[] = [];
                for (const [key, hits] of occupancy) {
                  if (key.startsWith(`${dayKey}-`)) dayHits.push({ key, hits });
                }
                return (
                  <div key={dayKey} className="relative border-l border-border/60">
                    {hours.map((hour, i) => (
                      <div
                        key={hour}
                        className="absolute inset-x-0 border-t border-border/50"
                        style={{ top: i * HEAT_HOUR_PX, height: HEAT_HOUR_PX }}
                      />
                    ))}
                    {pastH > 0 ? (
                      <div
                        className="pointer-events-none absolute inset-x-0 top-0 z-[1] bg-[repeating-linear-gradient(-45deg,transparent,transparent_5px,color-mix(in_oklch,var(--foreground)_8%,transparent)_5px,color-mix(in_oklch,var(--foreground)_8%,transparent)_6px)]"
                        style={{ height: pastH }}
                        data-testid="heatmap-past"
                      />
                    ) : null}
                    {dayHits.map(({ key, hits }) => {
                      const slot = hits[0]!;
                      const start = new Date(slot.start);
                      if (start.getTime() <= now.getTime()) return null;
                      const { top, height } = heatmapSlotOffset(start, firstHour, zone);
                      if (top + height <= 0 || top >= bodyH) return null;
                      const extra = hits.length > 1 ? ` (${hits.length} options)` : "";
                      const label = formatStart(slot, hour12, zone);
                      return (
                        <button
                          key={key}
                          type="button"
                          data-testid="heatmap-slot"
                          data-start={slot.start}
                          aria-label={`Open ${label}${extra}`}
                          onClick={() => pickCell(hits)}
                          className="absolute inset-x-1 z-[2] flex items-center overflow-hidden rounded-md bg-primary/35 px-1.5 text-left text-[11px] font-medium leading-none text-foreground hover:z-[3] hover:bg-background hover:shadow-sm hover:ring-1 hover:ring-border"
                          style={{ top, height }}
                        >
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {nowTop != null && todayIdx >= 0 ? (
              <div
                data-testid="now-line"
                className="pointer-events-none absolute z-20"
                style={{
                  top: nowTop,
                  left: `calc(3.25rem + ${todayIdx} * ((100% - 3.25rem) / 7))`,
                  width: `calc((100% - 3.25rem) / 7)`,
                }}
              >
                <div className="absolute -left-1 -top-1 size-2 rounded-full bg-red-500" />
                <div className="h-px w-full bg-red-500" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {cellChoices && cellChoices.length > 1 ? (
        <div className="mt-3 shrink-0 rounded-md border p-3">
          <p className="mb-2 text-sm font-medium">
            {cellChoices.some((slot) => slot.resourceLabel)
              ? "Pick an aircraft"
              : "More than one opening. Pick one."}
          </p>
          <TimeList slots={cellChoices} zone={zone} hour12={hour12} onPick={onPick} />
        </div>
      ) : null}
    </div>
  );
}

function formatHourLabel(minute: number, hour12: boolean) {
  const h = Math.floor(minute / 60);
  const d = new Date(Date.UTC(2026, 0, 1, h, 0));
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    hour12,
    timeZone: "UTC",
  }).format(d);
}

function WeekChipsView({
  weekStart,
  zone,
  hour12,
  slots,
  onPick,
}: {
  weekStart: Date;
  zone: string;
  hour12: boolean;
  slots: PublicBookableSlot[];
  onPick: (slot: PublicBookableSlot) => void;
}) {
  const days = weekDays(weekStart, zone);
  if (slotsInWeek(slots, weekStart, zone).length === 0) return <EmptyTimes kind="week" />;
  return (
    <div className="-mx-4 overflow-x-auto overscroll-x-contain snap-x snap-mandatory px-4 pb-1 sm:mx-0 sm:overflow-visible sm:px-0 sm:snap-none">
      <div className="flex min-w-max gap-3 sm:grid sm:min-w-0 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((day) => {
          const list = slotsOnDay(slots, day, zone);
          return (
            <div
              key={dateKey(day, zone)}
              data-testid="slot-day-col"
              className="w-28 shrink-0 snap-start sm:w-auto"
            >
              <p className="sticky top-0 mb-2 bg-card text-xs font-medium">
                {formatWeekdayHeader(day, zone)}
              </p>
              <div className="flex flex-col gap-1.5">
                {list.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None</p>
                ) : (
                  list.map((slot) => (
                    <Button
                      key={`${slot.start}-${slot.resourceId ?? ""}`}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-10 touch-manipulation justify-start gap-1.5 px-2 text-xs sm:h-8"
                      data-testid="slot-start"
                      data-start={slot.start}
                      onClick={() => onPick(slot)}
                    >
                      <span className="size-1.5 rounded-full bg-success" aria-hidden />
                      {formatStart(slot, hour12, zone)}
                      {slot.resourceLabel ? ` · ${slot.resourceLabel}` : ""}
                    </Button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyTimes({ kind }: { kind: "week" | "month" }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm font-medium">
        {kind === "month" ? "No open times this month" : "No open times this week"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {kind === "month" ? "Try the next month, or check back later." : "Try the next week, or check back later."}
      </p>
    </div>
  );
}

function DetailsStep({
  page,
  orgSlug,
  offeringSlug,
  slot,
  zone,
  hour12,
  onBack,
  onSubmitted,
}: {
  page: PublicBookingPage;
  orgSlug: string;
  offeringSlug: string;
  slot: PublicBookableSlot;
  zone: string;
  hour12: boolean;
  onBack: () => void;
  onSubmitted: (email: string) => void;
}) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [honeypot, setHoneypot] = React.useState("");
  const [consent, setConsent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const submittingRef = React.useRef(false);

  const when = `${formatDayHeading(new Date(slot.start), zone)} · ${formatStart(slot, hour12, zone)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current || busy) return;
    if (name.trim().length < 2) return setError("Enter your name.");
    if (!email.trim()) return setError("Enter your email.");
    if (!consent) return setError("Please confirm you want the school to review this request.");
    if (page.offering.allowResourceChoice && !(typeof slot.resourceId === "number" && slot.resourceId > 0)) {
      return setError("Choose an aircraft.");
    }
    submittingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await submitPublicBookingRequest(orgSlug, offeringSlug, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
        start: slot.start,
        end: slot.end,
        timeZoneName: slot.timeZone,
        resourceId: slot.resourceId ?? undefined,
        consent: true,
        website: honeypot,
      });
      onSubmitted(email.trim());
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not submit this request. Try another time.";
      setError(message);
      toast.error(message);
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 mb-3 h-10 sm:h-8"
        onClick={onBack}
      >
        <ChevronLeft className="size-4" /> Back to times
      </Button>
      <p className="text-base font-medium sm:text-sm">{when}</p>
      {slot.resourceLabel ? (
        <p className="text-xs text-muted-foreground">{slot.resourceLabel}</p>
      ) : null}
      <form onSubmit={submit} className="mt-5 space-y-4 pb-20 sm:pb-0">
        <input
          type="text"
          name="aer_hp"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />
        <div className="space-y-1.5">
          <Label htmlFor="guest-name">Name</Label>
          <Input
            id="guest-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="h-12 text-base sm:h-9 sm:text-sm"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="guest-email">Email</Label>
          <Input
            id="guest-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="h-12 text-base sm:h-9 sm:text-sm"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="guest-phone">Phone (optional)</Label>
          <Input
            id="guest-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            className="h-12 text-base sm:h-9 sm:text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="guest-notes">Notes (optional)</Label>
          <Textarea
            id="guest-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="What you would like to fly, or any questions for the school."
          />
        </div>
        <label className="flex items-start gap-3 text-sm leading-snug">
          <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5 size-5 sm:size-4" />
          <span>
            I understand this is a request. {page.organization.name} will review it after I
            confirm my email, and it is not a booking until they approve it.
          </span>
        </label>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur [.consent-banner-open_&]:bottom-32 sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:pb-0 sm:backdrop-blur-none">
          <Button type="submit" className="h-12 w-full touch-manipulation text-base sm:h-9 sm:text-sm" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Submit request
          </Button>
        </div>
      </form>
    </div>
  );
}
