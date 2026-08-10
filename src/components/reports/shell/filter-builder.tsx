/**
 * The stacked filter builder, and the value conversions every filter UI shares.
 *
 * The rows below are the DIALOG form, the dashboard tile builder, where there is
 * room to lay a question out and no table behind it. The report toolbar asks the
 * same question from a nested menu instead (`view-menu.tsx`), so it costs one
 * button rather than a row of chrome; both write the same `ReportFilterInput[]`.
 *
 * Filters are ANDed. That is a deliberate limit: an OR builder needs grouping,
 * nesting and a visual language for precedence, and every school we have watched
 * uses reports by narrowing, "this aircraft, over 2 hours, not closed out".
 * Whichever filter the question really turns on can be a multi-select, which
 * covers the OR case people actually want ("these three aircraft").
 *
 * Every filter's choices come from the catalog, including the org's own aircraft
 * and people, so nothing here is hardcoded and nothing goes stale.
 */

import { useState } from "react";
import { Filter, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox, MultiCombobox } from "@/components/combobox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { ReportFilterDef, ReportFilterInput, ReportFilterOperator } from "@/types/reports";
import { formatReportValue } from "@/lib/report-format";

export const OPERATOR_LABELS: Record<ReportFilterOperator, string> = {
  eq: "is",
  ne: "is not",
  gt: "is more than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  contains: "contains",
  startsWith: "starts with",
  in: "is any of",
  notIn: "is none of",
  isNull: "is empty",
  isNotNull: "is not empty",
  between: "is between",
};

const NO_VALUE: ReportFilterOperator[] = ["isNull", "isNotNull"];
const MULTI_VALUE: ReportFilterOperator[] = ["in", "notIn"];

/**
 * Money and hours are typed in the units people speak (dollars and hours) and
 * converted to the cents and deci-hours the engine compares against. Asking
 * somebody to filter on "over 20 deci-hours" would be a bug report.
 */
export function toWire(raw: string, type: ReportFilterDef["type"]): number | string {
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  if (type === "money") return Math.round(n * 100);
  if (type === "hours") return Math.round(n * 10);
  if (type === "percent") return n / 100;
  return n;
}

export function fromWire(value: unknown, type: ReportFilterDef["type"]): string {
  if (value == null) return "";
  if (typeof value !== "number") return String(value);
  if (type === "money") return String(value / 100);
  if (type === "hours") return String(value / 10);
  if (type === "percent") return String(value * 100);
  return String(value);
}

export function unitHint(type: ReportFilterDef["type"]): string | null {
  if (type === "money") return "$";
  if (type === "hours") return "hours";
  if (type === "percent") return "%";
  return null;
}

