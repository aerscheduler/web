// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MoneyInput } from "./money-input";
import { parseMoneyInput } from "@/lib/billing-currency";

/**
 * Regression guard for the bug that billed a 12 hour annual as twelve cents.
 *
 * Wherever the owning form defaults the value to 0 (an invoice line, an aircraft rate, a
 * facility rate) the field renders pre-filled "0.00". Clicking in put the caret INSIDE
 * that text, so typing "95.00" produced "0.0095.00", which parseFloat reads as 0.0095,
 * so a $95/hr line billed as 1 cent with nothing on screen to say so. Reproduced in the
 * live console on 2026-09-27: field "0.0095.00", dialog footer "Total $0.01".
 *
 * Two independent defences, tested separately below:
 *   1. focus selects the existing text, so the first keystroke replaces it;
 *   2. text that is not an amount ("0.0095.00", "1,2,3") is refused and the field shows its
 *      error, instead of being read as whatever parseFloat or a stripped comma made of it.
 *
 * And the euro bug (2026-10-12): commas were stripped, so a school billing in EUR typing
 * "12,50" saved 1250.00. The comma is now a decimal comma when it can only be one.
 */

afterEach(cleanup);

function Harness({ initial }: { initial?: number }) {
  const [cents, setCents] = React.useState<number | undefined>(initial);
  const [valid, setValid] = React.useState<boolean | null>(null);
  return (
    <div>
      <MoneyInput cents={cents} onCentsChange={setCents} onValidityChange={setValid} id="price" />
      <output data-testid="cents">{String(cents)}</output>
      <output data-testid="valid">{String(valid)}</output>
    </div>
  );
}

const field = () => screen.getByRole("textbox") as HTMLInputElement;
const cents = () => screen.getByTestId("cents").textContent;
const valid = () => screen.getByTestId("valid").textContent;

/** What a browser does to a text input when you type into it at the current selection. */
function typeInto(input: HTMLInputElement, keys: string) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const next = input.value.slice(0, start) + keys + input.value.slice(end);
  fireEvent.change(input, { target: { value: next } });
}

