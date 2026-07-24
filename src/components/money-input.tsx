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
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, "");
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
