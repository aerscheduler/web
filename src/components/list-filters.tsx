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
import { asFacetStrings } from "@/lib/list-query-state";
import { cn } from "@/lib/utils";

export type BooleanFacet = {
  kind: "boolean";
  key: string;
  label: string;
  trueLabel?: string;
  falseLabel?: string;
};

export type SelectFacet = {
  kind: "select";
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
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
                      {activeValueLabel(facet, values) ?? "Any"}
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
                      <DropdownMenuRadioItem value="all">Any</DropdownMenuRadioItem>
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
              if (facet.multiple) {
                const selected = new Set(asFacetStrings(values[facet.key]));
                return (
                  <DropdownMenuSub key={facet.key}>
                    <DropdownMenuSubTrigger>
                      <span className="flex-1 truncate">{facet.label}</span>
                      <span className="ml-2 max-w-24 truncate text-xs text-muted-foreground">
                        {activeValueLabel(facet, values) ?? facet.allLabel ?? "Any"}
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-72 min-w-44 overflow-y-auto">
                      {facet.options.map((o) => (
                        <DropdownMenuCheckboxItem
                          key={o.value}
                          checked={selected.has(o.value)}
                          onCheckedChange={(checked) =>
                            onChange(
                              toggleMultiValue(values, facet.key, o.value, checked === true)
                            )
                          }
                          onSelect={(e) => e.preventDefault()}
                        >
                          {o.label}
                        </DropdownMenuCheckboxItem>
                      ))}
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
              return (
                <DropdownMenuSub key={facet.key}>
                  <DropdownMenuSubTrigger>
                    <span className="flex-1 truncate">{facet.label}</span>
                    <span className="ml-2 max-w-24 truncate text-xs text-muted-foreground">
                      {activeValueLabel(facet, values) ?? "Any"}
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-72 min-w-44 overflow-y-auto">
                    <DropdownMenuRadioGroup
                      value={current}
                      onValueChange={(v) =>
                        onChange({
                          ...values,
                          [facet.key]:
                            !facet.required && v === "all" ? undefined : v,
                        })
                      }
                    >
                      {!facet.required && (
                        <DropdownMenuRadioItem value="all">
                          {facet.allLabel ?? "Any"}
                        </DropdownMenuRadioItem>
                      )}
                      {facet.options.map((o) => (
                        <DropdownMenuRadioItem key={o.value} value={o.value}>
                          {o.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
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
