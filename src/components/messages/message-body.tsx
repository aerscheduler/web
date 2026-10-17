import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Hammer, PlaneTakeoff, CalendarDays, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageRef, MessageRefType } from "@/types/messages";

/** The token grammar the server stores: {p:12} {r:3} {v:88} {w:7} {s:9}. */
export const TOKEN_RE = /\{([prvws]):(\d{1,10})\}/g;

export const REF_LETTER: Record<MessageRefType, string> = {
  person: "p",
  resource: "r",
  reservation: "v",
  workOrder: "w",
  squawk: "s",
};

const ICON: Partial<Record<MessageRefType, LucideIcon>> = {
  resource: PlaneTakeoff,
  reservation: CalendarDays,
  workOrder: Hammer,
  squawk: Wrench,
};

/** Where a mention opens. The same destinations the command menu's search hits open. */
export function refLink(ref: MessageRef): { to: string; params: Record<string, string> } | null {
  if (ref.hidden) return null;
  const id = String(ref.id);
  switch (ref.type) {
    case "person":
      return { to: "/people/$orgUserId", params: { orgUserId: id } };
    case "resource":
      return { to: "/aircraft/$resourceId", params: { resourceId: id } };
    case "reservation":
      return { to: "/schedule/reservations/$reservationId", params: { reservationId: id } };
    case "workOrder":
      return { to: "/maintenance/work-orders/$workOrderId", params: { workOrderId: id } };
    case "squawk":
      return { to: "/maintenance/squawks/$squawkId", params: { squawkId: id } };
  }
}

/**
 * A message's text with its mentions drawn as chips. A mention the reader may not open (the
 * server marks it `hidden`) is its generic label as plain text, never a link.
 *
 * `mine` flips the chip to sit on the blue bubble.
 */
export function MessageBody({ body, refs, mine }: { body: string; refs: Record<string, MessageRef>; mine: boolean }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of body.matchAll(TOKEN_RE)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(body.slice(last, at));
    const ref = refs[`${m[1]}:${m[2]}`];
    parts.push(<MentionChip key={`${at}-${m[0]}`} refValue={ref} mine={mine} />);
    last = at + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return <span className="whitespace-pre-wrap break-words">{parts}</span>;
}

function MentionChip({ refValue, mine }: { refValue: MessageRef | undefined; mine: boolean }) {
  if (!refValue) return <span>a record</span>;
  const link = refLink(refValue);
  const Icon = ICON[refValue.type];
  const label = refValue.type === "person" && !refValue.hidden ? `@${refValue.label}` : refValue.label;
  if (!link) return <span className={cn(!mine && "text-muted-foreground")}>{label}</span>;
  return (
    <Link
      to={link.to as never}
      params={link.params as never}
      className={cn(
        "mx-px inline-flex max-w-full items-center gap-1 rounded-md px-1.5 align-baseline font-semibold leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring",
        mine
          ? "bg-white/20 text-primary-foreground hover:bg-white/30"
          : "bg-background text-primary ring-1 ring-border hover:ring-primary/40"
      )}
    >
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
      <span className="truncate">{label}</span>
    </Link>
  );
}

/** The body as plain words, for an edit box or a preview. */
export function bodyAsText(body: string, refs: Record<string, MessageRef>): string {
  return body.replace(TOKEN_RE, (_m, t: string, id: string) => {
    const ref = refs[`${t}:${id}`];
    if (!ref) return "a record";
    return ref.type === "person" && !ref.hidden ? `@${ref.label}` : ref.label;
  });
}