describe("MoneyInput", () => {
  it("renders a zero value as the pre-filled 0.00 that caused the bug", () => {
    render(<Harness initial={0} />);
    expect(field().value).toBe("0.00");
  });

  it("selects the existing text on focus so the first keystroke replaces it", () => {
    render(<Harness initial={0} />);
    fireEvent.focus(field());
    expect(field().selectionStart).toBe(0);
    expect(field().selectionEnd).toBe("0.00".length);
  });

  it("bills $95.00, not 1 cent, when you click in and type (the exact reported bug)", () => {
    render(<Harness initial={0} />);
    const input = field();
    fireEvent.focus(input);
    typeInto(input, "95.00");

    expect(input.value).toBe("95.00");
    expect(cents()).toBe("9500");
    expect(cents()).not.toBe("1");
  });

  it("keeps a 12 x $95 line at $1,140.00 rather than $0.12", () => {
    render(<Harness initial={0} />);
    fireEvent.focus(field());
    typeInto(field(), "95.00");
    expect(Number(cents()) * 12).toBe(114_000);
  });

  it("overwrites an existing rate in one go rather than appending to it", () => {
    render(<Harness initial={18_000} />);
    const input = field();
    expect(input.value).toBe("180.00");
    fireEvent.focus(input);
    typeInto(input, "95");
    expect(input.value).toBe("95");
    expect(cents()).toBe("9500");
  });

  it("refuses a second decimal point instead of silently truncating at it", () => {
    render(<Harness initial={0} />);
    // parseFloat("95.0.5") reads 95 while the field shows "95.0.5", so the number on screen
    // is not the number billed. Refused, flagged, and nothing guessed.
    fireEvent.change(field(), { target: { value: "95.0.5" } });
    expect(field().value).toBe("95.0.5");
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/Enter an amount like 12\.50/)).toBeTruthy();
    expect(cents()).toBe("0");
    expect(valid()).toBe("false");
  });

  it("never shows one number while billing another", () => {
    // The contract that actually matters, and the one the bug broke: whatever ends up in
    // the field, the cents reported to the form are that text. Note the raw concatenation
    // below is only reachable if focus somehow does not select; the dot stripping alone
    // does not rescue it, which is why select-on-focus is the primary defence.
    const typed = ["95.00", "0.0095.00", "95.0.5", "1,234.56", "$80", ".5", "7."];
    for (const value of typed) {
      cleanup();
      render(<Harness initial={0} />);
      fireEvent.change(field(), { target: { value } });

      const shown = field().value;
      const parsed = parseMoneyInput(shown.replace(/^(\d+)[.,]$/, "$1"));
      if (parsed == null) {
        // Not an amount: the field says so, tells the form, and reports no number at all.
        expect(field().getAttribute("aria-invalid")).toBe("true");
        expect(valid()).toBe("false");
        expect(cents()).toBe("0");
      } else {
        expect(field().getAttribute("aria-invalid")).toBeNull();
        expect(valid()).toBe("true");
        expect(Number(cents())).toBe(parsed);
      }
    }
  });

  it("strips letters and currency symbols but keeps grouping", () => {
    render(<Harness initial={0} />);
    fireEvent.change(field(), { target: { value: "$1,2a34.5" } });
    expect(field().value).toBe("1,234.5");
    expect(cents()).toBe("123450");
  });

  it("reads a euro school's decimal comma: 12,50 is 12.50, not 1250.00", () => {
    render(<Harness initial={0} />);
    fireEvent.change(field(), { target: { value: "€12,50" } });
    expect(field().value).toBe("12,50");
    expect(cents()).toBe("1250");
    fireEvent.blur(field());
    expect(field().value).toBe("12.50");
    expect(cents()).toBe("1250");
  });

  it("never flags the field while 12,50 is typed key by key", () => {
    render(<Harness />);
    const input = field();
    fireEvent.focus(input);
    for (const key of "12,50") {
      input.setSelectionRange(input.value.length, input.value.length);
      typeInto(input, key);
      expect(field().getAttribute("aria-invalid")).toBeNull();
    }
    expect(field().value).toBe("12,50");
    expect(cents()).toBe("1250");
  });

  it("keeps en-US grouping: 1,234 is 1234.00", () => {
    render(<Harness initial={0} />);
    fireEvent.change(field(), { target: { value: "1,234" } });
    expect(cents()).toBe("123400");
  });

  it("flags an ambiguous amount instead of guessing, and reports no fake 0", () => {
    for (const value of ["1,2,3", "1.234,56", "12.345", "1.250", ",50"]) {
      cleanup();
      render(<Harness initial={500} />);
      fireEvent.change(field(), { target: { value } });
      expect(field().getAttribute("aria-invalid")).toBe("true");
      // The form keeps its last good value and is told the field is unreadable, so its save
      // waits. Reporting 0 here is what let every form save $0.00 silently.
      expect(cents()).toBe("500");
      expect(valid()).toBe("false");
      // Blur leaves the text alone so the person can see what to fix.
      fireEvent.blur(field());
      expect(field().value).toBe(value);
    }
  });

  it("reports 0 for an emptied field rather than keeping the old value", () => {
    render(<Harness initial={9_500} />);
    fireEvent.change(field(), { target: { value: "" } });
    expect(cents()).toBe("0");
    // Empty is an answer, not an error.
    expect(valid()).toBe("true");
  });

  it("never calls onCentsChange with unreadable text, and recovers when it is fixed", () => {
    const onCents = vi.fn();
    const onValid = vi.fn();
    render(<MoneyInput cents={1_000} onCentsChange={onCents} onValidityChange={onValid} id="price" />);
    expect(onValid).toHaveBeenLastCalledWith(true);

    fireEvent.change(field(), { target: { value: "12.345" } });
    expect(onCents).not.toHaveBeenCalled();
    expect(onValid).toHaveBeenLastCalledWith(false);

    fireEvent.change(field(), { target: { value: "12.34" } });
    expect(onCents).toHaveBeenLastCalledWith(1_234);
    expect(onValid).toHaveBeenLastCalledWith(true);
  });

  it("calls onClear, not onCentsChange, for an emptied field that has one", () => {
    const onCents = vi.fn();
    const onClear = vi.fn();
    const onValid = vi.fn();
    render(<MoneyInput cents={1_000} onCentsChange={onCents} onClear={onClear} onValidityChange={onValid} id="price" />);
    fireEvent.change(field(), { target: { value: "1.250" } });
    expect(onValid).toHaveBeenLastCalledWith(false);
    fireEvent.change(field(), { target: { value: "" } });
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onCents).not.toHaveBeenCalled();
    expect(onValid).toHaveBeenLastCalledWith(true);
  });

  it("stops blocking the form when an unreadable field goes away", () => {
    const onValid = vi.fn();
    const { unmount } = render(<MoneyInput cents={0} onCentsChange={() => undefined} onValidityChange={onValid} id="price" />);
    fireEvent.change(field(), { target: { value: "1,2,3" } });
    expect(onValid).toHaveBeenLastCalledWith(false);
    unmount();
    expect(onValid).toHaveBeenLastCalledWith(true);
  });

  it("normalises to two decimals on blur", () => {
    render(<Harness initial={0} />);
    fireEvent.focus(field());
    typeInto(field(), "95.5");
    fireEvent.blur(field());
    expect(field().value).toBe("95.50");
    expect(cents()).toBe("9550");
  });

  it("leaves an empty field empty on blur rather than inventing 0.00", () => {
    render(<Harness initial={0} />);
    fireEvent.change(field(), { target: { value: "" } });
    fireEvent.blur(field());
    expect(field().value).toBe("");
  });

  // 2026-09-29: a field that starts EMPTY (no rate yet, a new part's cost, a spend limit) used
  // to rewrite "4" as "4.00" on the first keystroke, putting the caret after the decimals, so
  // typing 450 key by key saved $4.01. fill() sets the whole value at once and never saw it.
  it("keeps a value typed key by key into an empty field: 450 is $450.00, not $4.01", () => {
    render(<Harness />);
    const input = field();
    fireEvent.focus(input);
    for (const key of "450") {
      input.setSelectionRange(input.value.length, input.value.length);
      typeInto(input, key);
    }
    expect(field().value).toBe("450");
    expect(cents()).toBe("45000");
  });

  it("still redraws when the owner of the value resets it from outside", () => {
    const { rerender } = render(<MoneyInput cents={undefined} onCentsChange={() => undefined} id="price" />);
    expect(field().value).toBe("");
    rerender(<MoneyInput cents={12345} onCentsChange={() => undefined} id="price" />);
    expect(field().value).toBe("123.45");
  });
});
