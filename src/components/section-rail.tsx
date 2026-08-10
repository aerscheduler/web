import type { LucideIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type RailItem = {
  /** Stable value, this is what lands in the URL (`?tab=`, `?view=`). */
  value: string;
  label: string;
  icon?: LucideIcon;
};

/** A run of items under an optional heading. Omit `label` for an ungrouped run. */
export type RailSection = { label?: string; items: RailItem[] };

/**
 * The row a rail and its pane share. Column on a phone (the rail collapses to a
 * select, so it costs one control), side by side from lg.
 */
export const RAIL_ROW = "flex min-h-0 min-w-0 flex-1 flex-col gap-5 lg:flex-row";

/**
 * The left rail Reports and Settings established: a list of what exists down the
 * side, one pane rendering whichever is selected.
 *
 * It replaces tabs on any page whose sections are genuinely separate screens
 * rather than filtered views of one list. Tabs are a horizontal budget, five of
 * them is already a squeeze at 1024px and there is nowhere to put a heading, so
 * a page that grows a sixth section either truncates its labels or invents a
 * second row of navigation. The rail grows downward and groups for free.
 *
 * Below lg it becomes a single select instead: a two-level list down the side of
 * a 375px screen is unusable, and a select says the same thing in one row.
 *
 * `onChange` may return a promise (Reports confirms before abandoning unsaved
 * dashboard edits); nothing here waits on it.
 *
 * Usage:
 *
 *   <div className={RAIL_ROW}>
 *     <SectionRail label="Maintenance" sections={SECTIONS} value={view} onChange={setView} />
 *     <div className="flex min-h-0 min-w-0 flex-1 flex-col">…the selected section…</div>
 *   </div>
 */
export function SectionRail({
  sections,
  value,
  onChange,
  label,
  placeholder = "Choose a section",
  className,
  docShot,
}: {
  sections: RailSection[];
  value: string;
  onChange: (value: string) => void | Promise<void>;
  /** Names the nav for screen readers, the page's own name ("Settings"). */
  label: string;
  placeholder?: string;
  className?: string;
  /**
   * Crop target for the help documentation's screenshots, landing on the desktop
   * rail. The page passes it rather than this component writing one: six pages
   * share this rail, so a literal attribute here would make all six answer to a
   * single id. Inert, nothing styles or queries it.
   */
  docShot?: string;
}) {
  const pick = (next: string) => {
    void onChange(next);
  };

  return (
    <>
      <div className={cn("shrink-0 lg:hidden", className)}>
        <Select value={value} onValueChange={pick}>
          <SelectTrigger>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {sections.map((section, i) => (
              <SelectGroupForSection key={section.label ?? i} section={section} />
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bounded by the page rather than by a guess at the chrome above it: it
          scrolls on its own only when there are more sections than fit. */}
      <nav
        aria-label={label}
        data-doc-shot={docShot}
        className={cn("hidden w-60 shrink-0 overflow-y-auto lg:block", className)}
      >
        <div className="space-y-4 pr-3">
          {sections.map((section, i) => (
            <div key={section.label ?? i}>
              {section.label && (
                <h2 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.label}
                </h2>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const selected = item.value === value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => pick(item.value)}
                      aria-current={selected ? "page" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        selected
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      {Icon && <Icon className="size-4 shrink-0" />}
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}

/** Radix Select has no nested grouping helper here, so render a label + items. */
function SelectGroupForSection({ section }: { section: RailSection }) {
  if (section.items.length === 0) return null;
  return (
    <>
      {section.label && (
        <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {section.label}
        </div>
      )}
      {section.items.map((item) => (
        <SelectItem key={item.value} value={item.value}>
          {item.label}
        </SelectItem>
      ))}
    </>
  );
}
