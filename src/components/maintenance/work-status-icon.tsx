import { cn } from "@/lib/utils";

/**
 * The status rings the job page and the job board draw before a row, in the Linear manner: a
 * shape says where something stands before any word does. Colour only where it means something:
 * done is green, waiting on somebody is amber, approved is the accent, the rest stay grey.
 */
export type WorkStatus = "done" | "todo" | "approved" | "progress" | "deferred" | "declined" | "notAsked" | "waiting";

export function WorkStatusIcon({ status, className }: { status: WorkStatus; className?: string }) {
  const cls = cn("size-[15px] shrink-0", className);
  switch (status) {
    case "done":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden>
          <circle cx="8" cy="8" r="7" fill="var(--success)" />
          <path d="m5 8.2 2 2 4-4.2" fill="none" stroke="var(--card)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "approved":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--primary)" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="2.4" fill="var(--primary)" />
        </svg>
      );
    case "progress":
    case "waiting":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke={status === "waiting" ? "var(--destructive)" : "var(--warning)"} strokeWidth="1.5" />
          <path d="M8 3.6a4.4 4.4 0 0 1 0 8.8z" fill={status === "waiting" ? "var(--destructive)" : "var(--warning)"} />
        </svg>
      );
    case "deferred":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" />
          <path d="M6.5 5.6v4.8M9.5 5.6v4.8" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "declined":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" />
          <path d="m5.8 5.8 4.4 4.4m0-4.4-4.4 4.4" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "notAsked":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeDasharray="2.4 2.2" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" />
        </svg>
      );
  }
}
