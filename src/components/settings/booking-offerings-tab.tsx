import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarRange,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCalendarVisibility,
  useCreateBookingOffering,
  useUpdateBookingOffering,
  useUpdateCalendarVisibility,
} from "@/features/booking-offerings";
import { useLocations, useMembers, useResources, useUpdateOrganization } from "@/features/queries";
import type {
  BookingOffering,
  BookingOfferingInput,
  BookingOfferingReservationType,
  CalendarDetailLevel,
  OrganizationCalendarVisibility,
} from "@/types/booking-offerings";
import type { OrganizationUser, Resource } from "@/types/api";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { ErrorState } from "@/components/states";
import { ResponsiveModal } from "@/components/responsive-modal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, PreferenceToggle } from "@/components/settings/parts";
import { DocsHint, DocsLink } from "@/components/docs-hint";
import type { DocsTopicKey } from "@/lib/docs-links";
import {
  publicBookingIframeSnippet,
  publicBookingModalSnippet,
} from "@/components/public-booking/embed-snippets";
import { parsePublicBookingEmbedHosts } from "@/lib/public-booking-embed-hosts";
import { publicBookingAccentFeedback } from "@/lib/public-booking-brand";

function errMessage(e: unknown, fallback: string) {
  if (e instanceof ApiError || e instanceof Error) return e.message || fallback;
  return fallback;
}

const VISIBILITY_LEVELS: Record<
  CalendarDetailLevel,
  { label: string; hint: string }
> = {
  slots_only: {
    label: "Open slots only",
    hint: "Only times they can book. Occupied times are missing. If the offering lets them pick an aircraft, free times still include the tail.",
  },
  blocked_anonymous: {
    label: "Blocked, no names",
    hint: "Busy times stay anonymous: no who, no tail. On the public page those times are omitted rather than shown as a named flight.",
  },
  own_bookings_named: {
    label: "Own bookings named",
    hint: "They can see their own flights by name. Everyone else stays anonymous. Free times can include a tail if the offering lets them pick aircraft.",
  },
  full: {
    label: "Full schedule",
    hint: "Names and tails, closest to the front desk. Use this only for people you trust with the whole board.",
  },
};

const VISIBILITY_AUDIENCES: {
  key: keyof OrganizationCalendarVisibility;
  label: string;
  hint: string;
  docs: DocsTopicKey;
}[] = [
  {
    key: "guestLevel",
    label: "Guests (public booking)",
    hint: "People with no account, using a public /book link.",
    docs: "calendar-visibility-guests",
  },
  {
    key: "studentLevel",
    label: "Students",
    hint: "Signed-in members with the student role, when picking offering times.",
    docs: "calendar-visibility-students",
  },
  {
    key: "renterLevel",
    label: "Renters",
    hint: "Signed-in members with the renter role, when picking offering times.",
    docs: "calendar-visibility-renters",
  },
  {
    key: "instructorLevel",
    label: "Instructors",
    hint: "Signed-in members with the instructor role, when picking offering times.",
    docs: "calendar-visibility-instructors",
  },
  {
    key: "memberLevel",
    label: "Other members",
    hint: "Signed-in people who are not student, renter, or instructor. Desk staff are never in this list.",
    docs: "calendar-visibility-members",
  },
];

const RESERVATION_TYPE_OPTIONS: { value: BookingOfferingReservationType; label: string }[] = [
  { value: "guest", label: "Guest / discovery" },
  { value: "solo", label: "Solo" },
  { value: "dual", label: "Dual instruction" },
  { value: "rental", label: "Rental" },
  { value: "ground", label: "Ground" },
  { value: "sim", label: "Simulator" },
];

const ASSIGNMENT_MODE_OPTIONS = [
  { value: "desk_assigns", label: "Desk assigns aircraft and instructor" },
  { value: "member_picks_resource", label: "Member picks from eligible resources" },
];

