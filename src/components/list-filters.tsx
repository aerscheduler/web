import { useState, type ReactNode } from "react";
import { format } from "date-fns";
import { ListFilter, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { DateRangePicker } from "@/components/billing/date-range-picker";
import { ListSearch } from "@/components/list-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  SubmenuSearchBox,
  optionMatches,
  useSubmenuSearch,
} from "@/components/submenu-search";
import { asFacetStrings } from "@/lib/list-query-state";
import { cn } from "@/lib/utils";

export type BooleanFacet = {
  kind: "boolean";
  key: string;
  label: string;
  trueLabel?: string;
  falseLabel?: string;
  /**
   * What the unset state is called. Defaults to "Any", which is right when unset
   * really does mean "don't filter".
   *
   * Override it when it doesn't. The People page's Roster facet is the case: leaving
   * it unset shows CURRENT members, not everyone, because archived people are excluded
   * server-side by default. Labelling that "Any" told the reader the roster was
   * complete when two people were missing from it.
   */
  neutralLabel?: string;
};

export type SelectFacet = {
  kind: "select";
  key: string;
  label: string;
  /**
   * `hint` is secondary text shown muted beside the label — an aircraft's home field, a
   * person's role. It is also SEARCHED, so typing an airport surfaces every aircraft based
   * there even though no option is literally named after it.
   */
  options: Array<{ value: string; label: string; hint?: string }>;
  /** Label for the cleared / “any” choice. Ignored when `required`. */
  allLabel?: string;
  /** When true, omit the “any” choice — value is always one of `options`. */
  required?: boolean;
  /** Allow stacking multiple values (OR). Renders checkboxes instead of radios. */
  multiple?: boolean;
};

export type DateRangeFacet = {
  kind: "dateRange";
  key: "dateRange";
  label: string;
};

export type FacetDef = BooleanFacet | SelectFacet | DateRangeFacet;

export type ListFilterValue = string | boolean | string[] | undefined;

export type ListFilterValues = {
  /** ISO start/end when a dateRange facet is present. */
  startDate?: string;
  endDate?: string;
  [key: string]: ListFilterValue;
};

type Chip = {
  key: string;
  label: string;
  facet: FacetDef;
  /** For multi-select: which option this chip clears. */
  optionValue?: string;
};

function activeValueLabel(facet: FacetDef, values: ListFilterValues): string | null {
  if (facet.kind === "boolean") {
    const v = values[facet.key];
    if (v === true) return facet.trueLabel ?? "Yes";
    if (v === false) return facet.falseLabel ?? "No";
    return null;
  }
  if (facet.kind === "select") {
    if (facet.multiple) {
      const selected = asFacetStrings(values[facet.key]);
      if (selected.length === 0) return null;
      const labels = selected.map(
        (v) => facet.options.find((o) => o.value === v)?.label ?? v
      );
      if (labels.length <= 2) return labels.join(", ");
      return `${labels.length} selected`;
    }
    const v = values[facet.key];
    if (v === undefined || v === "" || Array.isArray(v)) return null;
    if (facet.required && String(v) === facet.options[0]?.value) return null;
    return facet.options.find((o) => o.value === String(v))?.label ?? String(v);
  }
  if (facet.kind === "dateRange") {
    if (!values.startDate && !values.endDate) return null;
    const from = values.startDate ? format(new Date(values.startDate), "MMM d") : "…";
    const to = values.endDate ? format(new Date(values.endDate), "MMM d, yyyy") : "…";
    return `${from} – ${to}`;
  }
  return null;
}

function clearFacetValue(
  facet: FacetDef,
  values: ListFilterValues,
  optionValue?: string
): ListFilterValues {
  if (facet.kind === "dateRange") {
    return { ...values, startDate: undefined, endDate: undefined };
  }
  if (facet.kind === "select" && facet.multiple && optionValue != null) {
    const next = asFacetStrings(values[facet.key]).filter((v) => v !== optionValue);
    return { ...values, [facet.key]: next.length ? next : undefined };
  }
  if (facet.kind === "select" && facet.required) {
    return { ...values, [facet.key]: facet.options[0]?.value };
  }
  return { ...values, [facet.key]: undefined };
}