/** One filter, rendered as a sentence: [field] [operator] [value]. */
function FilterRow({
  def,
  filter,
  onChange,
  onRemove,
}: {
  def: ReportFilterDef;
  filter: ReportFilterInput;
  onChange: (next: ReportFilterInput) => void;
  onRemove: () => void;
}) {
  const needsValue = !NO_VALUE.includes(filter.operator);
  const isMulti = MULTI_VALUE.includes(filter.operator);
  const isBetween = filter.operator === "between";
  const hint = unitHint(def.type);

  const selected = new Set(
    (Array.isArray(filter.value) ? filter.value : filter.value != null ? [filter.value] : []).map(String)
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1.5">
      <span className="text-sm font-medium">{def.label}</span>

      <Select
        value={filter.operator}
        onValueChange={(operator) =>
          onChange({
            ...filter,
            operator: operator as ReportFilterOperator,
            // Switching between single, multi and no-value operators makes the
            // old value meaningless, carrying it over produces a filter that
            // silently matches nothing.
            value: undefined,
          })
        }
      >
        <SelectTrigger className="h-7 w-auto gap-1 border-none bg-transparent px-1.5 text-sm text-muted-foreground shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {def.operators.map((op) => (
            <SelectItem key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {needsValue && isMulti && def.options && (
        <MultiCombobox
          options={def.options}
          values={[...selected]}
          onChange={(next) => onChange({ ...filter, value: next })}
          searchPlaceholder={`Search ${def.label.toLowerCase()}…`}
          emptyText={def.options.length === 0 ? "Nothing to choose from yet." : "No matches."}
        />
      )}

      {needsValue && !isMulti && def.options && (
        <Combobox
          options={def.options}
          value={filter.value != null ? String(filter.value) : undefined}
          onChange={(value) => onChange({ ...filter, value })}
          placeholder="Choose…"
          searchPlaceholder={`Search ${def.label.toLowerCase()}…`}
          className="h-7 w-auto min-w-[9rem] text-sm"
        />
      )}

      {needsValue && !def.options && !isBetween && (
        <span className="flex items-center gap-1">
          <Input
            className="h-7 w-32 text-sm"
            type={def.type === "date" ? "date" : def.type === "string" ? "text" : "number"}
            value={fromWire(filter.value, def.type)}
            onChange={(e) =>
              onChange({
                ...filter,
                value:
                  def.type === "string" || def.type === "date"
                    ? e.target.value
                    : toWire(e.target.value, def.type),
              })
            }
          />
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </span>
      )}

      {needsValue && !def.options && isBetween && (
        <span className="flex items-center gap-1">
          {[0, 1].map((i) => (
            <Input
              key={i}
              className="h-7 w-24 text-sm"
              type={def.type === "date" ? "date" : "number"}
              value={fromWire(Array.isArray(filter.value) ? filter.value[i] : undefined, def.type)}
              onChange={(e) => {
                const pair = Array.isArray(filter.value) ? [...filter.value] : [undefined, undefined];
                pair[i] =
                  def.type === "date" ? e.target.value : toWire(e.target.value, def.type);
                onChange({ ...filter, value: pair });
              }}
            />
          ))}
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </span>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="ml-auto size-6 text-muted-foreground hover:text-foreground"
        onClick={onRemove}
        aria-label={`Remove the ${def.label} filter`}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

export function FilterBuilder({
  definitions,
  filters,
  onChange,
}: {
  definitions: ReportFilterDef[];
  filters: ReportFilterInput[];
  onChange: (filters: ReportFilterInput[]) => void;
}) {
  const [adding, setAdding] = useState(false);

  const byKey = new Map(definitions.map((d) => [d.key, d]));
  // A filter whose definition has gone (a renamed column, an old saved view) is
  // dropped from the UI rather than rendered as a broken row; the server ignores
  // it too, so the report still opens.
  const usable = filters.filter((f) => byKey.has(f.key));

  const add = (key: string) => {
    const def = byKey.get(key);
    if (!def) return;
    onChange([...usable, { key, operator: def.operators[0], value: undefined }]);
    setAdding(false);
  };

  if (definitions.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {usable.map((filter, i) => (
        <FilterRow
          key={`${filter.key}-${i}`}
          def={byKey.get(filter.key)!}
          filter={filter}
          onChange={(next) => onChange(usable.map((f, j) => (j === i ? next : f)))}
          onRemove={() => onChange(usable.filter((_, j) => j !== i))}
        />
      ))}

      <Popover open={adding} onOpenChange={setAdding}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            {usable.length === 0 ? <Filter className="size-4" /> : <Plus className="size-4" />}
            {usable.length === 0 ? "Add a filter" : "And…"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          {/* Command rather than a plain list so this is searchable and arrow-navigable.
              a report with thirty filterable fields is otherwise a scroll hunt. The
              description is searched too, since people look for "the one about no-shows"
              more often than they remember what the column is called. */}
          <Command>
            <CommandInput placeholder="Search filters…" />
            <CommandList>
              <CommandEmpty>No matches.</CommandEmpty>
              <CommandGroup>
                {definitions.map((def) => (
                  <CommandItem
                    key={def.key}
                    value={`${def.label} ${def.description ?? ""}`}
                    onSelect={() => add(def.key)}
                    className="flex-col items-start gap-0"
                  >
                    <span className="leading-tight">{def.label}</span>
                    {def.description && (
                      <span className="text-xs leading-snug text-muted-foreground">
                        {def.description}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Is this filter finished enough to run?
 *
 * A filter arrives with no value, you pick the field first, then the value. Sending
 * it half-built means `closedOut is undefined` matches nothing, so the table empties
 * the instant you add a filter and refills only once you finish. The row stays on
 * screen while you work on it; it just doesn't affect the results yet.
 */
export function isCompleteFilter(filter: ReportFilterInput): boolean {
  if (NO_VALUE.includes(filter.operator)) return true;
  if (filter.value == null || filter.value === "") return false;
  if (Array.isArray(filter.value)) {
    // `between` needs at least one bound; `in`/`notIn` need at least one choice.
    return filter.value.some((v) => v != null && v !== "");
  }
  return true;
}

/** A one-line summary of the active filters, for the saved-view list. */
export function describeFilters(
  definitions: ReportFilterDef[],
  filters: ReportFilterInput[]
): string {
  const byKey = new Map(definitions.map((d) => [d.key, d]));
  return filters
    .filter((f) => byKey.has(f.key))
    .map((f) => {
      const def = byKey.get(f.key)!;
      const op = OPERATOR_LABELS[f.operator];
      if (NO_VALUE.includes(f.operator)) return `${def.label} ${op}`;
      const value = Array.isArray(f.value)
        ? f.value.length > 2
          ? `${f.value.length} values`
          : f.value.join(" and ")
        : formatReportValue(f.value, def.type);
      return `${def.label} ${op} ${value}`;
    })
    .join(" · ");
}
