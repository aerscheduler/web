import { format, parseISO } from "date-fns";
import { Bot, Monitor, Smartphone, Terminal } from "lucide-react";
import type { AuditEvent } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { DetailPanel } from "@/components/detail-panel";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * One audit event, in full.
 *
 * The table can only show a line per row, and an audit row's most useful content is the
 * part that does not fit: the field-by-field diff. "Roles changed" in a list is a prompt to
 * ask a question; "admin: off → on" is the answer, and until now there was nowhere in the
 * console it could be read.
 *
 * Docked beside the table rather than over it (see `DetailPanel`), which matters more here
 * than on most surfaces: reading an audit trail is a scanning task, and the row you are
 * comparing against needs to stay on screen.
 */

function fmt(iso: string | null | undefined) {
  return iso ? format(parseISO(iso), "EEEE, MMMM d, yyyy 'at' h:mm:ss a") : null;
}

function personName(
  ou: { user?: { name?: string | null; email?: string | null } | null } | null | undefined
): string | null {
  return ou?.user?.name ?? ou?.user?.email ?? null;
}

/** Which surface the change came through, as an icon and a word. */
const SOURCES: Record<string, { label: string; icon: typeof Monitor }> = {
  web: { label: "Web console", icon: Monitor },
  ios: { label: "Mobile app", icon: Smartphone },
  api: { label: "Public API", icon: Terminal },
  system: { label: "Automatic", icon: Bot },
};

/**
 * The diff fields that hold an hour figure in TENTHS.
 *
 * Every hour column in this schema is an integer in tenths — 92310 means 9231.0 — and the
 * stored diff keeps the raw value, correctly: it is structured data, and dividing it before
 * storage would make the log disagree with the column it came from. So the conversion
 * belongs here, in the one place a person reads it. Without this the panel showed
 * "Hobbs 92310 → 92500" beside a summary that said "9231.0 → 9250.0" — the same event
 * disagreeing with itself by a factor of ten, two inches apart.
 */
const TENTHS_FIELDS = new Set(["hobbs", "tach", "hobbsTimeIn", "hobbsTimeOut", "tachTimeIn", "tachTimeOut"]);

/**
 * One changed value, rendered.
 *
 * `changes` is free-form JSON by design — it holds only the fields that moved — so this has
 * to cope with whatever a domain helper put there rather than with a fixed shape. Arrays
 * are the common non-scalar (a role set, a crew list) and read best as a list.
 */
function renderValue(v: unknown, field?: string): React.ReactNode {
  if (v == null || v === "") return <span className="text-muted-foreground">—</span>;
  if (typeof v === "boolean") return v ? "on" : "off";
  if (Array.isArray(v)) {
    return v.length ? v.join(", ") : <span className="text-muted-foreground">none</span>;
  }
  if (typeof v === "object") return JSON.stringify(v);

  if (field && TENTHS_FIELDS.has(field) && typeof v === "number") {
    return (v / 10).toFixed(1);
  }

  //An ISO instant stored in a diff should read as a time, not as a machine string. Matched
  //rather than parsed loosely so a tail number or a plain word is never mangled.
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(s)) {
    return format(parseISO(s), "MMM d, yyyy h:mm a");
  }
  return s;
}

/** "hobbsTime" → "Hobbs time", so a raw column name reads as a label. */
function fieldLabel(key: string): string {
  return key
    .replace(/^FK_/, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

type Change = { from?: unknown; to?: unknown };

function changeEntries(changes: unknown): [string, Change][] {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return [];
  return Object.entries(changes as Record<string, unknown>).filter(
    (e): e is [string, Change] => !!e[1] && typeof e[1] === "object" && !Array.isArray(e[1])
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function AuditDetailSheet({
  event,
  open,
  onOpenChange,
  onStep,
  actionLabel,
  entityLabel,
  isDestructive,
}: {
  event: AuditEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ↑/↓ to the previous/next event on screen while the panel is docked. */
  onStep?: (delta: -1 | 1) => void;
  //Passed in rather than re-derived: the page owns the display vocabulary, and two copies
  //of it would drift the moment an action was renamed in one and not the other.
  actionLabel: (action: string) => string;
  entityLabel: (entityType: string) => string;
  isDestructive: (action: string) => boolean;
}) {
  const changes = changeEntries(event?.changes);
  const source = event?.source ? SOURCES[event.source] : undefined;
  const SourceIcon = source?.icon;

  //A null actor is an automated event, not a missing one — a cron sweep, a Stripe webhook,
  //the invoice a close-out raises. Saying "AerScheduler" is the truthful reading.
  const actor = event ? (personName(event.actor) ?? "AerScheduler") : null;
  const subject = event ? personName(event.subject) : null;
  const resource = event?.resource ? resourceLabel(event.resource).name : null;

  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      onStep={onStep}
      title={
        <span className={cn(event && isDestructive(event.action) && "text-destructive")}>
          {event ? actionLabel(event.action) : "Event"}
        </span>
      }
      description={event ? fmt(event.createdAt) ?? undefined : undefined}
      badge={
        event ? (
          <Badge variant="secondary" className="whitespace-nowrap">
            {entityLabel(event.entityType)}
          </Badge>
        ) : null
      }
    >
      {!event ? null : (
        <div className="space-y-5">
          {/* The stored sentence. Shown even when it repeats the title — in the table that
              repetition is noise beside the title, but here it is the event's own words and
              the only place an API consumer's view of the row is visible. */}
          {event.summary && <p className="text-sm">{event.summary}</p>}

          <Separator />

          <dl className="space-y-2">
            <Row label="When">
              <span className="tabular-nums">{fmt(event.createdAt)}</span>
            </Row>
            <Row label="Who">{actor}</Row>
            {subject && <Row label="About">{subject}</Row>}
            {resource && <Row label="Aircraft">{resource}</Row>}
            <Row label="Via">
              {source ? (
                <span className="inline-flex items-center gap-1.5">
                  {SourceIcon && <SourceIcon className="size-3.5 text-muted-foreground" />}
                  {source.label}
                </span>
              ) : (
                <span className="text-muted-foreground">Unknown</span>
              )}
            </Row>
            {/* The record this points at. Deliberately shown as type + id rather than as a
                link: an audit event outlives the row it describes, so a link here would be
                dead exactly when the entry matters most — the cancelled booking, the
                deleted document. */}
            <Row label="Record">
              <span className="text-muted-foreground">
                {entityLabel(event.entityType)} #{event.entityId}
              </span>
            </Row>
          </dl>

          {changes.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="text-sm font-medium">What changed</h3>
                <div className="space-y-2">
                  {changes.map(([key, c]) => (
                    <div key={key} className="rounded-md border border-border px-3 py-2 text-sm">
                      <div className="text-xs text-muted-foreground">{fieldLabel(key)}</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground line-through">
                          {renderValue(c.from, key)}
                        </span>
                        <span aria-hidden className="text-muted-foreground">
                          →
                        </span>
                        <span className="font-medium">{renderValue(c.to, key)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </DetailPanel>
  );
}
