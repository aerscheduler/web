import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A dollar-denominated input that stores/reports integer **cents**.
 * Money is integer cents everywhere server-side; we only convert at this edge.
 */
export function MoneyInput({
  cents,
  onCentsChange,
  className,
  id,
  placeholder = "0.00",
  disabled,
}: {
  cents: number | undefined;
  onCentsChange: (cents: number) => void;
  className?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [text, setText] = React.useState(cents != null ? (cents / 100).toFixed(2) : "");

  // Keep the field in sync when the value is reset externally (e.g. form reset).
  React.useEffect(() => {
    setText(cents != null ? (cents / 100).toFixed(2) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents === undefined]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      <Input
        id={id}
        inputMode="decimal"
        placeholder={placeholder}
        disabled={disabled}
        value={text}
        // A price field is almost always pre-filled "0.00", and clicking into it used to
        // drop the caret inside that text. Typing "95.00" then produced "0.0095.00", which
        // parseFloat reads as 0.0095, so a $95/hr line billed as ONE CENT with nothing on
        // screen to say so. Selecting on focus means the first keystroke replaces the
        // placeholder value, which is what every other money field in the world does.
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          // Keep only the FIRST decimal point. Without this, a stray second point makes
          // parseFloat silently truncate at it ("95.000.00" reads as 95) instead of
          // refusing, so the field can still disagree with what the person typed.
          const cleaned = e.target.value.replace(/[^0-9.]/g, "");
          const firstDot = cleaned.indexOf(".");
          const raw =
            firstDot === -1
              ? cleaned
              : cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
          setText(raw);
          const dollars = parseFloat(raw);
          if (!Number.isNaN(dollars)) onCentsChange(Math.round(dollars * 100));
          else onCentsChange(0);
        }}
        onBlur={() => {
          if (text === "") return;
          const dollars = parseFloat(text);
          if (!Number.isNaN(dollars)) setText(dollars.toFixed(2));
        }}
        className={cn("pl-7 tnum", className)}
      />
    </div>
  );
}
