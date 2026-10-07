import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ComboOption = {
  value: string;
  label: string;
  hint?: string;
  /**
   * Heading to file this option under. Options with no group render first and unheaded, so
   * an ungrouped list behaves exactly as it did before groups existed.
   */
  group?: string;
  /** Extra search terms, matched but never shown. Where airport identifiers live. */
  keywords?: string[];
  /** Shown but not choosable: somebody invited who has not joined, so the list says they exist. */
  disabled?: boolean;
};

/**
 * Options in render order, split into their headed groups.
 *
 * Stable by first appearance rather than sorted, the caller's order is the meaningful one:
 * a picker that leads with the eight zones people actually choose must not have them
 * alphabetised away from the top.
 */
function groupOptions(options: ComboOption[]): { heading?: string; items: ComboOption[] }[] {
  const groups: { heading?: string; items: ComboOption[] }[] = [];
  const byHeading = new Map<string | undefined, ComboOption[]>();

  for (const option of options) {
    let items = byHeading.get(option.group);
    if (!items) {
      items = [];
      byHeading.set(option.group, items);
      groups.push({ heading: option.group, items });
    }
    items.push(option);
  }

  return groups;
}

/**
 * Searchable MULTI-select (Popover + Command). The checkbox sibling of {@link Combobox}.
 *
 * Built on `Command` rather than a plain checkbox list so search and keyboard navigation come
 * from cmdk instead of being hand-rolled, a Popover is not a Radix menu, so none of the
 * menu-typeahead repair in `submenu-search.tsx` is needed or wanted here.
 */