function clearAllValues(facets: FacetDef[], values: ListFilterValues): ListFilterValues {
  let next = { ...values };
  for (const f of facets) next = clearFacetValue(f, next);
  return next;
}

function activeChips(facets: FacetDef[], values: ListFilterValues): Chip[] {
  const chips: Chip[] = [];
  for (const f of facets) {
    if (f.kind === "select" && f.multiple) {
      for (const v of asFacetStrings(values[f.key])) {
        const optLabel = f.options.find((o) => o.value === v)?.label ?? v;
        chips.push({
          key: `${f.key}:${v}`,
          label: `${f.label}: ${optLabel}`,
          facet: f,
          optionValue: v,
        });
      }
      continue;
    }
    const value = activeValueLabel(f, values);
    if (!value) continue;
    chips.push({ key: f.key, label: `${f.label}: ${value}`, facet: f });
  }
  return chips;
}

function toggleMultiValue(
  values: ListFilterValues,
  key: string,
  option: string,
  checked: boolean
): ListFilterValues {
  const current = asFacetStrings(values[key]);
  const next = checked
    ? current.includes(option)
      ? current
      : [...current, option]
    : current.filter((v) => v !== option);
  return { ...values, [key]: next.length ? next : undefined };
}

/**
 * Filter icon → nested dropdown of facets. Active filters render as dismissible
 * badges below (or beside) the trigger — use with {@link ListSearchBar}.
 */
