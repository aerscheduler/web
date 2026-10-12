import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { moneySymbol, parseMoneyInput } from "@/lib/billing-currency";

/**
 * A money input in the organization's billing currency that stores/reports integer **cents**
 * (minor units). The adornment is that currency's symbol.
 * Money is integer cents everywhere server-side; we only convert at this edge.
 */
export function MoneyInput({
  cents,
  onCentsChange,
  className,
  id,
  placeholder = "0.00",
  disabled,
  onClear,
  onValidityChange,
}: {
  cents: number | undefined;
  onCentsChange: (cents: number) => void;
  className?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /**
   * Called when the field is emptied. Without it an empty field reports 0, right for a price;
   * wrong where empty means "none" (no labor rate, no spend limit), which then saved as $0.00.
   */
  onClear?: () => void;
  /**
   * Told whether the text is an amount. While it is not ("1.250", "12.345", ",50") the field
   * shows its error and `onCentsChange` is NOT called, so the form keeps the last good value
   * and must disable its save until this reports true again. Without it an unreadable field
   * used to report 0, and every form saved $0.00 with nothing to say so. Reports true on
   * unmount, so a field that disappears stops blocking the form.
   */
  onValidityChange?: (valid: boolean) => void;
}) {
  const [text, setText] = React.useState(cents != null ? (cents / 100).toFixed(2) : "");
  const invalid = text !== "" && parseLive(text) == null;
  const errorId = id ? `${id}-error` : undefined;

  const validityRef = React.useRef(onValidityChange);
  validityRef.current = onValidityChange;
  React.useEffect(() => {
    validityRef.current?.(!invalid);
  }, [invalid]);
  React.useEffect(() => () => validityRef.current?.(true), []);

  // Keep the field in sync when the value is reset externally (e.g. form reset). A change the
  // typing itself caused (an empty field's first digit turns undefined into a number) is left
  // alone: rewriting "4" as "4.00" put the caret after the decimals, so typing 450 saved $4.01.
  React.useEffect(() => {
    setText((t) =>
      cents != null && t !== "" && parseLive(t) === cents ? t : cents != null ? (cents / 100).toFixed(2) : ""
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents === undefined]);

  return (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {moneySymbol()}
        </span>
        <Input
          id={id}
          inputMode="decimal"
          placeholder={placeholder}
          disabled={disabled}
          value={text}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          // A price field is almost always pre-filled "0.00", and clicking into it used to
          // drop the caret inside that text. Typing "95.00" then produced "0.0095.00", which
          // parseFloat reads as 0.0095, so a $95/hr line billed as ONE CENT with nothing on
          // screen to say so. Selecting on focus means the first keystroke replaces the
          // placeholder value, which is what every other money field in the world does.
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            // Digits and both separators only. The comma is KEPT: a euro school types "12,50",
            // and stripping it (what this did before) saved 1250.00. parseMoneyInput decides what
            // the comma means, and refuses "95.000.00" or "1,2,3" rather than guessing.
            const raw = e.target.value.replace(/[^0-9.,]/g, "");
            setText(raw);
            if (raw === "") {
              if (onClear) onClear();
              else onCentsChange(0);
              return;
            }
            const parsed = parseLive(raw);
            // Unreadable text reports nothing: the form keeps its last good value, the field
            // shows its error, and onValidityChange tells the form to hold its save. Reporting
            // 0 here (what this did before) let every form save $0.00 silently.
            if (parsed != null) onCentsChange(parsed);
          }}
          onBlur={() => {
            if (text === "") return;
            const parsed = parseLive(text);
            if (parsed != null) setText((parsed / 100).toFixed(2));
          }}
          className={cn("pl-7 tnum", className)}
        />
      </div>
      {invalid && (
        <p id={errorId} className="mt-1 text-xs text-destructive">
          Enter an amount like 12.50 or 12,50.
        </p>
      )}
    </div>
  );
}

/**
 * Parse while the person is still typing: a trailing separator ("12," on the way to "12,50",
 * "12." on the way to "12.50") reads as the whole number so far instead of flashing an error.
 */
function parseLive(text: string): number | null {
  return parseMoneyInput(/^\d+[.,]$/.test(text) ? text.slice(0, -1) : text);
}