export function MultiCombobox({
  options,
  values,
  onChange,
  placeholder = "Choose…",
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
  className,
  disabled,
  trigger,
  contentClassName,
}: {
  options: ComboOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  /** Your own trigger in place of the button (a property row showing avatars). */
  trigger?: React.ReactElement;
  /** The list's width when the trigger is narrow or wide: "w-72". */
  contentClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = new Set(values);

  // One choice is worth naming; two are not, they only truncate, and the count is the part
  // you can actually read. Mirrors the report chips.
  const label =
    selected.size === 0
      ? placeholder
      : selected.size === 1
        ? (options.find((o) => selected.has(o.value))?.label ?? "1 selected")
        : `${selected.size} selected`;

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange([...next]);
  };

  return (
    // `modal` so Dialog's RemoveScroll treats this portaled list as a scroll shard;
    // without it, wheel events over the list are preventDefault'd and the roster won't scroll.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "h-7 max-w-[16rem] justify-start text-sm font-normal",
              selected.size === 0 && "text-muted-foreground",
              className
            )}
          >
            <span className="truncate">{label}</span>
          </Button>
        )}
      </PopoverTrigger>
      {/* Matches the trigger, with a floor: a full-width form field gets a list wide
          enough to read a name and an address, while the narrow filter-bar trigger
          keeps the 16rem it has always had. */}
      <PopoverContent align="start" className={cn("w-(--radix-popover-trigger-width) min-w-64 p-0", contentClassName)}>
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.value} ${o.label} ${o.hint ?? ""}`}
                  keywords={o.keywords}
                  // Stays open: picking several is the whole point of a multi-select.
                  onSelect={() => toggle(o.value)}
                >
                  <Check
                    className={cn("size-4", selected.has(o.value) ? "opacity-100" : "opacity-0")}
                  />
                  <span className="truncate">{o.label}</span>
                  {o.hint && (
                    <span className="ml-auto truncate text-xs text-muted-foreground">{o.hint}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** A headed group whose heading stays pinned while its rows scroll under it. Shared with the
 * other searchable menus (the job's Add menu) so they all read the same. */
export const STICKY_GROUP_CLASS =
  "overflow-visible [&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:z-10 [&_[cmdk-group-heading]]:-mx-1 [&_[cmdk-group-heading]]:bg-popover [&_[cmdk-group-heading]]:px-3";

/** A searchable menu's list: taller on a taller screen, never past the room the popover has. */
export const TALL_LIST_CLASS = "max-h-[min(30rem,calc(var(--radix-popover-content-available-height)-3rem))]";

/**
 * Rows pinned to the bottom of a searchable menu ("Add a customer aircraft"). Sticky inside the
 * list rather than outside it: cmdk only arrow-keys through items inside `CommandList`, so a
 * footer below the list would be unreachable from the keyboard. Pair with
 * {@link STICKY_FOOTER_LIST_CLASS} on the list so a highlighted row never scrolls under it.
 */
export const STICKY_FOOTER_CLASS = "sticky bottom-0 z-10 order-last border-t border-border bg-popover";
// A column so `order-last` holds: while you type, cmdk re-appends the matching groups to the
// end of the list, which would otherwise leave the footer stranded at the top of the results.
export const STICKY_FOOTER_LIST_CLASS = "scroll-pb-11 [&_[cmdk-list-sizer]]:flex [&_[cmdk-list-sizer]]:flex-col";

/** A row pinned below a picker's options: makes the thing being looked for when it isn't there. */
export type ComboAction = { label: string; onSelect: (search: string) => void };

/**
 * Searchable single-select (Popover + Command). Client-side fuzzy filter, the API has
 * no server search, so this is how large rosters/fleets stay usable.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results.",
  className,
  disabled,
  id,
  invalid,
  trigger,
  contentClassName,
  action,
}: {
  options: ComboOption[];
  value?: string;
  onChange: (value: string) => void;
  /**
   * Rows that make the thing being looked for when it is not there ("Add a customer
   * aircraft"). Pinned to the bottom of the list, so they stay in view however long it is,
   * and always shown, whatever is typed; given the search text, to start the new one with.
   */
  action?: ComboAction | ComboAction[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  /** Put on the trigger so a `<Label htmlFor>` and error-focus can target it. */
  id?: string;
  /** Marks the trigger `aria-invalid` for validate-on-submit forms. */
  invalid?: boolean;
  /** Your own trigger in place of the button (a property row showing the value its own way). */
  trigger?: React.ReactElement;
  /** The list's width when the trigger is narrow or wide: "w-72". */
  contentClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const selected = options.find((o) => o.value === value);
  const groups = React.useMemo(() => groupOptions(options), [options]);
  const actions = action ? (Array.isArray(action) ? action : [action]) : [];

  return (
    // `modal` so Dialog's RemoveScroll treats this portaled list as a scroll shard;
    // without it, wheel events over the list are preventDefault'd and the roster won't scroll.
    <Popover open={open} onOpenChange={(o) => (setOpen(o), o || setSearch(""))} modal>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="outline"
            role="combobox"
            id={id}
            aria-expanded={open}
            aria-invalid={invalid}
            disabled={disabled}
            className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
          >
            <span className="truncate">{selected ? selected.label : placeholder}</span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className={cn("w-(--radix-popover-trigger-width) p-0", contentClassName)} align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList className={cn(TALL_LIST_CLASS, actions.length > 0 && STICKY_FOOTER_LIST_CLASS)}>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map((group, i) => (
              // Headed groups keep their heading pinned while their rows scroll under it, so a
              // long list still says whose rows these are ("Owners of this aircraft"). The group
              // must not clip (overflow-hidden would make it the sticky's scroller).
              <CommandGroup
                key={group.heading ?? `ungrouped-${i}`}
                heading={group.heading}
                className={STICKY_GROUP_CLASS}
              >
                {group.items.map((o) => (
                  <CommandItem
                    key={o.value}
                    // Distinct per item: cmdk keys on this, and two cities can share a label.
                    value={`${o.value} ${o.label} ${o.hint ?? ""}`}
                    keywords={o.keywords}
                    disabled={o.disabled}
                    onSelect={() => {
                      if (o.disabled) return;
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    {/* No check gutter on a row that can never be checked, or it sits indented for nothing. */}
                    {!o.disabled && (
                      <Check
                        className={cn("size-4", o.value === value ? "opacity-100" : "opacity-0")}
                      />
                    )}
                    <span className="truncate">{o.label}</span>
                    {o.hint && (
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        {o.hint}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            {actions.length > 0 && (
              <CommandGroup forceMount className={STICKY_FOOTER_CLASS}>
                {actions.map((a, i) => (
                  <CommandItem
                    key={a.label}
                    forceMount
                    value={`__combobox-action-${i}`}
                    onSelect={() => {
                      setOpen(false);
                      a.onSelect(search.trim());
                    }}
                  >
                    <Plus className="size-4" />
                    <span className="truncate">{a.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
