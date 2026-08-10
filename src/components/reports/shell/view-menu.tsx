/**
 * Everything that shapes the table, behind one Filters button.
 *
 * Grouping, columns and filters used to be three separate controls spread over
 * three rows of chrome. They are one nested menu here (the same shape as the
 * filter menu on every other list in the console (`components/list-filters.tsx`))
 * so the report toolbar is a single row: the window on the left, what you are
 * asking of it on the right.
 *
 * A filter is edited where it is listed rather than added and then filled in, so
 * there is no half-built row sitting in the page. That means ONE filter per
 * field: "hours over 1 and under 5" is the `between` operator, not two filters.
 * A saved view that predates this still runs: extra filters on the same field
 * are kept and shown as chips; the menu just edits the first.
 *
 * Every submenu is a fixed three-part box (search on top, the choices scrolling
 * in the middle, the condition and Clear pinned to the bottom). A school with 300
 * customers otherwise gets a list it has to page through with the mouse, and a
 * condition it only finds by scrolling past every name to reach it.
 *
 * Active filters show as dismissible chips under the toolbar, because a filter
 * you cannot see is a filter you forget you set.
 */

import { type ReactNode } from "react";
import { Group, ListFilter, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatReportValue } from "@/lib/report-format";
import {
  SubmenuSearchBox,
  optionMatches,
  stopMenuTypeahead,
  useSubmenuSearch,
  type SubmenuSearch,
} from "@/components/submenu-search";
import type {
  ReportColumn,
  ReportConfig,
  ReportFilterDef,
  ReportFilterInput,
  ReportFilterOperator,
  ReportMeta,
} from "@/types/reports";
import { OPERATOR_LABELS, fromWire, isCompleteFilter, toWire, unitHint } from "./filter-builder";

/** The sentinel for "no grouping", a radio item cannot have an empty value. */
const NO_GROUP = "__none__";

const NO_VALUE: ReportFilterOperator[] = ["isNull", "isNotNull"];
const MULTI_VALUE: ReportFilterOperator[] = ["in", "notIn"];

/** Short forms for the chip and the submenu trigger, where the row is the field. */
const OPERATOR_SHORT: Partial<Record<ReportFilterOperator, string>> = {
  ne: "not",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  contains: "contains",
  startsWith: "starts with",
  notIn: "not",
};

/**
 * A submenu laid out as a box rather than a list: whatever is put after the
 * scrolling middle stays on screen no matter how long the choices are.
 */
function SubmenuBox({
  children,
  className,
  contentRef,
  onKeyDown,
  docShot,
}: {
  children: ReactNode;
  className?: string;
  /** From `useSubmenuSearch`: lets the search box find the option rows to move focus to. */
  contentRef?: React.RefObject<HTMLDivElement | null>;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  /** Crop target for the help documentation's screenshots. Inert. */
  docShot?: string;
}) {
  return (
    <DropdownMenuSubContent
      ref={contentRef}
      onKeyDown={onKeyDown}
      data-doc-shot={docShot}
      className={"flex max-h-[24rem] w-64 flex-col p-0 " + (className ?? "")}
    >
      {children}
    </DropdownMenuSubContent>
  );
}