export function ListFilters({
  facets,
  values,
  onChange,
  className,
  showBadges = true,
}: {
  facets: FacetDef[];
  values: ListFilterValues;
  onChange: (next: ListFilterValues) => void;
  className?: string;
  /** When false, only the icon trigger is rendered (badges live elsewhere). */
  showBadges?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const chips = activeChips(facets, values);
  const activeCount = chips.length;

  if (facets.length === 0) return null;

  const dateRange: DateRange | undefined =
    values.startDate || values.endDate
      ? {
          from: values.startDate ? new Date(values.startDate) : undefined,
          to: values.endDate ? new Date(values.endDate) : undefined,
        }
      : undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="relative shrink-0"
            aria-label={
              activeCount > 0
                ? `Filters (${activeCount} active)`
                : "Filters"
            }
          >
            <ListFilter className="size-4" />
            {activeCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                {activeCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Filters</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {facets.map((facet) => {
            if (facet.kind === "boolean") {
              const current =
                values[facet.key] === true
                  ? "true"
                  : values[facet.key] === false
                    ? "false"
                    : "all";
              return (
                <DropdownMenuSub key={facet.key}>
                  <DropdownMenuSubTrigger>
                    <span className="flex-1 truncate">{facet.label}</span>
                    <span className="ml-2 truncate text-xs text-muted-foreground">
                      {activeValueLabel(facet, values) ?? facet.neutralLabel ?? "Any"}
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-44">
                    <DropdownMenuRadioGroup
                      value={current}
                      onValueChange={(v) =>
                        onChange({
                          ...values,
                          [facet.key]: v === "all" ? undefined : v === "true",
                        })
                      }
                    >
                      <DropdownMenuRadioItem value="all">{facet.neutralLabel ?? "Any"}</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="true">
                        {facet.trueLabel ?? "Yes"}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="false">
                        {facet.falseLabel ?? "No"}
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              );
            }

            if (facet.kind === "select") {
              return (
                <SelectFacetSubmenu
                  key={facet.key}
                  facet={facet}
                  values={values}
                  onChange={onChange}
                />
              );
            }

            // dateRange — submenu with picker; keep menu open while choosing.
            return (
              <DropdownMenuSub key={facet.key}>
                <DropdownMenuSubTrigger>
                  <span className="flex-1 truncate">{facet.label}</span>
                  <span className="ml-2 max-w-28 truncate text-xs text-muted-foreground">
                    {activeValueLabel(facet, values) ?? "Any"}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="p-2" onClick={(e) => e.stopPropagation()}>
                  <DateRangePicker
                    value={dateRange}
                    onChange={(range) =>
                      onChange({
                        ...values,
                        startDate: range?.from?.toISOString(),
                        endDate: range?.to?.toISOString(),
                      })
                    }
                  />
                  {(values.startDate || values.endDate) && (
                    <DropdownMenuItem
                      className="mt-1"
                      onSelect={(e) => {
                        e.preventDefault();
                        onChange(clearFacetValue(facet, values));
                      }}
                    >
                      Clear dates
                    </DropdownMenuItem>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          })}
          {activeCount > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => onChange(clearAllValues(facets, values))}
              >
                Clear all filters
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {showBadges && chips.length > 0 && (
        <FilterBadges chips={chips} values={values} onChange={onChange} facets={facets} />
      )}
    </div>
  );
}

/**
 * One facet's submenu, with a search box over its options.
 *
 * Its own component rather than inline in the `.map()` above because the query is per-facet
 * state, and hooks can't be called from inside a loop.
 *
 * Every select facet gets the box, not just the long ones. A threshold would mean the
 * control appears and disappears depending on how many aircraft a school owns, so the same
 * menu behaves differently at two customers — and you can't build a habit on that.
 */
function SelectFacetSubmenu({
  facet,
  values,
  onChange,
}: {
  facet: SelectFacet;
  values: ListFilterValues;
  onChange: (next: ListFilterValues) => void;
}) {
  // All the menu-keyboard repair lives in this hook — see its notes for why each piece
  // is needed. Shared with the report filter menu so the two can't drift.
  const search = useSubmenuSearch();
  const visible = facet.options.filter((o) => optionMatches(o, search.query));

  const searchBox = (
    <SubmenuSearchBox
      search={search}
      placeholder={`Search ${facet.label.toLowerCase()}…`}
      className="border-b-0"
    />
  );

  const empty = (
    <div className="px-2 py-3 text-center text-sm text-muted-foreground">No matches</div>
  );

  if (facet.multiple) {
    const selected = new Set(asFacetStrings(values[facet.key]));
    return (
      <DropdownMenuSub onOpenChange={search.setOpen}>
        <DropdownMenuSubTrigger onKeyDown={search.captureTyping}>
          <span className="flex-1 truncate">{facet.label}</span>
          <span className="ml-2 max-w-24 truncate text-xs text-muted-foreground">
            {activeValueLabel(facet, values) ?? facet.allLabel ?? "Any"}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
        ref={search.contentRef}
        className="min-w-56"
        onKeyDown={search.onContentKeyDown}
      >
          {searchBox}
          <DropdownMenuSeparator />
          <div className="max-h-64 overflow-y-auto">
            {visible.length === 0
              ? empty
              : visible.map((o) => (
                  <DropdownMenuCheckboxItem
                    key={o.value}
                    checked={selected.has(o.value)}
                    onCheckedChange={(checked) =>
                      onChange(toggleMultiValue(values, facet.key, o.value, checked === true))
                    }
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.hint && (
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                        {o.hint}
                      </span>
                    )}
                  </DropdownMenuCheckboxItem>
                ))}
          </div>
          {selected.size > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  onChange(clearFacetValue(facet, values));
                }}
              >
                Clear {facet.label.toLowerCase()}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  const current =
    values[facet.key] !== undefined &&
    values[facet.key] !== "" &&
    !Array.isArray(values[facet.key])
      ? String(values[facet.key])
      : facet.required
        ? (facet.options[0]?.value ?? "all")
        : "all";

  // The "Any" row is a way to CLEAR the facet, not one of the things you're searching, so
  // it drops out as soon as you type rather than sitting above the results as a near-match.
  const showAny = !facet.required && !search.query.trim();

  // A required facet always has a value, so the trigger names it — including the default.
  // "Any" there would be a lie: People's Type is always Members or Guests, never both.
  const triggerLabel = facet.required
    ? (facet.options.find((o) => o.value === current)?.label ?? current)
    : (activeValueLabel(facet, values) ?? "Any");

  return (
    <DropdownMenuSub onOpenChange={search.setOpen}>
      <DropdownMenuSubTrigger onKeyDown={search.captureTyping}>
        <span className="flex-1 truncate">{facet.label}</span>
        <span className="ml-2 max-w-24 truncate text-xs text-muted-foreground">
          {triggerLabel}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        ref={search.contentRef}
        className="min-w-56"
        onKeyDown={search.onContentKeyDown}
      >
        {searchBox}
        <DropdownMenuSeparator />
        <div className="max-h-64 overflow-y-auto">
          {visible.length === 0 && !showAny ? (
            empty
          ) : (
            <DropdownMenuRadioGroup
              value={current}
              onValueChange={(v) =>
                onChange({
                  ...values,
                  [facet.key]: !facet.required && v === "all" ? undefined : v,
                })
              }
            >
              {showAny && (
                <DropdownMenuRadioItem value="all">
                  {facet.allLabel ?? "Any"}
                </DropdownMenuRadioItem>
              )}
              {visible.map((o) => (
                <DropdownMenuRadioItem key={o.value} value={o.value}>
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint && (
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">{o.hint}</span>
                  )}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          )}
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function FilterBadges({
  chips,
  values,
  onChange,
  facets,
  className,
}: {
  chips: Chip[];
  values: ListFilterValues;
  onChange: (next: ListFilterValues) => void;
  facets: FacetDef[];
  className?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chips.map((c) => (
        <Badge key={c.key} variant="secondary" className="gap-1 pr-1 font-normal">
          <span className="max-w-48 truncate">{c.label}</span>
          <button
            type="button"
            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={`Remove ${c.label}`}
            onClick={() => onChange(clearFacetValue(c.facet, values, c.optionValue))}
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
          onClick={() => onChange(clearAllValues(facets, values))}
        >
          Clear all
        </Button>
      )}
    </div>
  );
}

/**
 * Search input with the filter icon immediately to its right, then optional
 * trailing actions. Active filter badges render under the row.
 */
export function ListSearchBar({
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
  facets,
  filterValues,
  onFilterChange,
  trailing,
  className,
  showSearch = true,
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  facets?: FacetDef[];
  filterValues?: ListFilterValues;
  onFilterChange?: (next: ListFilterValues) => void;
  trailing?: ReactNode;
  className?: string;
  /** When false, only the filter icon (and badges) are shown. */
  showSearch?: boolean;
}) {
  const hasFacets = (facets?.length ?? 0) > 0 && filterValues != null && onFilterChange != null;
  const chips = hasFacets ? activeChips(facets!, filterValues!) : [];

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-initial">
          {showSearch && onChange != null && value != null && (
            <ListSearch
              value={value}
              onChange={onChange}
              placeholder={placeholder}
              aria-label={ariaLabel}
              className="min-w-0 flex-1 sm:w-64 sm:max-w-xs sm:flex-none"
            />
          )}
          {hasFacets && (
            <ListFilters
              facets={facets!}
              values={filterValues!}
              onChange={onFilterChange!}
              showBadges={false}
            />
          )}
        </div>
        {trailing}
      </div>
      {hasFacets && (
        <FilterBadges
          chips={chips}
          values={filterValues!}
          onChange={onFilterChange!}
          facets={facets!}
        />
      )}
    </div>
  );
}
