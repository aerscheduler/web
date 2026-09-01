// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RegistryMatch } from "@/features/queries";

/**
 * CHOOSING A SUGGESTION CALLS `onChange` BEFORE `onPick`, AND SOMETHING DEPENDS ON IT.
 *
 * The onboarding wizard has no serial number box. It carries the serial the lookup found as
 * invisible state, and clears it on every `onChange` so that editing the tail after a pick
 * cannot leave the school's first aircraft wearing another airframe's data plate. That is
 * only safe while the pick sets the serial AFTER the clear. Swap these two lines in
 * `choose()` and the wizard silently stops recording serials altogether: the clear would
 * land last, the field is invisible, and the aircraft saves without one.
 *
 * Nothing else in the tree would fail, which is why this is pinned here rather than left to
 * a comment.
 */

const rows = vi.hoisted(() => ({ current: [] as RegistryMatch[] }));
vi.mock("@/features/queries", () => ({
  useRegistryLookup: () => ({ data: rows.current, isFetching: false }),
}));

const { TailNumberField } = await import("./tail-number-field");

function match(): RegistryMatch {
  return {
    tailNumber: "N172SP",
    serialNumber: "R172-2842",
    make: "CESSNA",
    model: "R172K",
    year: 1977,
    category: "airplane",
    aircraftClass: "single_engine_land",
    engineType: "reciprocating",
    gearType: "tricycle",
    seats: 4,
    categoryClass: null,
  };
}

afterEach(() => {
  cleanup();
  rows.current = [];
  vi.clearAllMocks();
});

describe("choosing a tail number suggestion", () => {
  it("calls onChange before onPick, which is what lets a caller clear on edit", async () => {
    rows.current = [match()];
    const calls: string[] = [];

    function Harness() {
      const [value, setValue] = React.useState("");
      return (
        <TailNumberField
          id="tail"
          value={value}
          onChange={(v) => {
            calls.push("change");
            setValue(v);
          }}
          onPick={() => calls.push("pick")}
        />
      );
    }

    render(<Harness />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "N172SP" } });

    //The list is debounced by 200ms, so wait for the row rather than racing the timer.
    const option = await screen.findByRole("option");
    fireEvent.mouseDown(option);

    expect(calls).toEqual(["change", "change", "pick"]);
    //The last two are the pick itself: the value it wrote, then the row it chose. Whatever a
    //caller clears on change is therefore set again by the pick, not after it.
    expect(calls.slice(-2)).toEqual(["change", "pick"]);
  });
});
