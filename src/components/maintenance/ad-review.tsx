import * as React from "react";
import { Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { ChevronDown, ExternalLink, Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { AdDetails, AdNotApplicableReason, AircraftAdItem, Resource } from "@/types/api";
import { useDecideAd } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { adSubjectWords } from "@/lib/ad-number";
import { ResponsiveModal } from "@/components/responsive-modal";
import { AddInspectionsModal } from "@/components/maintenance/add-inspections-modal";
import { AdText } from "@/components/maintenance/ad-text";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

/**
 * Reviewing an AD against an aircraft, shared by the aircraft's ADs tab and Maintenance > Fleet
 * ADs: the reading pane, the decision line, the Decide menu, the Not applicable dialog, and the
 * hook that saves a decision. One implementation, so the two places can never decide an AD two
 * different ways.
 */

export type AdState = AircraftAdItem["state"];

export const AD_STATES: { id: AdState; label: string; dot: string }[] = [
  { id: "to_review", label: "To review", dot: "var(--warning)" },
  { id: "applies", label: "Applies", dot: "var(--primary)" },
  { id: "not_applicable", label: "Not applicable", dot: "var(--border)" },
];

const REASONS: { value: AdNotApplicableReason; label: string; hint: string }[] = [
  { value: "serial_outside", label: "Serial number outside the range", hint: "The AD names serial numbers this aircraft's is not among." },
  { value: "not_installed", label: "The affected part is not installed", hint: "A part number, kit or modification this aircraft does not have." },
  { value: "terminated", label: "Terminated by an earlier action", hint: "A terminating action was done, so nothing more is required." },
  { value: "other", label: "Other", hint: "Say why in the note." },
];
export const AD_REASON_LABEL = Object.fromEntries(REASONS.map((r) => [r.value, r.label])) as Record<AdNotApplicableReason, string>;

export const adDay = (iso: string | null | undefined) => (iso ? format(parseISO(iso.slice(0, 10)), "MMM d, yyyy") : null);

/** What it is about (see adSubjectWords), else the Federal Register title. */
export function adHeadline(ad: { adNumber: string; subject: string | null; title: string | null; inLibrary?: boolean }, tracked?: { name: string } | null): string {
  // A name typed by hand often starts with the number the row already shows.
  if (ad.inLibrary === false && tracked) return tracked.name.replace(new RegExp(`^AD\\s*${ad.adNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[-:,]?\\s*`, "i"), "") || tracked.name;
  const subject = adSubjectWords(ad.subject);
  if (subject) return subject;
  return (ad.title ?? `AD ${ad.adNumber}`).replace(/^Airworthiness Directives?;\s*/i, "");
}

/** "names 172S", "in the range 172A through 172S", "names the 172 series". */
export function matchWords(m: NonNullable<AircraftAdItem["match"]>): string {
  if (m.strength === "model") return `names ${m.token}`;
  if (m.strength === "range") return `in the range ${m.token.replace(/ (THROUGH|THRU|TO) /i, " through ")}`;
  return `names the ${m.token} series`;
}

/** "Engine: names the IO-360 series". */
export const matchLabel = (m: NonNullable<AircraftAdItem["match"]>) => `${m.on.charAt(0).toUpperCase()}${m.on.slice(1)}: ${matchWords(m)}`;

const sectionHeading = "text-[11px] font-medium tracking-wide text-muted-foreground uppercase";

/**
 * An AD, readable: who made it and when, what it applies to, the summary, what it requires, and
 * the link to the full text. `highlight` marks what matched an aircraft ("172S").
 */
export function AdReading({
  ad,
  highlight,
}: {
  ad: {
    manufacturer: string | null;
    effectiveOn: string | null;
    supersedes: string[];
    supersededBy?: string[];
    inLibrary?: boolean;
    details?: AdDetails | null;
    applicability: string | null;
    summary: string | null;
    url: string | null;
  };
  highlight?: string | null;
}) {
  return (
    <>
      <p className="text-[12px] text-muted-foreground">
        {[
          ad.manufacturer,
          ad.effectiveOn && `Effective ${adDay(ad.effectiveOn)}`,
          ad.supersedes.length > 0 && `Supersedes AD ${ad.supersedes.join(", AD ")}`,
          ad.supersededBy?.length && `Superseded by AD ${ad.supersededBy.join(", AD ")}`,
        ]
          .filter(Boolean)
          .map((part) => String(part).replace(/\.$/, ""))
          .join(". ")}
      </p>
      {ad.inLibrary === false ? (
        <p className="text-[13px] text-muted-foreground">This AD is tracked here but is not in the AD library, which holds ADs published since 1995.</p>
      ) : (
        <>
          <section className="space-y-2">
            <h3 className={sectionHeading}>Applies to</h3>
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
              <h3 className={sectionHeading}>In short</h3>
              <p className="text-[13px] leading-relaxed">{ad.summary}</p>
            </section>
          )}
          {ad.details && ad.details.actions.length > 0 && (
            <section className="space-y-3">
              <h3 className={sectionHeading}>What it requires</h3>
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
    </>
  );
}

export const AD_SECTION_HEADING = sectionHeading;

/** Who decided what: the line an IA reads. */
export function AdDecision({ item }: { item: AircraftAdItem }) {
  const { review, tracked } = item;
  if (!review && !tracked) return null;
  const who = review?.decidedBy?.name ?? null;
  const when = review ? adDay(review.decidedAt) : null;
  const by = [who && `by ${who}`, when && `on ${when}`].filter(Boolean).join(" ");
  return (
    <p className="text-[13px]">
      {review?.status === "not_applicable" ? (
        <>
          Not applicable{review.reason ? `: ${AD_REASON_LABEL[review.reason].toLowerCase()}` : ""}
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

/**
 * The one decision control, in a row (`compact`: an icon, the list's action column is an icon
 * wide) and in a panel's footer: Decide with the three answers, or a menu to change a decision.
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

type Target = { resourceId: number; tail: string };

/**
 * Deciding ADs: `menu(item, target, compact)` is the Decide control for one AD on one aircraft,
 * and `dialogs` holds the Not applicable dialog and the Add inspections modal it opens. Render
 * `dialogs` once. `resourceFor` finds the aircraft Add inspections tracks the AD on.
 */
export function useAdDecider(resourceFor: (resourceId: number) => Resource | undefined) {
  const decide = useDecideAd();
  const [ruling, setRuling] = React.useState<{ item: AircraftAdItem; target: Target } | null>(null);
  const [tracking, setTracking] = React.useState<{ adNumber: string; resourceId: number } | null>(null);

  const run = React.useCallback(
    async (input: Parameters<typeof decide.mutateAsync>[0], done: string, undo?: string) => {
      try {
        await decide.mutateAsync(input);
        // A decision is one click from the menu, so it is one click back: Undo returns the AD to
        // review, the same as Back to review.
        const back = { resourceId: input.resourceId, adNumber: input.adNumber, undo: true as const };
        toast.success(done, undo ? { action: { label: "Undo", onClick: () => void run(back, undo) } } : undefined);
        return true;
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Couldn't save that. Try again.");
        return false;
      }
    },
    [decide]
  );

  const busyKey = decide.isPending && decide.variables ? `${decide.variables.resourceId}:${decide.variables.adNumber}` : null;

  const menu = React.useCallback(
    (item: AircraftAdItem, target: Target, compact: boolean) => {
      const n = item.ad.adNumber;
      const on = target.tail ? ` on ${target.tail}` : "";
      return (
        <DecideMenu
          item={item}
          compact={compact}
          busy={busyKey === `${target.resourceId}:${n}`}
          onTrack={() => setTracking({ adNumber: n, resourceId: target.resourceId })}
          onApplies={() => void run({ resourceId: target.resourceId, adNumber: n, status: "applies" }, `AD ${n} marked as applying${on}.`, `AD ${n} is back to review${on}.`)}
          onNotApplicable={() => setRuling({ item, target })}
          onUndo={() => void run({ resourceId: target.resourceId, adNumber: n, undo: true }, `AD ${n} is back to review${on}.`)}
        />
      );
    },
    [busyKey, run]
  );

  const trackingResource = tracking ? resourceFor(tracking.resourceId) : undefined;
  const dialogs = (
    <>
      {ruling && (
        <NotApplicableModal
          item={ruling.item}
          tail={ruling.target.tail}
          onOpenChange={(o) => !o && setRuling(null)}
          onSave={async (reason, note) => {
            const n = ruling.item.ad.adNumber;
            const on = ruling.target.tail ? ` on ${ruling.target.tail}` : "";
            if (await run({ resourceId: ruling.target.resourceId, adNumber: n, status: "not_applicable", reason, note }, `AD ${n} marked not applicable${on}.`, `AD ${n} is back to review${on}.`)) setRuling(null);
          }}
          saving={decide.isPending}
        />
      )}
      {trackingResource && (
        <AddInspectionsModal
          open={!!tracking}
          onOpenChange={(o) => !o && setTracking(null)}
          fixedResource={trackingResource}
          initialAd={tracking?.adNumber ?? null}
          onAdded={() => {
            // The inspection is what makes it "tracked"; the decision records who said it applies.
            if (tracking) void decide.mutateAsync({ resourceId: tracking.resourceId, adNumber: tracking.adNumber, status: "applies" }).catch(() => undefined);
          }}
        />
      )}
    </>
  );

  return { menu, dialogs };
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
      description={`Say why it does not apply to ${tail || "this aircraft"}. This is kept with who decided and when.`}
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
