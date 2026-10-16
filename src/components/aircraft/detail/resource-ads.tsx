import * as React from "react";
import { Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { ChevronDown, ExternalLink, Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { AdNotApplicableReason, AircraftAdItem, Resource } from "@/types/api";
import { useAircraftAds, useDecideAircraftAd } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CardEmpty, CardSkeleton, DetailCard } from "@/components/detail/detail-page";
import { DocsHint } from "@/components/docs-hint";
import { ResponsiveModal } from "@/components/responsive-modal";
import { AddInspectionsModal } from "@/components/maintenance/add-inspections-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

/**
 * AIRWORTHINESS DIRECTIVES on the aircraft page (AD library, phase 2): the published ADs that
 * name this aircraft's airframe, engine or propeller, for somebody to decide. Owners, admins and
 * technicians, on an organization whose AD mode is "Find them for me" (catalogue).
 *
 * A match is a reason to read an AD, never a ruling: applicability names serial ranges,
 * installed parts and exceptions only a person can check. So nothing here is decided for
 * anyone, and each row shows the AD's own applicability text with what matched highlighted.
 */

type View = AircraftAdItem["state"];

const REASONS: { value: AdNotApplicableReason; label: string; hint: string }[] = [
  { value: "serial_outside", label: "Serial number outside the range", hint: "The AD names serial numbers this aircraft's is not among." },
  { value: "not_installed", label: "The affected part is not installed", hint: "A part number, kit or modification this aircraft does not have." },
  { value: "terminated", label: "Terminated by an earlier action", hint: "A terminating action was done, so nothing more is required." },
  { value: "other", label: "Other", hint: "Say why in the note." },
];
const REASON_LABEL = Object.fromEntries(REASONS.map((r) => [r.value, r.label])) as Record<AdNotApplicableReason, string>;

const day = (iso: string | null) => (iso ? format(parseISO(iso.slice(0, 10)), "MMM d, yyyy") : null);

/** "Engine oil pressure" from "JASC/ATA Code 7931, Engine Oil Pressure.", else the Federal Register title. */
function adHeadline(ad: AircraftAdItem["ad"], tracked: AircraftAdItem["tracked"]): string {
  if (!ad.inLibrary && tracked) return tracked.name;
  const subject = ad.subject?.replace(/\.$/, "").split(/;\s*/)[0].split(/,\s*/).slice(1).join(", ").trim();
  if (subject) return subject.charAt(0) + subject.slice(1).toLowerCase();
  return (ad.title ?? `AD ${ad.adNumber}`).replace(/^Airworthiness Directives?;\s*/i, "");
}

function matchWords(m: NonNullable<AircraftAdItem["match"]>): string {
  const part = m.on === "airframe" ? "Airframe" : m.on === "engine" ? "Engine" : "Propeller";
  if (m.strength === "model") return `${part}: names ${m.token}`;
  if (m.strength === "range") return `${part}: in the range ${m.token.toLowerCase().replace(/ (through|thru|to) /i, " through ")}`;
  return `${part}: names the ${m.token} series`;
}

/** The applicability text with every occurrence of what matched marked. */
function Highlighted({ text, token }: { text: string; token: string | null }) {
  if (!token) return <>{text}</>;
  // Standing alone, as the matcher reads it: "IO-360" is not the IO-360 inside "AEIO-360".
  const body = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "-\\s*");
  const parts = text.split(new RegExp(`((?<![A-Za-z0-9-])${body}(?![A-Za-z0-9]))`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-primary/15 px-0.5 text-foreground">
            {p}
          </mark>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </>
  );
}

export function ResourceAds({ resource, onEditAircraft }: { resource: Resource; onEditAircraft?: () => void }) {
  const q = useAircraftAds(resource.id);
  const decide = useDecideAircraftAd(resource.id);
  const [view, setView] = React.useState<View | null>(null);
  const [ruling, setRuling] = React.useState<AircraftAdItem | null>(null);
  const [tracking, setTracking] = React.useState<string | null>(null);

  const data = q.data;
  // Opens on what is waiting, or on what applies when nothing is.
  const shown: View = view ?? (data && data.counts.toReview === 0 && data.counts.applies > 0 ? "applies" : "to_review");
  const items = (data?.items ?? []).filter((i) => i.state === shown);

  const run = async (input: Parameters<typeof decide.mutateAsync>[0], done: string) => {
    try {
      await decide.mutateAsync(input);
      toast.success(done);
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save that. Try again.");
      return false;
    }
  };

  const tabs: { value: View; label: string; count: number }[] = [
    { value: "to_review", label: "To review", count: data?.counts.toReview ?? 0 },
    { value: "applies", label: "Applies", count: data?.counts.applies ?? 0 },
    { value: "not_applicable", label: "Not applicable", count: data?.counts.notApplicable ?? 0 },
  ];

  return (
    <>
      <DetailCard
        title={
          <span className="inline-flex items-center gap-1.5">
            Airworthiness Directives
            <DocsHint topic="aircraft-ads" />
          </span>
        }
        description="ADs published since 1995 that name this aircraft's airframe, engine or propeller. Read each one and decide whether it applies; nothing is decided for you."
        docShot="aircraft-ads"
      >
        {q.isPending ? (
          <CardSkeleton rows={3} />
        ) : q.isError || !data ? (
          <CardEmpty>Couldn&apos;t load the ADs for this aircraft.</CardEmpty>
        ) : (
          <div className="space-y-4">
            <MissingNotes missing={data.missing} coverage={data.coverage} onEditAircraft={onEditAircraft} />

            <div role="tablist" aria-label="AD status" className="flex flex-wrap gap-1.5">
              {tabs.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={shown === t.value}
                  onClick={() => setView(t.value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[13px] transition-colors",
                    shown === t.value ? "border-primary bg-primary/10 font-medium text-foreground" : "border-border text-muted-foreground hover:bg-accent/50"
                  )}
                >
                  {t.label} <span className="tabular-nums">{t.count}</span>
                </button>
              ))}
            </div>

            {items.length === 0 ? (
              <CardEmpty>
                {shown === "to_review"
                  ? data.items.length === 0
                    ? "No ADs in the library name this aircraft's make and model."
                    : "Nothing left to review."
                  : shown === "applies"
                    ? "No ADs marked as applying yet."
                    : "No ADs ruled out yet."}
              </CardEmpty>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <AdRow
                    key={item.ad.adNumber}
                    item={item}
                    busy={decide.isPending && decide.variables?.adNumber === item.ad.adNumber}
                    onTrack={() => setTracking(item.ad.adNumber)}
                    onApplies={() => void run({ adNumber: item.ad.adNumber, status: "applies" }, `AD ${item.ad.adNumber} marked as applying.`)}
                    onNotApplicable={() => setRuling(item)}
                    onUndo={() => void run({ adNumber: item.ad.adNumber, undo: true }, `AD ${item.ad.adNumber} is back to review.`)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </DetailCard>

      {ruling && (
        <NotApplicableModal
          item={ruling}
          tail={data?.aircraft.tailNumber ?? ""}
          onOpenChange={(open) => !open && setRuling(null)}
          onSave={async (reason, note) => {
            if (await run({ adNumber: ruling.ad.adNumber, status: "not_applicable", reason, note }, `AD ${ruling.ad.adNumber} marked not applicable.`)) setRuling(null);
          }}
          saving={decide.isPending}
        />
      )}

      <AddInspectionsModal
        open={!!tracking}
        onOpenChange={(open) => !open && setTracking(null)}
        fixedResource={resource}
        initialAd={tracking}
        onAdded={() => {
          // The inspection is what makes it "tracked"; the decision records who said it applies.
          if (tracking) void decide.mutateAsync({ adNumber: tracking, status: "applies" }).catch(() => undefined);
        }}
      />
    </>
  );
}

function MissingNotes({
  missing,
  coverage,
  onEditAircraft,
}: {
  missing: ("engine" | "propeller" | "serialNumber")[];
  coverage: { count: number; complete: boolean };
  onEditAircraft?: () => void;
}) {
  const parts = missing.filter((m) => m !== "serialNumber");
  const lines: React.ReactNode[] = [];
  if (parts.length) {
    const words = parts.map((p) => (p === "engine" ? "engine" : "propeller")).join(" or ");
    lines.push(
      <>
        No {words} make and model recorded, so {parts.length > 1 ? "their" : "its"} ADs are not listed.
        {onEditAircraft && (
          <>
            {" "}
            <button type="button" onClick={onEditAircraft} className="text-foreground underline underline-offset-2">
              Edit aircraft
            </button>
          </>
        )}
      </>
    );
  }
  if (missing.includes("serialNumber")) {
    lines.push(<>No serial number recorded. Many ADs apply to a range of serial numbers, and you need it to rule them out.</>);
  }
  if (!coverage.complete) {
    lines.push(<>The AD library is still loading ({coverage.count.toLocaleString()} ADs so far). More appear here as it fills.</>);
  }
  if (!lines.length) return null;
  return (
    <div className="space-y-1 text-[13px] text-muted-foreground">
      {lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </div>
  );
}

function AdRow({
  item,
  busy,
  onTrack,
  onApplies,
  onNotApplicable,
  onUndo,
}: {
  item: AircraftAdItem;
  busy: boolean;
  onTrack: () => void;
  onApplies: () => void;
  onNotApplicable: () => void;
  onUndo: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const { ad, match, review, tracked } = item;
  const effective = day(ad.effectiveOn);
  // An AD the library does not hold has nothing to read here.
  const expandable = ad.inLibrary;

  return (
    <li className="py-3 first:pt-0 last:pb-0" data-testid={`ad-${ad.adNumber}`}>
      {/* Actions under the text on a phone, beside it from sm up. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <div className="min-w-0 flex-1">
        <button type="button" onClick={() => expandable && setOpen((o) => !o)} aria-expanded={expandable ? open : undefined} className={cn("w-full text-left", !expandable && "cursor-default")}>
          <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">AD {ad.adNumber}</span>
            {effective && <span>Effective {effective}</span>}
            {!ad.inLibrary && <span>Not in the AD library</span>}
          </p>
          <p className="mt-0.5 text-sm font-medium">{adHeadline(ad, tracked)}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
            {match && <Badge variant="secondary">{matchWords(match)}</Badge>}
            {ad.manufacturer && <span className="max-w-[32rem] truncate">{ad.manufacturer}</span>}
            {expandable && <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />}
          </p>
        </button>
        <Decision item={item} />
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          {item.state === "to_review" ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={busy}>
                    Applies <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={onTrack}>Track it as an inspection</DropdownMenuItem>
                  <DropdownMenuItem onSelect={onApplies}>Applies, nothing to track</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" variant="outline" disabled={busy} onClick={onNotApplicable}>
                Not applicable
              </Button>
            </>
          ) : (
            (review || (item.state === "applies" && !tracked)) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="size-8" aria-label={`Actions for AD ${ad.adNumber}`} disabled={busy}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {item.state === "applies" && !tracked && <DropdownMenuItem onSelect={onTrack}>Track it as an inspection</DropdownMenuItem>}
                  {item.state === "applies" && <DropdownMenuItem onSelect={onNotApplicable}>Mark not applicable</DropdownMenuItem>}
                  {review && <DropdownMenuItem onSelect={onUndo}>Back to review</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            )
          )}
        </div>
      </div>

      {open && (
        <div className="mt-2 space-y-2 rounded-md bg-muted/40 p-3 text-[13px] leading-relaxed">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Applicability</p>
            <p className="mt-0.5 whitespace-pre-line">
              {ad.applicability ? <Highlighted text={ad.applicability} token={match?.strength === "range" ? null : (match?.token ?? null)} /> : "The Federal Register printed this AD without its text. Read it at the link below."}
            </p>
          </div>
          {ad.summary && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">What it requires</p>
              <p className="mt-0.5">{ad.summary}</p>
            </div>
          )}
          {ad.supersedes.length > 0 && <p className="text-muted-foreground">Supersedes AD {ad.supersedes.join(", AD ")}.</p>}
          {ad.url && (
            <a href={ad.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
              Read the AD in the Federal Register <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}
    </li>
  );
}

/** Who decided what, under the headline: the line an IA reads. */
function Decision({ item }: { item: AircraftAdItem }) {
  const { review, tracked } = item;
  if (!review && !tracked) return null;
  const who = review?.decidedBy?.name ?? null;
  const when = review ? day(review.decidedAt) : null;
  const by = [who && `by ${who}`, when && `on ${when}`].filter(Boolean).join(" ");
  return (
    <p className="mt-1 text-[12px] text-muted-foreground">
      {review?.status === "not_applicable" ? (
        <>
          Not applicable{review.reason ? `: ${REASON_LABEL[review.reason].toLowerCase()}` : ""}
          {review.note ? `. ${review.note.replace(/[.\s]+$/, "")}` : ""}
          {by ? `. Decided ${by}.` : "."}
        </>
      ) : (
        <>
          Applies{by ? `, decided ${by}` : ""}
          {tracked ? (
            <>
              . Tracked by{" "}
              <Link
                to="/maintenance/inspections/$inspectionId"
                params={{ inspectionId: String(tracked.reminderId) }}
                className="text-foreground underline underline-offset-2"
              >
                {tracked.name}
              </Link>
              .
            </>
          ) : (
            "."
          )}
        </>
      )}
    </p>
  );
}

function NotApplicableModal({
  item,
  tail,
  onOpenChange,
  onSave,
  saving,
}: {
  item: AircraftAdItem;
  tail: string;
  onOpenChange: (open: boolean) => void;
  onSave: (reason: AdNotApplicableReason, note: string | null) => void;
  saving: boolean;
}) {
  const [reason, setReason] = React.useState<AdNotApplicableReason | "">("");
  const [note, setNote] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const needsNote = reason === "other" && !note.trim();

  return (
    <ResponsiveModal
      open
      onOpenChange={onOpenChange}
      title={`AD ${item.ad.adNumber} does not apply`}
      description={`Say why it does not apply to ${tail}. This is kept with who decided and when.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={() => {
              setTried(true);
              if (!reason || needsNote) return;
              onSave(reason, note.trim() || null);
            }}
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <RadioGroup value={reason} onValueChange={(v) => setReason(v as AdNotApplicableReason)} aria-invalid={tried && !reason} className="space-y-2">
          {REASONS.map((r) => (
            <label key={r.value} htmlFor={`ad-reason-${r.value}`} className="flex cursor-pointer items-start gap-2.5">
              <RadioGroupItem id={`ad-reason-${r.value}`} value={r.value} className="mt-0.5" />
              <span>
                <span className="block text-sm">{r.label}</span>
                <span className="block text-xs text-muted-foreground">{r.hint}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
        {tried && !reason && <p className="text-xs text-destructive">Pick a reason.</p>}
        <div className="space-y-1.5">
          <Label htmlFor="ad-note">Note{reason === "other" ? "" : " (optional)"}</Label>
          <Textarea
            id="ad-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={reason === "serial_outside" ? "S/N 172S10457 is after the range." : "What you checked."}
            aria-invalid={tried && needsNote}
          />
          {tried && needsNote && <p className="text-xs text-destructive">Say why in the note.</p>}
        </div>
      </div>
    </ResponsiveModal>
  );
}
