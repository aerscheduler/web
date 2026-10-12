import * as React from "react";

/**
 * Tracks which money fields in a form are unreadable, so the form can disable its save while
 * any is. `report("rate")` is the `onValidityChange` for the field keyed "rate".
 */
export function useMoneyFieldsValid() {
  const [invalid, setInvalid] = React.useState<ReadonlySet<string>>(() => new Set());
  const report = React.useCallback(
    (key: string) => (valid: boolean) =>
      setInvalid((prev) => {
        if (valid === !prev.has(key)) return prev;
        const next = new Set(prev);
        if (valid) next.delete(key);
        else next.add(key);
        return next;
      }),
    []
  );
  return { allValid: invalid.size === 0, report };
}
