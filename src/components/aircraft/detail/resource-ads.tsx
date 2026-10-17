import * as React from "react";
import { Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { ChevronDown, ExternalLink, Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { AdNotApplicableReason, AircraftAdItem, Resource } from "@/types/api";
import { useAircraftAds, useDecideAircraftAd } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { adSubjectWords } from "@/lib/ad-number";
import { DetailPanel } from "@/components/detail-panel";
import { DocsHint } from "@/components/docs-hint";
import { ErrorState } from "@/components/states";
import { ListSearch } from "@/components/list-search";
import { ListTable, ListTableSkeleton, ListTag, type ListTableColumn, type ListTableGroup, type ListTableRow } from "@/components/list-table";
import { ResponsiveModal } from "@/components/responsive-modal";
import { AddInspectionsModal } from "@/components/maintenance/add-inspections-modal";
import { AdText } from "@/components/maintenance/ad-text";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

/**
 * AIRWORTHINESS DIRECTIVES on the aircraft page (AD library, phase 2): the published ADs that
 * name this aircraft's airframe, engine or propeller, for somebody to decide. Owners, admins and
 * technicians, on an organization whose AD mode is "Find them for me" (catalogue).
 *
 * A ListTable like the aircraft's Work orders tab: grouped by what was decided, then by the part
 * the AD names. A row opens the AD in the detail panel, its applicability and required actions
 * laid out as the Federal Register meant (utils/adBlocks.ts on the server), with one Decide
 * action. A match is a reason to read an AD, never a ruling, so nothing is decided for anyone.
 */

type State = AircraftAdItem["state"];
type Part = "airframe" | "engine" | "propeller" | "other";

const REASONS: { value: AdNotApplicableReason; label: string; hint: string }[] = [
  { value: "serial_outside", label: "Serial number outside the range", hint: "The AD names serial numbers this aircraft's is not among." },
  { value: "not_installed", label: "The affected part is not installed", hint: "A part number, kit or modification this aircraft does not have." },
  { value: "terminated", label: "Terminated by an earlier action", hint: "A terminating action was done, so nothing more is required." },
  { value: "other", label: "Other", hint: "Say why in the note." },
];
const REASON_LABEL = Object.fromEntries(REASONS.map((r) => [r.value, r.label])) as Record<AdNotApplicableReason, string>;

const STATES: { id: State; label: string; dot: string }[] = [
  { id: "to_review", label: "To review", dot: "var(--warning)" },
  { id: "applies", label: "Applies", dot: "var(--primary)" },
  { id: "not_applicable", label: "Not applicable", dot: "var(--border)" },
];
const PARTS: { id: Part; label: string }[] = [
  { id: "airframe", label: "Airframe" },
  { id: "engine", label: "Engine" },
  { id: "propeller", label: "Propeller" },
  { id: "other", label: "Tracked by hand" },
];

const COLUMNS: ListTableColumn[] = [
  { id: "names", header: "Names", width: "11rem", narrow: "fold" },
  { id: "effective", header: "Effective", width: "7rem", narrow: "fold" },
  { id: "decided", header: "Decided", width: "9rem", narrow: "hide" },
];
const NARROW_AT = 760;

const day = (iso: string | null) => (iso ? format(parseISO(iso.slice(0, 10)), "MMM d, yyyy") : null);

/** What it is about (see adSubjectWords), else the Federal Register title. */
function adHeadline(ad: AircraftAdItem["ad"], tracked: AircraftAdItem["tracked"]): string {
  if (!ad.inLibrary && tracked) return tracked.name;
  const subject = adSubjectWords(ad.subject);
  if (subject) return subject;
  return (ad.title ?? `AD ${ad.adNumber}`).replace(/^Airworthiness Directives?;\s*/i, "");
}

/** "names 172S", "in the range 172A through 172S", "names the 172 series". */
function matchWords(m: NonNullable<AircraftAdItem["match"]>): string {
  if (m.strength === "model") return `names ${m.token}`;
  if (m.strength === "range") return `in the range ${m.token.replace(/ (THROUGH|THRU|TO) /i, " through ")}`;
  return `names the ${m.token} series`;
}

const partOf = (i: AircraftAdItem): Part => i.match?.on ?? "other";

/** A search over what a person would type: the number, the maker, the subject, the models. */
function matches(i: AircraftAdItem, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [i.ad.adNumber, i.ad.title, i.ad.subject, i.ad.manufacturer, i.ad.applicability, i.tracked?.name].filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function ResourceAds({ resource, onEditAircraft }: { resource: Resource; onEditAircraft?: () => void }) {
  const q = useAircraftAds(resource.id);
  const decide = useDecideAircraftAd(resource.id);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [ruling, setRuling] = React.useState<AircraftAdItem | null>(null);
  const [tracking, setTracking] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  const data = q.data;
  const items = React.useMemo(() => (data?.items ?? []).filter((i) => matches(i, search)), [data, search]);
  const run = React.useCallback(
    async (input: Parameters<typeof decide.mutateAsync>[0], done: string) => {
      try {
        await decide.mutateAsync(input);
        toast.success(done);
        return true;
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Couldn't save that. Try again.");
        return false;
      }
    },
    [decide]
  );

  // The order rows appear in, for stepping through them from the panel.
  const ordered = React.useMemo(() => {
    return STATES.flatMap((s) => PARTS.flatMap((p) => items.filter((i) => i.state === s.id && partOf(i) === p.id)));
  }, [items]);
  const open = ordered.find((i) => i.ad.adNumber === openId) ?? null;

  const busyOn = decide.isPending ? decide.variables?.adNumber : undefined;
  const actionsFor = React.useCallback(
    (item: AircraftAdItem, compact: boolean) => (
      <DecideMenu
        item={item}
        compact={compact}
        busy={busyOn === item.ad.adNumber}
        onTrack={() => setTracking(item.ad.adNumber)}
        onApplies={() => void run({ adNumber: item.ad.adNumber, status: "applies" }, `AD ${item.ad.adNumber} marked as applying.`)}
        onNotApplicable={() => setRuling(item)}
        onUndo={() => void run({ adNumber: item.ad.adNumber, undo: true }, `AD ${item.ad.adNumber} is back to review.`)}
      />
    ),
    [busyOn, run]
  );

  const groups = React.useMemo<ListTableGroup[]>(() => {
    const row = (i: AircraftAdItem): ListTableRow => ({
      id: i.ad.adNumber,
      testId: `ad-${i.ad.adNumber}`,
      label: `AD ${i.ad.adNumber}, ${adHeadline(i.ad, i.tracked)}`,
      title: (
        <>
          <span className="font-mono text-[12px] whitespace-nowrap text-muted-foreground">AD {i.ad.adNumber}</span>{" "}
          <span>{adHeadline(i.ad, i.tracked)}</span>
        </>
      ),
      tags:
        i.tracked || i.review?.reason || !i.ad.inLibrary ? (
          <>
            {i.tracked && <ListTag dot="var(--primary)">Tracked</ListTag>}
            {i.review?.status === "not_applicable" && i.review.reason && <ListTag>{REASON_LABEL[i.review.reason]}</ListTag>}
            {!i.ad.inLibrary && <ListTag>Not in the library</ListTag>}
          </>
        ) : undefined,
      cells: {
        names: <span className="text-muted-foreground">{i.match ? matchWords(i.match) : "Not matched"}</span>,
        effective: <span className="text-muted-foreground">{day(i.ad.effectiveOn) ?? "Not known"}</span>,
        decided: (
          <span className="text-muted-foreground">
            {i.review ? `${i.review.decidedBy?.name ?? "Someone"}, ${day(i.review.decidedAt)}` : i.tracked ? "By its inspection" : "Not yet"}
          </span>
        ),
      },
      selected: openId === i.ad.adNumber,
      onOpen: () => setOpenId(i.ad.adNumber),
      actions: actionsFor(i, true),
    });
    return STATES.map((s) => {
      const inState = items.filter((i) => i.state === s.id);
      return {
        id: s.id,
        label: s.label,
        marker: <span className="size-2 rounded-full" style={{ background: s.dot }} aria-hidden />,
        count: inState.length,
        rows: [],
        subgroups: PARTS.map((p) => {
          const rows = inState.filter((i) => partOf(i) === p.id).map(row);
          return { id: `${s.id}-${p.id}`, label: p.label, count: rows.length, rows };
        }).filter((g) => g.rows.length > 0),
      };
    });
  }, [items, openId, actionsFor]);

  // Kept short: it stays put above the rows. What the list is lives in the docs hint and the
  // help article; the notes say only what is missing.
  const toolbar = (
    <div className="w-full space-y-1.5">
      <div className="flex items-center gap-2">
        <ListSearch value={search} onChange={setSearch} placeholder="Search number, maker, subject, model…" />
        <DocsHint topic="aircraft-ads" />
      </div>
      {data && <MissingNotes missing={data.missing} coverage={data.coverage} onEditAircraft={onEditAircraft} />}
    </div>
  );

  const step = (delta: -1 | 1) => {
    const at = ordered.findIndex((i) => i.ad.adNumber === openId);
    const next = ordered[at + delta];
    if (next) setOpenId(next.ad.adNumber);
  };

  return (
    // The list owns its scroll (the record page gives this tab a bounded column), so the search,
    // the column labels and the group headers stay put while the rows move.
    <div data-doc-shot="aircraft-ads" className="flex min-h-0 flex-1 flex-col pb-4">
      {q.isLoading ? (
        <ListTableSkeleton columns={COLUMNS} groups={2} rows={3} toolbar narrowAt={NARROW_AT} />
      ) : q.isError || !data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <ListTable
          label="Airworthiness Directives for this aircraft"
          fill
          className="min-h-0"
          columns={COLUMNS}
          narrowAt={NARROW_AT}
          groups={groups}
          titleHeader="AD"
          showHeader
          toolbar={toolbar}
          childNoun="AD"
          empty={
            <p className="px-4 py-6 text-[13px] text-muted-foreground">
              {search.trim() ? "No ADs match that search." : "No ADs in the library name this aircraft\u2019s make and model."}
            </p>
          }
        />
      )}

      <AdPanel item={open} onOpenChange={(o) => !o && setOpenId(null)} onStep={step} actions={open ? actionsFor(open, false) : null} />

      {ruling && (
        <NotApplicableModal
          item={ruling}
          tail={data?.aircraft.tailNumber ?? ""}
          onOpenChange={(o) => !o && setRuling(null)}
          onSave={async (reason, note) => {
            if (await run({ adNumber: ruling.ad.adNumber, status: "not_applicable", reason, note }, `AD ${ruling.ad.adNumber} marked not applicable.`)) setRuling(null);
          }}
          saving={decide.isPending}
        />
      )}

      <AddInspectionsModal
        open={!!tracking}
        onOpenChange={(o) => !o && setTracking(null)}
        fixedResource={resource}
        initialAd={tracking}
        onAdded={() => {
          // The inspection is what makes it "tracked"; the decision records who said it applies.
          if (tracking) void decide.mutateAsync({ adNumber: tracking, status: "applies" }).catch(() => undefined);
        }}
      />
    </div>
  );
}

/**
 * The one decision control, in a row and in the panel's footer: Decide (to review) with the
 * three answers, or a menu to change a decision. Row actions show on hover and always on touch.
 */
function DecideMenu({
  item,
  compact,
  busy,
  onTrack,
  onApplies,
  onNotApplicable,
  onUndo,
}: {
  item: AircraftAdItem;
  compact: boolean;
  busy: boolean;
  onTrack: () => void;
  onApplies: () => void;
  onNotApplicable: () => void;
  onUndo: () => void;
}) {
  const toReview = item.state === "to_review";
  const canChange = !!item.review || (item.state === "applies" && !item.tracked);
  if (!toReview && !canChange) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          // The list's action column is an icon wide: a worded button there runs over the title.
          <Button size="icon" variant="ghost" className="size-7" aria-label={`${toReview ? "Decide on" : "Change the decision on"} AD ${item.ad.adNumber}`} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
          </Button>
        ) : toReview ? (
          <Button className="w-full" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Decide <ChevronDown className="size-3.5" />
          </Button>
        ) : (
          <Button variant="outline" className="w-full" disabled={busy}>
            Change the decision
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(toReview || (item.state === "applies" && !item.tracked)) && <DropdownMenuItem onSelect={onTrack}>Applies: track it as an inspection</DropdownMenuItem>}
        {toReview && <DropdownMenuItem onSelect={onApplies}>Applies: nothing to track</DropdownMenuItem>}
        {(toReview || item.state === "applies") && <DropdownMenuItem onSelect={onNotApplicable}>Not applicable</DropdownMenuItem>}
        {item.review && (
          <>
            {!toReview && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={onUndo}>Back to review</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
    lines.push(
      <>
        No {parts.join(" or ")} recorded, so {parts.length > 1 ? "their" : "its"} ADs are not listed.
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
  if (missing.includes("serialNumber")) lines.push(<>No serial number recorded, which most ADs need to be ruled out.</>);
  if (!coverage.complete) lines.push(<>The AD library is still loading ({coverage.count.toLocaleString()} so far).</>);
  if (!lines.length) return null;
  // One run of short sentences: this sits above the rows and stays put, so every line it takes
  // is a row the list cannot show.
  return (
    <p className="text-[12px] text-muted-foreground">
      {lines.map((l, i) => (
        <React.Fragment key={i}>
          {i > 0 && " "}
          {l}
        </React.Fragment>
      ))}
    </p>
  );
}

/** One AD, readable: what it applies to, what it requires, and the decision. */
function AdPanel({
  item,
  onOpenChange,
  onStep,
  actions,
}: {
  item: AircraftAdItem | null;
  onOpenChange: (open: boolean) => void;
  onStep: (d: -1 | 1) => void;
  actions: React.ReactNode;
}) {
  const ad = item?.ad;
  const highlight = item?.match && item.match.strength !== "range" ? item.match.token : null;
  return (
    <DetailPanel
      open={!!item}
      onOpenChange={onOpenChange}
      onStep={onStep}
      title={ad ? `AD ${ad.adNumber}` : "AD"}
      description={item && ad ? adHeadline(ad, item.tracked) : undefined}
      badge={item?.match ? <ListTag>{`${item.match.on.charAt(0).toUpperCase()}${item.match.on.slice(1)}: ${matchWords(item.match)}`}</ListTag> : undefined}
      footer={actions ?? undefined}
    >
      {item && ad && (
        <div className="space-y-5 pt-4" data-doc-shot="aircraft-ad-panel">
          <Decision item={item} />
          <p className="text-[12px] text-muted-foreground">
            {[ad.manufacturer, ad.effectiveOn && `Effective ${day(ad.effectiveOn)}`, ad.supersedes.length > 0 && `Supersedes AD ${ad.supersedes.join(", AD ")}`]
              .filter(Boolean)
              .join(". ")}
          </p>
          {!ad.inLibrary ? (
            <p className="text-[13px] text-muted-foreground">This AD is tracked here but is not in the AD library, which holds ADs published since 1995.</p>
          ) : (
            <>
              <section className="space-y-2">
                <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Applies to</h3>
                {ad.details?.applicability.length ? (
                  <AdText blocks={ad.details.applicability} highlight={highlight} />
                ) : ad.applicability ? (
                  <p className="text-[13px] leading-relaxed">{ad.applicability}</p>
                ) : (
                  <p className="text-[13px] text-muted-foreground">The Federal Register printed this AD without its text. Read it at the link below.</p>
                )}
              </section>
              {ad.summary && (
                <section className="space-y-2">
                  <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">In short</h3>
                  <p className="text-[13px] leading-relaxed">{ad.summary}</p>
                </section>
              )}
              {ad.details && ad.details.actions.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">What it requires</h3>
                  {ad.details.actions.map((s, i) => (
                    <div key={i} className="space-y-1.5">
                      <p className="text-[13px] font-medium">{s.heading}</p>
                      <AdText blocks={s.blocks} />
                    </div>
                  ))}
                </section>
              )}
              {ad.url && (
                <a href={ad.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] underline underline-offset-2">
                  Read the full AD in the Federal Register <ExternalLink className="size-3" />
                </a>
              )}
            </>
          )}
        </div>
      )}
    </DetailPanel>
  );
}

/** Who decided what: the line an IA reads. */
function Decision({ item }: { item: AircraftAdItem }) {
  const { review, tracked } = item;
  if (!review && !tracked) return null;
  const who = review?.decidedBy?.name ?? null;
  const when = review ? day(review.decidedAt) : null;
  const by = [who && `by ${who}`, when && `on ${when}`].filter(Boolean).join(" ");
  return (
    <p className="text-[13px]">
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
              <Link to="/maintenance/inspections/$inspectionId" params={{ inspectionId: String(tracked.reminderId) }} className="underline underline-offset-2">
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
