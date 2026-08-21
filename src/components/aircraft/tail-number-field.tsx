import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useRegistryLookup, type RegistryMatch } from "@/features/queries";

/**
 * The tail-number field, with an address-picker style lookup underneath it.
 *
 * THE RULE THIS IS BUILT ON: typing always wins. The suggestion list is an offer, never
 * a gate. Nothing is filled in unless the person picks a row, nothing is validated
 * against the registry, and a tail we have never heard of submits exactly like one we
 * have. Our copy of the registry is US-only, so "not found" is the normal experience
 * for a large part of the world and must feel like nothing happening at all.
 *
 * That is also why this is not a Combobox. `components/combobox.tsx` is a select over a
 * known list, where picking one of the options IS the interaction. Here the input is
 * free text that happens to have help attached, so the list is rendered by hand and the
 * real input keeps focus throughout.
 */
export function TailNumberField({
  id,
  value,
  onChange,
  onPick,
  invalid,
  placeholder = "Tail number",
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Fired only when a suggestion is chosen. Never on typing. */
  onPick: (match: RegistryMatch) => void;
  invalid?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  // Set when a row is chosen, so the list does not immediately reopen for the value we
  // just filled in. Cleared as soon as the person types again.
  const [picked, setPicked] = React.useState<string | null>(null);

  const debounced = useDebouncedValue(value.trim(), 200);
  const enabled = open && debounced.length >= 2 && debounced !== picked;
  const { data, isFetching } = useRegistryLookup(debounced, enabled);

  const matches = enabled ? (data ?? []) : [];
  const listId = `${id}-suggestions`;

  React.useEffect(() => setActive(0), [debounced]);

  function choose(match: RegistryMatch) {
    setPicked(match.tailNumber);
    onChange(match.tailNumber);
    onPick(match);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!matches.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      // Only swallow Enter when the person is actually navigating the list. Otherwise
      // Enter must keep submitting the form, which is what someone typing a tail we do
      // not have will be doing.
      const match = matches[active];
      if (match) {
        e.preventDefault();
        choose(match);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        className="font-mono"
        aria-invalid={invalid}
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={matches.length ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          setPicked(null);
          setOpen(true);
          onChange(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        // A click on a suggestion blurs the input first, so closing has to wait long
        // enough for the mousedown-driven pick to land.
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />

      {isFetching && enabled && (
        <Loader2 className="text-muted-foreground pointer-events-none absolute top-2.5 right-2.5 size-3.5 animate-spin" />
      )}

      {matches.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="bg-popover text-popover-foreground absolute z-50 mt-1 w-full overflow-hidden rounded-md border shadow-md"
        >
          {matches.map((m, i) => (
            <li
              key={m.tailNumber}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: click fires after blur, by which point the list is
              // already closing.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(m);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-sm",
                i === active && "bg-accent text-accent-foreground"
              )}
            >
              <span className="font-mono font-medium">{m.tailNumber}</span>
              <span className="text-muted-foreground truncate text-xs">
                {[m.year, m.make, m.model].filter(Boolean).join(" ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
