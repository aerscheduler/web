import { ExternalLink, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DOCS_TOPICS, docsUrl, type DocsTopicKey } from "@/lib/docs-links";
import { cn } from "@/lib/utils";

/**
 * The small info button that sits beside a label and explains it.
 *
 * A popover on click rather than a tooltip on hover, because the front desk
 * runs this on an iPad and a hover tooltip is unreachable with a finger. Click
 * also means the content can hold a real link, which a tooltip cannot: the
 * pointer has nowhere to travel to without the tooltip closing underneath it.
 *
 * Copy lives in `lib/docs-links.ts`, never inline here, so all of it can be
 * reviewed as a set and the website build can verify every link still resolves.
 */
export function DocsHint({
  topic,
  className,
  side = "top",
  align = "center",
}: {
  topic: DocsTopicKey;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}) {
  const entry = DOCS_TOPICS[topic] as
    | { title: string; summary: string; href: string; linkLabel?: string }
    | undefined;

  // A key that no longer exists renders nothing rather than an empty bubble.
  // The website's docs check is what catches it; this only stops a broken
  // registry from putting a dead control on screen in the meantime.
  if (!entry) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`About ${entry.title}`}
          className={cn(
            "inline-flex size-4 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className
          )}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-72 p-3">
        <p className="text-sm font-medium text-foreground">{entry.title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{entry.summary}</p>
        <a
          href={docsUrl(entry.href)}
          target="_blank"
          rel="noreferrer"
          className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
        >
          {entry.linkLabel ?? "Read the guide"}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The same link without the icon, for the foot of a page or an empty state.
 *
 * Empty states are where somebody is most likely to be stuck, and an empty
 * table that says only "No courses yet" tells them nothing about what a course
 * is or why they would want one.
 */
export function DocsLink({
  topic,
  className,
  children,
}: {
  topic: DocsTopicKey;
  className?: string;
  children?: React.ReactNode;
}) {
  const entry = DOCS_TOPICS[topic] as
    | { title: string; summary: string; href: string; linkLabel?: string }
    | undefined;
  if (!entry) return null;

  return (
    <a
      href={docsUrl(entry.href)}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline",
        className
      )}
    >
      {children ?? entry.linkLabel ?? `How ${entry.title.toLowerCase()} works`}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}