const FIXED_LENGTH_OPTIONS = [
  { value: "off", label: "Use org default" },
  { value: "30", label: "30 minutes" },
  { value: "45", label: "45 minutes" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1 hour 30 minutes" },
  { value: "120", label: "2 hours" },
];

const NOTICE_OPTIONS = [
  { value: "off", label: "Use org default" },
  { value: "60", label: "1 hour" },
  { value: "120", label: "2 hours" },
  { value: "240", label: "4 hours" },
  { value: "1440", label: "24 hours" },
  { value: "2880", label: "48 hours" },
];

const HORIZON_OPTIONS = [
  { value: "off", label: "Use org default" },
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
];

function resourceLabel(r: Resource): string {
  const plane = r.type?.plane?.tailNumber;
  if (plane) return plane;
  const sim = r.type?.simulator?.name;
  if (sim) return sim;
  const room = r.type?.room?.roomNumber;
  if (room) return room;
  return `Resource #${r.id}`;
}

function memberLabel(m: OrganizationUser): string {
  return m.user?.name?.trim() || m.user?.email || `Member #${m.id}`;
}

function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function optionalMinutes(value: string): number | null | undefined {
  if (value === "off") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function minutesSelectValue(value: number | null | undefined): string {
  if (value == null) return "off";
  return String(value);
}

export function BookingOfferingsTab() {
  return (
    <div className="space-y-5">
      <PublicBookingCard />
      <OfferingsJumpCard />
      <CalendarVisibilityCard />
    </div>
  );
}

function OfferingsJumpCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
            <CalendarRange className="size-4" />
          </span>
          <div>
            <CardTitle>Offerings</CardTitle>
            <CardDescription>
              Discovery flights and other bookable products. Add, pause, and share each
              offering&rsquo;s public link from the Offerings page.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link to="/offerings">
            Configure booking offerings
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function publicOfferingUrl(orgSlug: string, offeringSlug: string) {
  return `${window.location.origin}/book/${orgSlug}/${offeringSlug}`;
}

function PublicBookingCard() {
  const { organization, rehydrate } = useAuth();
  const update = useUpdateOrganization();
  const [slug, setSlug] = React.useState(organization?.publicBookingSlug ?? "");
  const [embedHostsText, setEmbedHostsText] = React.useState(
    (organization?.publicBookingEmbedHosts ?? []).join("\n")
  );
  const [accentHex, setAccentHex] = React.useState(organization?.publicBookingAccentHex ?? "");

  React.useEffect(() => {
    void rehydrate();
  }, [rehydrate]);

  React.useEffect(() => {
    setSlug(organization?.publicBookingSlug ?? "");
  }, [organization?.publicBookingSlug]);
  React.useEffect(() => {
    setAccentHex(organization?.publicBookingAccentHex ?? "");
  }, [organization?.publicBookingAccentHex]);

  const storedEmbedHosts = (organization?.publicBookingEmbedHosts ?? []).join("\n");
  const embedDirtyRef = React.useRef(false);
  const embedFocusTextRef = React.useRef("");
  React.useEffect(() => {
    if (embedDirtyRef.current) return;
    setEmbedHostsText(storedEmbedHosts);
  }, [storedEmbedHosts]);

  if (!organization || organization.isDemo) return null;

  function save(patch: Record<string, unknown>, ok = "Public booking updated.", onSaved?: () => void) {
    update.mutate(patch, {
      onSuccess: async () => {
        onSaved?.();
        toast.success(ok);
        await rehydrate();
      },
      onError: (e) => toast.error(errMessage(e, "Couldn't save public booking.")),
    });
  }

  return (
    <Card data-doc-shot="public-booking-share">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
            <Link2 className="size-4" />
          </span>
          <div>
            <CardTitle>Public booking links</CardTitle>
            <CardDescription>
            Share a page for guests who do not have an account. They pick a day and a
            start time, submit a request, confirm their email, and you approve it from
            Calendar → Booking requests. Members keep booking the way they do today.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
        <PreferenceToggle
          label="Allow public requests"
          docs="public-booking-links"
          description="Turns on shareable /book links for active offerings. A request is not a booking until the desk approves it."
          checked={!!organization.publicBookingEnabled}
          saving={update.isPending}
          onCheckedChange={(on) => save({ publicBookingEnabled: on })}
        />
        {organization.publicBookingEnabled ? (
          <>
            <Field
              label="Link slug"
              htmlFor="public-booking-slug"
              hint="Used in the public URL. Lowercase letters, numbers, and hyphens."
            >
              <Input
                id="public-booking-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  e.currentTarget.blur();
                }}
                onBlur={() => {
                  const next = slug.trim().toLowerCase();
                  if (!next || next === (organization.publicBookingSlug ?? "")) return;
                  save({ publicBookingSlug: next });
                }}
                placeholder="your-school"
                autoComplete="off"
              />
            </Field>
            <Field
              label="Websites that may embed"
              htmlFor="public-booking-embed-hosts"
              docs="public-booking-embed-hosts"
              hint="One host per line, like www.yourschool.com. If both www and the bare domain serve your site, list both. Leave empty to keep the share link only. AerScheduler can still open the page in its own tab."
            >
              <Textarea
                id="public-booking-embed-hosts"
                rows={4}
                value={embedHostsText}
                onChange={(e) => {
                  embedDirtyRef.current = true;
                  setEmbedHostsText(e.target.value);
                }}
                onFocus={() => {
                  embedFocusTextRef.current = embedHostsText;
                }}
                onBlur={() => {
                  const parsed = parsePublicBookingEmbedHosts(embedHostsText);
                  if ("error" in parsed) {
                    toast.error(parsed.error);
                    return;
                  }
                  const current = organization.publicBookingEmbedHosts ?? [];
                  if (parsed.origins.join("\n") === current.join("\n")) {
                    embedDirtyRef.current = false;
                    return;
                  }
                  if (
                    parsed.origins.length === 0 &&
                    current.length > 0 &&
                    !embedFocusTextRef.current.trim()
                  ) {
                    setEmbedHostsText(storedEmbedHosts);
                    embedDirtyRef.current = false;
                    return;
                  }
                  save({ publicBookingEmbedHosts: parsed.origins }, "Embed websites updated.", () => {
                    embedDirtyRef.current = false;
                  });
                }}
                placeholder={"www.yourschool.com"}
                autoComplete="off"
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              Open an offering on the Offerings page for Open public link, Copy public
              link, Copy embed code (iframe), and Copy modal embed. Other websites cannot
              show the frame until you list them here. Do not paste arbitrary CSS or
              scripts into the page.
            </p>
            <div className="flex items-center gap-1">
              <p className="text-xs font-medium text-muted-foreground">Guest page look</p>
              <DocsHint topic="public-booking-branding" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Accent color" htmlFor="public-booking-accent" hint="Hex on the guest page. Leave blank for the default blue.">
                <Input
                  id="public-booking-accent"
                  value={accentHex}
                  placeholder="#1967D2"
                  onChange={(e) => setAccentHex(e.target.value)}
                  onBlur={() => {
                    const next = accentHex.trim() || null;
                    if (next === (organization.publicBookingAccentHex ?? null)) return;
                    if (next) {
                      const problem = publicBookingAccentFeedback(next);
                      if (problem) {
                        toast.error(problem);
                        setAccentHex(organization.publicBookingAccentHex ?? "");
                        return;
                      }
                    }
                    save({ publicBookingAccentHex: next }, "Guest page accent updated.");
                  }}
                />
              </Field>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Appearance</Label>
                <Select
                  value={organization.publicBookingAppearance ?? "system"}
                  onValueChange={(value) => save({ publicBookingAppearance: value }, "Guest page appearance updated.")}
                >
                  <SelectTrigger aria-label="Guest page appearance">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">Match the visitor</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Density</Label>
                <Select
                  value={organization.publicBookingDensity ?? "comfortable"}
                  onValueChange={(value) => save({ publicBookingDensity: value }, "Guest page density updated.")}
                >
                  <SelectTrigger aria-label="Guest page density">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comfortable">Comfortable</SelectItem>
                    <SelectItem value="compact">Compact</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Corners</Label>
                <Select
                  value={organization.publicBookingCornerStyle ?? "rounded"}
                  onValueChange={(value) => save({ publicBookingCornerStyle: value }, "Guest page corners updated.")}
                >
                  <SelectTrigger aria-label="Guest page corners">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rounded">Rounded</SelectItem>
                    <SelectItem value="sharp">Sharp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

function CalendarVisibilityCard() {
  const q = useCalendarVisibility();
  const update = useUpdateCalendarVisibility();
  const [pending, setPending] = React.useState<keyof OrganizationCalendarVisibility | null>(null);

  async function saveLevel(
    key: keyof OrganizationCalendarVisibility,
    level: CalendarDetailLevel
  ) {
    setPending(key);
    update.mutate(
      { [key]: level },
      {
        onSuccess: () => toast.success("Calendar visibility updated."),
        onError: (e) => toast.error(errMessage(e, "Couldn't save calendar visibility.")),
        onSettled: () => setPending(null),
      }
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
            <Globe className="size-4" />
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <CardTitle>Calendar visibility</CardTitle>
              <DocsHint topic="calendar-visibility" />
            </div>
            <CardDescription>
              When someone picks a time on a public /book page or an offering, how much of
              the schedule they see. This does not change Calendar for owners, admins, or
              dispatchers, who always see the full board.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {q.isPending ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : (
            VISIBILITY_AUDIENCES.map(({ key, label, hint, docs }) => (
              <Field key={key} label={label} docs={docs} hint={hint}>
                <Select
                  value={q.data?.[key] ?? "blocked_anonymous"}
                  disabled={pending === key || update.isPending}
                  onValueChange={(value) => void saveLevel(key, value as CalendarDetailLevel)}
                >
                  <SelectTrigger className="w-full" aria-label={label}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-w-sm">
                    {(Object.keys(VISIBILITY_LEVELS) as CalendarDetailLevel[]).map((level) => (
                      <SelectItem
                        key={level}
                        value={level}
                        description={VISIBILITY_LEVELS[level].hint}
                      >
                        {VISIBILITY_LEVELS[level].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Open a dropdown for a one-line explanation, or{" "}
          <DocsLink topic="calendar-visibility-levels">read the full guide</DocsLink>.
        </p>
      </CardContent>
    </Card>
  );
}

export function OfferingRow({
  offering,
  onEdit,
  onToggleActive,
  busy,
}: {
  offering: BookingOffering;
  onEdit: (offering: BookingOffering) => void;
  onToggleActive: (offering: BookingOffering) => void;
  busy: boolean;
}) {
  const { organization } = useAuth();
  const [copied, setCopied] = React.useState(false);
  const publicSlug = organization?.publicBookingEnabled ? organization.publicBookingSlug : null;
  const path = publicSlug ? `/${publicSlug}/${offering.slug}` : `/${offering.slug}`;
  const shareUrl =
    publicSlug && offering.active ? publicOfferingUrl(publicSlug, offering.slug) : null;
  const embedListed = (organization?.publicBookingEmbedHosts?.length ?? 0) > 0;
  const duration =
    offering.fixedReservationMinutes != null ? `${offering.fixedReservationMinutes}m` : null;
  const shareHint = !organization?.publicBookingEnabled
    ? "Turn on public requests under Settings → Booking links."
    : !offering.active
      ? "Activate this offering to share its public link."
      : null;

  function copySnippet(text: string, ok: string, needsAllowlist: boolean) {
    void navigator.clipboard
      .writeText(text)
      .then(() =>
        toast.success(
          needsAllowlist && !embedListed
            ? `${ok} Add your website under Websites that may embed, or other sites cannot show this frame.`
            : ok
        )
      )
      .catch(() => toast.error("Couldn't copy"));
  }

  function copyLink() {
    if (!shareUrl) return;
    void navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        setCopied(true);
        toast.success("Public link copied");
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => toast.error("Couldn't copy link"));
  }

  function openPublic() {
    if (!shareUrl) return;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40">
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        aria-label={`Edit ${offering.name}`}
        onClick={() => onEdit(offering)}
      >
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="truncate text-sm font-semibold">{offering.name}</span>
          <span className="truncate font-mono text-xs text-muted-foreground">{path}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {duration && (
            <Badge variant="outline">
              <Clock className="size-3" />
              {duration}
            </Badge>
          )}
          <Badge variant="outline">{offering.reservationType}</Badge>
          {!offering.active && <Badge variant="warning">Paused</Badge>}
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <Switch
          size="sm"
          checked={offering.active}
          disabled={busy}
          onCheckedChange={() => onToggleActive(offering)}
          aria-label={offering.active ? `Pause ${offering.name}` : `Activate ${offering.name}`}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={!shareUrl}
                aria-label={`Open public link for ${offering.name}`}
                onClick={openPublic}
              >
                <ExternalLink className="size-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{shareHint ?? "Open public link"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={!shareUrl}
                aria-label={`Copy public link for ${offering.name}`}
                onClick={copyLink}
              >
                {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{shareHint ?? "Copy public link"}</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${offering.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => onEdit(offering)}>
              <Pencil /> Edit
            </DropdownMenuItem>
            {shareUrl ? (
              <>
                <DropdownMenuItem onSelect={openPublic}>
                  <ExternalLink /> Open public link
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={copyLink}>
                  {copied ? <Check /> : <Copy />} Copy public link
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    copySnippet(publicBookingIframeSnippet(shareUrl), "Embed code copied.", true);
                  }}
                >
                  <Copy /> Copy embed code
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    copySnippet(publicBookingModalSnippet(shareUrl), "Modal embed copied.", true);
                  }}
                >
                  <Copy /> Copy modal embed
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuItem disabled={busy} onSelect={() => onToggleActive(offering)}>
              {offering.active ? "Pause offering" : "Activate offering"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

type FormState = {
  name: string;
  slug: string;
  description: string;
  active: boolean;
  reservationType: BookingOfferingReservationType;
  assignmentMode: "desk_assigns" | "member_picks_resource";
  locationId: string;
  resourceIds: number[];
  instructorOrgUserIds: number[];
  fixedMinutes: string;
  noticeMinutes: string;
  horizonDays: string;
  allowResourceChoice: boolean;
  collectionStyle: "close_out" | "prepaid_fixed";
  packageDollars: string;
};

function emptyForm(): FormState {
  return {
    name: "",
    slug: "",
    description: "",
    active: false,
    reservationType: "guest",
    assignmentMode: "desk_assigns",
    locationId: "none",
    resourceIds: [],
    instructorOrgUserIds: [],
    fixedMinutes: "90",
    noticeMinutes: "off",
    horizonDays: "off",
    allowResourceChoice: false,
    collectionStyle: "close_out",
    packageDollars: "",
  };
}

function formFromOffering(offering: BookingOffering): FormState {
  return {
    name: offering.name,
    slug: offering.slug,
    description: offering.description ?? "",
    active: offering.active,
    reservationType: offering.reservationType,
    assignmentMode: offering.assignmentMode,
    locationId: offering.location?.id ? String(offering.location.id) : "none",
    resourceIds: (offering.resources ?? [])
      .map((row) => row.resource?.id)
      .filter((id): id is number => id != null),
    instructorOrgUserIds: (offering.instructors ?? [])
      .map((row) => row.instructorOrgUser?.id)
      .filter((id): id is number => id != null),
    fixedMinutes: minutesSelectValue(offering.fixedReservationMinutes),
    noticeMinutes: minutesSelectValue(offering.minimumNoticeMinutes),
    horizonDays: minutesSelectValue(offering.bookingHorizonDays),
    allowResourceChoice: offering.allowResourceChoice,
    collectionStyle: offering.collectionStyle === "prepaid_fixed" ? "prepaid_fixed" : "close_out",
    packageDollars:
      offering.prepaidAmountCents != null ? (offering.prepaidAmountCents / 100).toFixed(2) : "",
  };
}

export function BookingOfferingFormModal({
  open,
  onOpenChange,
  offering,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offering: BookingOffering | null;
}) {
  const create = useCreateBookingOffering();
  const update = useUpdateBookingOffering();
  const locations = useLocations({ enabled: open });
  const resources = useResources({ enabled: open });
  const instructors = useMembers({ instructor: true }, { enabled: open });

  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setShowErrors(false);
    setSlugTouched(!!offering);
    setForm(offering ? formFromOffering(offering) : emptyForm());
  }, [open, offering]);

  const pending = create.isPending || update.isPending;
  const isEdit = offering != null;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "name" && !slugTouched && typeof value === "string") {
        next.slug = slugFromName(value);
      }
      return next;
    });
  }

  function buildInput(): BookingOfferingInput | null {
    const name = form.name.trim();
    const slug = form.slug.trim().toLowerCase();
    if (!name || !slug) return null;
    if (form.fixedMinutes === "off") return null;

    return {
      name,
      slug,
      description: form.description.trim() || null,
      active: form.active,
      reservationType: form.reservationType,
      assignmentMode: form.assignmentMode,
      locationId: form.locationId === "none" ? null : Number(form.locationId),
      resourceIds: form.resourceIds,
      instructorOrgUserIds: form.instructorOrgUserIds,
      fixedReservationMinutes: Number(form.fixedMinutes),
      minimumNoticeMinutes: optionalMinutes(form.noticeMinutes),
      bookingHorizonDays: optionalMinutes(form.horizonDays),
      allowResourceChoice: form.allowResourceChoice,
      collectionStyle: form.collectionStyle,
      prepaidAmountCents:
        form.collectionStyle === "prepaid_fixed"
          ? Math.round(Number(form.packageDollars) * 100)
          : null,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    const input = buildInput();
    if (!input) {
      toast.error("Name, slug, and fixed duration are required.");
      return;
    }
    if (form.collectionStyle === "prepaid_fixed") {
      const dollars = Number(form.packageDollars);
      if (!Number.isFinite(dollars) || dollars < 0.5) {
        toast.error("Enter a package price of at least $0.50.");
        return;
      }
    }

    const done = {
      onSuccess: (saved: BookingOffering) => {
        toast.success(isEdit ? `"${saved.name}" updated.` : `"${saved.name}" created.`);
        onOpenChange(false);
      },
      onError: (err: unknown) => toast.error(errMessage(err, "Couldn't save this offering.")),
    };

    if (isEdit && offering) update.mutate({ id: offering.id, ...input }, done);
    else create.mutate(input, done);
  }

  const nameError = showErrors && !form.name.trim();
  const slugError = showErrors && !form.slug.trim();
  const durationError = showErrors && form.fixedMinutes === "off";

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      className="sm:max-w-2xl"
      title={isEdit ? `Edit ${offering?.name}` : "Add booking offering"}
      description="Presets for guest discovery flights and similar products. Rules may only be stricter than org booking preferences."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="booking-offering-form" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? "Save changes" : "Create offering"}
          </Button>
        </div>
      }
    >
      <form id="booking-offering-form" onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bo-name">Name</Label>
            <Input
              id="bo-name"
              autoFocus
              maxLength={120}
              placeholder="Discovery flight"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              aria-invalid={nameError}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bo-slug">Public slug</Label>
            <Input
              id="bo-slug"
              maxLength={80}
              placeholder="discovery-flight"
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value.toLowerCase());
              }}
              aria-invalid={slugError}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bo-description">Description</Label>
          <Textarea
            id="bo-description"
            rows={2}
            maxLength={500}
            placeholder="Shown on the public booking page later."
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        <PreferenceToggle
          label="Active"
          description="Paused offerings are hidden from slot lookup."
          checked={form.active}
          onCheckedChange={(checked) => set("active", checked)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Reservation type</Label>
            <Select
              value={form.reservationType}
              onValueChange={(value) =>
                set("reservationType", value as BookingOfferingReservationType)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESERVATION_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Assignment</Label>
            <Select
              value={form.assignmentMode}
              onValueChange={(value) =>
                set("assignmentMode", value as FormState["assignmentMode"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNMENT_MODE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <PolicyField
            label="Fixed duration"
            value={form.fixedMinutes}
            onValueChange={(value) => set("fixedMinutes", value)}
            options={FIXED_LENGTH_OPTIONS.filter((o) => o.value !== "off")}
            error={durationError}
          />
          <PolicyField
            label="Minimum notice"
            value={form.noticeMinutes}
            onValueChange={(value) => set("noticeMinutes", value)}
            options={NOTICE_OPTIONS}
          />
          <PolicyField
            label="Booking horizon"
            value={form.horizonDays}
            onValueChange={(value) => set("horizonDays", value)}
            options={HORIZON_OPTIONS}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Location</Label>
          <Select value={form.locationId} onValueChange={(value) => set("locationId", value)}>
            <SelectTrigger>
              <SelectValue placeholder="Any org location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Any org location</SelectItem>
              {(locations.data ?? []).map((loc) => (
                <SelectItem key={loc.id} value={String(loc.id)}>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <IdPicker
          legend="Eligible aircraft"
          searchId="bo-resources"
          searchPlaceholder="Search fleet…"
          loading={resources.isLoading}
          items={(resources.data ?? []).map((r) => ({
            id: r.id,
            label: resourceLabel(r),
            sub: r.location?.name ?? undefined,
          }))}
          selected={form.resourceIds}
          onChange={(ids) => set("resourceIds", ids)}
          emptyText="No aircraft, rooms, or simulators yet."
        />

        <IdPicker
          legend="Eligible instructors"
          searchId="bo-instructors"
          searchPlaceholder="Search instructors…"
          loading={instructors.isLoading}
          items={(instructors.data ?? []).map((m) => ({
            id: m.id,
            label: memberLabel(m),
            sub: undefined,
          }))}
          selected={form.instructorOrgUserIds}
          onChange={(ids) => set("instructorOrgUserIds", ids)}
          emptyText="No instructors in this organization yet."
        />

        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">Requester choices</Label>
          <PreferenceToggle
            label="Let requester pick aircraft"
            description="Each free time shows the tail so they can choose the aircraft. That tail is held until the request expires, is declined, or you approve it. Tick more than one eligible aircraft above. The desk assigns the instructor. An offering has one location."
            checked={form.allowResourceChoice}
            onCheckedChange={(checked) => set("allowResourceChoice", checked)}
          />
          <p className="text-xs text-muted-foreground">
            Guests do not pick an instructor or location. Eligible instructors above are who the
            desk can assign when they approve.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Label className="text-xs font-medium text-muted-foreground">How this offering is billed</Label>
            <DocsHint topic="collection-style" />
          </div>
          <Select
            value={form.collectionStyle}
            onValueChange={(value) => set("collectionStyle", value as FormState["collectionStyle"])}
          >
            <SelectTrigger aria-label="How this offering is billed">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="close_out">Bill after the flight</SelectItem>
              <SelectItem value="prepaid_fixed">Charge a package price when approved</SelectItem>
            </SelectContent>
          </Select>
          {form.collectionStyle === "prepaid_fixed" ? (
            <div className="space-y-1.5">
              <Label htmlFor="bo-package">Package price (USD)</Label>
              <Input
                id="bo-package"
                inputMode="decimal"
                placeholder="249.00"
                value={form.packageDollars}
                onChange={(e) => set("packageDollars", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                When the desk approves, AerScheduler invoices this amount through Stripe.
                The guest can pay any time, including the day of. Instructors see Collect
                payment until it is paid. Close-out records Hobbs and does not bill the hop
                a second time.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Close-out bills Hobbs and instruction as usual.
            </p>
          )}
        </div>
      </form>
    </ResponsiveModal>
  );
}

function PolicyField({
  label,
  value,
  onValueChange,
  options,
  error,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  error?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger aria-invalid={error} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function IdPicker({
  legend,
  searchId,
  searchPlaceholder,
  loading,
  items,
  selected,
  onChange,
  emptyText,
}: {
  legend: string;
  searchId: string;
  searchPlaceholder: string;
  loading: boolean;
  items: Array<{ id: number; label: string; sub?: string }>;
  selected: number[];
  onChange: (ids: number[]) => void;
  emptyText: string;
}) {
  const [filter, setFilter] = React.useState("");
  const shown = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.label.toLowerCase().includes(q) || i.sub?.toLowerCase().includes(q)
    );
  }, [filter, items]);

  function toggle(id: number, on: boolean) {
    onChange(on ? [...selected, id] : selected.filter((v) => v !== id));
  }

  return (
    <div className="space-y-2">
      <Label>{legend}</Label>
      {items.length > 6 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={searchId}
            className="pl-8"
            placeholder={searchPlaceholder}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      )}
      <div className="rounded-lg border border-border">
        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-40" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">{emptyText}</p>
        ) : shown.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            Nothing matches &ldquo;{filter}&rdquo;.
          </p>
        ) : (
          <ul className="max-h-48 divide-y divide-border overflow-y-auto">
            {shown.map((item) => {
              const inputId = `${searchId}-opt-${item.id}`;
              return (
                <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox
                    id={inputId}
                    checked={selected.includes(item.id)}
                    onCheckedChange={(v) => toggle(item.id, v === true)}
                  />
                  <Label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block truncate text-sm font-normal">{item.label}</span>
                    {item.sub && (
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        {item.sub}
                      </span>
                    )}
                  </Label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
