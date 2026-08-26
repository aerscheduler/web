import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAirportLookup } from "@/features/queries";
import type { AirportMatch } from "@/types/api";

/**
 * The airport field, with an address-picker style lookup underneath it.
 *
 * THE RULE THIS IS BUILT ON, and it is the same one as `TailNumberField`: typing always
 * wins. The suggestion list is an offer, never a gate. Nothing is filled in unless the
 * person picks a row, nothing is validated against the lookup, and an airport we have
 * never heard of submits exactly like one we have. Plenty of schools operate from a
 * private strip with no published identifier, and that has to feel like nothing happening
 * at all rather than like a rejection.
 *
 * That is also why this is not a Combobox. `components/combobox.tsx` is a select over a
 * known list, where picking one of the options IS the interaction. Here the input is free
 * text that happens to have help attached, so the list is rendered by hand and the real
 * input keeps focus throughout.
 *
 * Deliberately close to `aircraft/tail-number-field.tsx`. The two are not shared: they
 * render different rows, search different things and live on different forms, and folding
 * them into one generic typeahead would cost more in indirection than the ~40 lines of
 * keyboard handling it would save. If a third one appears, revisit that.
 */
export function AirportField({
  id,
  value,
  onChange,
  onPick,
  invalid,
  placeholder = "Airport",
  autoFocus,
  maxLength,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Fired only when a suggestion is chosen. Never on typing. */
  onPick: (match: AirportMatch) => void;
  invalid?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  maxLength?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  // Set when a row is chosen, so the list does not immediately reopen for the value we
  // just filled in. Cleared as soon as the person types again.
  const [picked, setPicked] = React.useState<string | null>(null);

  const debounced = useDebouncedValue(value.trim(), 200);
  const enabled = open && debounced.length >= 2 && debounced !== picked;
  const { data, isFetching } = useAirportLookup(debounced, enabled);

  const matches = enabled ? (data ?? []) : [];
  const listId = `${id}-suggestions`;

  React.useEffect(() => setActive(0), [debounced]);

  function choose(match: AirportMatch) {
    // What lands in the box is what the person will read back on the list of locations,
    // so it is the identifier AND the name, not the bare code. "KBOI" alone is unhelpful
    // to the student who only ever calls it Boise.
    const label = displayName(match);
    setPicked(label);
    onChange(label);
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
      // Enter must keep submitting the form, which is what someone typing a field we do
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
        maxLength={maxLength}
        autoComplete="off"
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
              key={m.ident}
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
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="font-mono font-medium">{m.ident}</span>
                <span className="truncate">{m.name}</span>
              </span>
              <span className="text-muted-foreground shrink-0 text-xs">{whereIs(m)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "KBOI Boise Air Terminal/Gowen Field", which is what goes in the box on a pick. */
export function displayName(match: AirportMatch): string {
  return `${match.ident} ${match.name}`;
}

/**
 * The right-hand hint on a row: enough to tell two similarly named fields apart.
 *
 * "Boise, ID" for a US field, "London, GB" for one abroad. The subdivision is the half of
 * `isoRegion` after the dash, which for a US row is the state code the address box wants
 * anyway. Falls back to the country alone when OurAirports has no city, which is about
 * 4,000 of the 72,500 rows.
 */
export function whereIs(match: AirportMatch): string {
  return [match.municipality, subdivisionOf(match) || match.isoCountry]
    .filter(Boolean)
    .join(", ");
}

/**
 * The subdivision out of an ISO 3166-2 code: "US-ID" -> "ID".
 *
 * Only meaningful as a state for countries that code their subdivisions the way the
 * address box expects, which in practice is the US. For everywhere else it is still a
 * reasonable regional label, and the form treats the state box as free text regardless.
 */
export function subdivisionOf(match: AirportMatch): string {
  const [, subdivision] = match.isoRegion.split("-");
  return subdivision ?? "";
}

/**
 * The country's display name from its ISO code: "US" -> "United States".
 *
 * The lookup speaks ISO 3166-1 alpha-2, the address box has always held full names, and
 * mixing the two in one free-text column is how you end up unable to group by country
 * later. `Intl.DisplayNames` is built into every browser we support, so this costs
 * nothing and covers all 247 countries the airport data spans.
 *
 * Falls back to the raw code if the runtime cannot name it, which is a worse label but
 * never a wrong one.
 */
export function countryName(isoCountry: string): string {
  if (!isoCountry) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(isoCountry) ?? isoCountry;
  } catch {
    return isoCountry;
  }
}
