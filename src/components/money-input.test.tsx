// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MoneyInput } from "./money-input";

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
 *   2. the change handler keeps only the first decimal point.
 */

afterEach(cleanup);

function Harness({ initial }: { initial?: number }) {
  const [cents, setCents] = React.useState<number | undefined>(initial);
  return (
    <div>
      <MoneyInput cents={cents} onCentsChange={setCents} id="price" />
      <output data-testid="cents">{String(cents)}</output>
    </div>
  );
}

const field = () => screen.getByRole("textbox") as HTMLInputElement;
const cents = () => screen.getByTestId("cents").textContent;

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

  it("drops a second decimal point instead of silently truncating at it", () => {
    render(<Harness initial={0} />);
    // Without the guard, parseFloat("95.0.5") reads 95 and the field keeps showing
    // "95.0.5", so the number on screen is not the number billed.
    fireEvent.change(field(), { target: { value: "95.0.5" } });
    expect(field().value).toBe("95.05");
    expect(cents()).toBe("9505");
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
      expect(shown.split(".").length).toBeLessThanOrEqual(2);

      const parsed = parseFloat(shown);
      const expected = Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
      expect(Number(cents())).toBe(expected);
    }
  });

  it("strips letters and currency punctuation", () => {
    render(<Harness initial={0} />);
    fireEvent.change(field(), { target: { value: "$1,2a3.4" } });
    expect(cents()).toBe("12340");
  });

  it("reports 0 for an emptied field rather than keeping the old value", () => {
    render(<Harness initial={9_500} />);
    fireEvent.change(field(), { target: { value: "" } });
    expect(cents()).toBe("0");
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
});