/** The part that scrolls. Everything outside it is pinned. */
function SubmenuList({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto p-1">{children}</div>;
}

function operatorOf(def: ReportFilterDef, filter: ReportFilterInput | undefined) {
  return filter?.operator ?? def.operators[0];
}

/** Replace, append or drop the one filter on this field. */
function upsert(
  filters: ReportFilterInput[],
  key: string,
  next: ReportFilterInput | null
): ReportFilterInput[] {
  const at = filters.findIndex((f) => f.key === key);
  if (!next) return filters.filter((f) => f.key !== key);
  if (at === -1) return [...filters, next];
  return filters.map((f, i) => (i === at ? next : f));
}

/** What this filter is doing, in as few words as fit beside its field name. */
export function summarizeFilter(
  def: ReportFilterDef,
  filter: ReportFilterInput | undefined
): string | null {
  if (!filter || !isCompleteFilter(filter)) return null;
  if (NO_VALUE.includes(filter.operator)) return OPERATOR_LABELS[filter.operator];

  const prefix = OPERATOR_SHORT[filter.operator];
  const label = (v: unknown) =>
    def.options?.find((o) => o.value === String(v))?.label ?? formatReportValue(v, def.type);

  if (Array.isArray(filter.value)) {
    const values = filter.value.filter((v) => v != null && v !== "");
    if (filter.operator === "between") {
      return values.map((v) => formatReportValue(v, def.type)).join(", ");
    }
    // One choice is worth naming; two aircraft descriptions are not, they only
    // truncate, and "2 selected" is the part you can actually read.
    const text = values.length === 1 ? label(values[0]) : `${values.length} selected`;
    return prefix ? `${prefix} ${text}` : text;
  }

  return prefix ? `${prefix} ${label(filter.value)}` : label(filter.value);
}

/**
 * The choices themselves, always searchable.
 *
 * There used to be a `>= 8 options` threshold, which meant the box appeared on Aircraft at
 * one school and not at another, and never on short lists like Type or Status. A control that
 * comes and goes with the size of somebody's fleet is one you can't build a habit on, so every
 * field gets it.
 */
function OptionList({
  options,
  multi,
  selected,
  onToggle,
  onPick,
  searchPlaceholder,
  search,
}: {
  options: { value: string; label: string }[];
  multi: boolean;
  selected: Set<string>;
  /** Multi-select: one option went on or off. */
  onToggle: (value: string, checked: boolean) => void;
  /** Single-select: this is now the value. */
  onPick: (value: string) => void;
  searchPlaceholder: string;
  /** Owned by the parent submenu, which wires the trigger and content handlers. */
  search: SubmenuSearch;
}) {
  const shown = options.filter((o) => optionMatches(o, search.query));

  return (
    <>
      <SubmenuSearchBox search={search} placeholder={searchPlaceholder} />
      <SubmenuList>
        {options.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">Nothing to choose from yet.</p>
        ) : shown.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No matches.</p>
        ) : multi ? (
          shown.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={selected.has(option.value)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(checked) => onToggle(option.value, checked === true)}
            >
              <span className="truncate">{option.label}</span>
            </DropdownMenuCheckboxItem>
          ))
        ) : (
          <DropdownMenuRadioGroup
            value={[...selected][0] ?? ""}
            onValueChange={(v) => onPick(v)}
          >
            {shown.map((option) => (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                onSelect={(e) => e.preventDefault()}
              >
                <span className="truncate">{option.label}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}
      </SubmenuList>
    </>
  );
}

/** What to prompt with in an empty box, in the units the field is typed in. */
function valuePlaceholder(def: ReportFilterDef): string {
  if (def.type === "money") return "0.00";
  if (def.type === "hours") return "0.0";
  if (def.type === "percent" || def.type === "number") return "0";
  return def.label;
}

/**
 * The choices for one field: a value editor for the operator in force, then the
 * operator itself when the field offers more than one.
 */
function FilterSubmenu({
  def,
  filter,
  onChange,
}: {
  def: ReportFilterDef;
  filter: ReportFilterInput | undefined;
  onChange: (next: ReportFilterInput | null) => void;
}) {
  const operator = operatorOf(def, filter);
  const summary = summarizeFilter(def, filter);
  const hint = unitHint(def.type);
  const isMulti = MULTI_VALUE.includes(operator);
  const takesValue = !NO_VALUE.includes(operator);

  const selected = new Set(
    (Array.isArray(filter?.value)
      ? filter!.value
      : filter?.value != null
        ? [filter.value]
        : []
    ).map(String)
  );

  const put = (value: unknown) => onChange({ key: def.key, operator, value });

  // Shared with the list-page filter menu, see `submenu-search.tsx` for the four separate
  // things Radix breaks about putting a text box inside a menu.
  const search = useSubmenuSearch();

  return (
    <DropdownMenuSub onOpenChange={search.setOpen}>
      <DropdownMenuSubTrigger onKeyDown={search.captureTyping}>
        <span className="flex-1 truncate">{def.label}</span>
        <span className="ml-2 max-w-28 truncate text-xs text-muted-foreground">
          {summary ?? "Any"}
        </span>
      </DropdownMenuSubTrigger>

      <SubmenuBox contentRef={search.contentRef} onKeyDown={search.onContentKeyDown}>
        {takesValue && def.options && (
          <OptionList
            options={def.options}
            multi={isMulti}
            selected={selected}
            search={search}
            searchPlaceholder={`Search ${def.label.toLowerCase()}…`}
            onToggle={(value, checked) => {
              const next = new Set(selected);
              if (checked) next.add(value);
              else next.delete(value);
              put(next.size ? [...next] : undefined);
            }}
            onPick={(value) => put(value)}
          />
        )}

        {/* Typed in. The heading says what the box means, because from inside a
            submenu you can no longer see the field name that opened it. */}
        {takesValue && !def.options && (
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            <p className="px-2 pb-1 pt-1 text-xs text-muted-foreground">
              {def.label} {OPERATOR_LABELS[operator].toLowerCase()}
            </p>
            <div
              className="flex items-center gap-1.5 px-2 pb-1"
              onKeyDown={stopMenuTypeahead}
            >
              {operator === "between" ? (
                [0, 1].map((i) => (
                  <Input
                    key={i}
                    className="h-8 text-sm"
                    type={def.type === "date" ? "date" : "number"}
                    placeholder={i === 0 ? "From" : "To"}
                    aria-label={`${def.label} ${i === 0 ? "from" : "to"}`}
                    value={fromWire(
                      Array.isArray(filter?.value) ? filter!.value[i] : undefined,
                      def.type
                    )}
                    onChange={(e) => {
                      const pair = Array.isArray(filter?.value)
                        ? [...(filter!.value as unknown[])]
                        : [undefined, undefined];
                      pair[i] =
                        def.type === "date" ? e.target.value : toWire(e.target.value, def.type);
                      put(pair);
                    }}
                  />
                ))
              ) : (
                <Input
                  className="h-8 text-sm"
                  type={def.type === "date" ? "date" : def.type === "string" ? "text" : "number"}
                  placeholder={valuePlaceholder(def)}
                  aria-label={def.label}
                  value={fromWire(filter?.value, def.type)}
                  onChange={(e) =>
                    put(
                      def.type === "string" || def.type === "date"
                        ? e.target.value
                        : toWire(e.target.value, def.type)
                    )
                  }
                />
              )}
              {hint && <span className="shrink-0 text-xs text-muted-foreground">{hint}</span>}
            </div>
          </div>
        )}

        {/* How to match. Pinned under the choices rather than after them: with
            three hundred customers above it, a condition you have to scroll to
            is a condition nobody knows exists. */}
        {def.operators.length > 1 && (
          <div className="shrink-0 border-t border-border p-1">
            <DropdownMenuLabel className="px-2 py-1 text-xs font-normal text-muted-foreground">
              Condition
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={operator}
              onValueChange={(op) =>
                // The old value doesn't survive the switch: single, multi and
                // no-value operators don't take the same shape, and carrying one
                // over produces a filter that silently matches nothing.
                onChange({ key: def.key, operator: op as ReportFilterOperator, value: undefined })
              }
            >
              {def.operators.map((op) => (
                <DropdownMenuRadioItem key={op} value={op} onSelect={(e) => e.preventDefault()}>
                  {OPERATOR_LABELS[op]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </div>
        )}

        {filter && (
          <div className="shrink-0 border-t border-border p-1">
            <DropdownMenuItem onSelect={() => onChange(null)}>
              Clear {def.label.toLowerCase()}
            </DropdownMenuItem>
          </div>
        )}
      </SubmenuBox>
    </DropdownMenuSub>
  );
}

/** Which columns the table shows. Long on a wide report, so it searches too. */
function ColumnsSubmenu({
  columns,
  selected,
  onChange,
}: {
  columns: ReportColumn[];
  selected: string[];
  onChange: (keys: string[]) => void;
}) {
  const search = useSubmenuSearch();
  const chosen = new Set(selected);
  const shown = columns.filter((c) => optionMatches(c, search.query));

  const defaults = columns.filter((c) => c.default !== false).map((c) => c.key);
  const isDefault = selected.length === defaults.length && defaults.every((k) => chosen.has(k));

  const toggle = (column: ReportColumn) => {
    const next = new Set(chosen);
    if (next.has(column.key)) next.delete(column.key);
    else next.add(column.key);
    // A table with no columns is not a state worth allowing.
    if (next.size === 0) return;
    // Report order, not click order, two people on the same saved view must see
    // the same table.
    onChange(columns.filter((c) => next.has(c.key)).map((c) => c.key));
  };

  return (
    <SubmenuBox
      contentRef={search.contentRef}
      onKeyDown={search.onContentKeyDown}
      docShot="report-columns-submenu"
    >
      <SubmenuSearchBox search={search} placeholder="Search columns…" />
      <SubmenuList>
        {shown.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No matches.</p>
        ) : (
          shown.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.key}
              checked={chosen.has(column.key)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => toggle(column)}
            >
              <span className="truncate">{column.label}</span>
            </DropdownMenuCheckboxItem>
          ))
        )}
      </SubmenuList>
      <div className="shrink-0 border-t border-border p-1">
        <DropdownMenuItem
          disabled={isDefault}
          onSelect={(e) => {
            e.preventDefault();
            onChange(defaults);
          }}
        >
          <RotateCcw className="mr-2 size-3.5" />
          Reset columns
        </DropdownMenuItem>
      </div>
    </SubmenuBox>
  );
}

/**
 * Grouping, columns and filters in one nested menu.
 *
 * The badge counts FILTERS only. Grouping and the column set are both visible in
 * the table itself, so counting them would be telling you something you can see.
 */
export function ReportViewMenu({
  report,
  config,
  onChange,
}: {
  report: ReportMeta;
  config: ReportConfig;
  onChange: (patch: Partial<ReportConfig>) => void;
}) {
  const filters = config.filters ?? [];
  const columns = config.columns ?? [];
  const active = filters.filter(isCompleteFilter);

  const defaults = report.columns.filter((c) => c.default !== false).map((c) => c.key);
  const columnsAreDefault =
    columns.length === defaults.length && defaults.every((k) => columns.includes(k));

  const groupLabel =
    report.dimensions.find((d) => d.key === config.groupBy)?.label ?? "None";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ListFilter className="size-4" />
          Filters
          {active.length > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 text-xs font-medium text-primary">
              {active.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      {/* Opens under its trigger on the left of the toolbar, not the right. */}
      <DropdownMenuContent align="start" className="w-64" data-doc-shot="report-filters-menu">
        {report.dimensions.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Group className="mr-2 size-4 shrink-0 opacity-70" />
              <span className="flex-1 truncate">Group by</span>
              <span className="ml-2 max-w-24 truncate text-xs text-muted-foreground">
                {groupLabel}
              </span>
            </DropdownMenuSubTrigger>
            <SubmenuBox>
              <SubmenuList>
                <DropdownMenuRadioGroup
                  value={config.groupBy ?? NO_GROUP}
                  onValueChange={(v) => onChange({ groupBy: v === NO_GROUP ? null : v })}
                >
                  <DropdownMenuRadioItem value={NO_GROUP}>No grouping</DropdownMenuRadioItem>
                  {report.dimensions.map((d) => (
                    <DropdownMenuRadioItem key={d.key} value={d.key}>
                      {d.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </SubmenuList>
            </SubmenuBox>
          </DropdownMenuSub>
        )}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="flex-1 truncate">Columns</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {columnsAreDefault ? "Default" : `${columns.length} of ${report.columns.length}`}
            </span>
          </DropdownMenuSubTrigger>
          <ColumnsSubmenu
            columns={report.columns}
            selected={columns}
            onChange={(next) => onChange({ columns: next })}
          />
        </DropdownMenuSub>

        {report.filters.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Filters
            </DropdownMenuLabel>
            {report.filters.map((def) => (
              <FilterSubmenu
                key={def.key}
                def={def}
                filter={filters.find((f) => f.key === def.key)}
                onChange={(next) => onChange({ filters: upsert(filters, def.key, next) })}
              />
            ))}
            {active.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onChange({ filters: [] })}>
                  Clear all filters
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** What is currently narrowing the report, and how to stop it doing that. */
export function ActiveFilterChips({
  report,
  filters,
  onChange,
}: {
  report: ReportMeta;
  filters: ReportFilterInput[];
  onChange: (filters: ReportFilterInput[]) => void;
}) {
  const byKey = new Map(report.filters.map((d) => [d.key, d]));
  const chips = filters
    .map((filter, index) => ({ filter, index, def: byKey.get(filter.key) }))
    .filter((c) => c.def && isCompleteFilter(c.filter));

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map(({ filter, index, def }) => (
        <Badge key={`${filter.key}-${index}`} variant="secondary" className="gap-1 pr-1 font-normal">
          <span className="max-w-56 truncate">
            {def!.label}: {summarizeFilter(def!, filter)}
          </span>
          <button
            type="button"
            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={`Remove the ${def!.label} filter`}
            onClick={() => onChange(filters.filter((_, i) => i !== index))}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      {chips.length > 1 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground"
          onClick={() => onChange([])}
        >
          Clear all
        </Button>
      )}
    </div>
  );
}
