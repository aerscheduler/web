// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RegistryMatch } from "@/features/queries";
import type { Location } from "@/types/api";

/**
 * What the tail-number lookup is allowed to write into the form.
 *
 * The registry is a lookup of record about an AIRFRAME, so it fills in airframe facts and
 * stops there. Two ways for that to go wrong, both silent on screen: a serial number that
 * the federal file has and the form throws away leaves the aeroplane unmatchable against an
 * Airworthiness Directive, and a registry that reached past the airframe would put a
 * plausible hourly rate on a school that never chose it and never noticed.
 *
 * `applyRegistryMatch` is not exported, so it is exercised where a person meets it: through
 * the form, by choosing a suggestion.
 */

//Hoisted with the mock factory below, which runs before this module body. The stub reads it
//at click time, so each test can decide what the chosen registry row carries.
const picked = vi.hoisted(() => ({ current: null as RegistryMatch | null }));

//The lookup itself has no test anywhere. Here it only has to be a row somebody chose, so
//what is under test is the form's decision about what to do with that row.
vi.mock("@/components/aircraft/tail-number-field", () => ({
  TailNumberField: ({
    id,
    value,
    onChange,
    onPick,
  }: {
    id: string;
    value: string;
    onChange: (v: string) => void;
    onPick: (m: RegistryMatch) => void;
  }) => (
    <>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" onClick={() => picked.current && onPick(picked.current)}>
        Choose suggestion
      </button>
    </>
  ),
}));

//The create spy is hoisted so a test can read the payload the form actually submits, which
//is the only place some of these decisions are observable: `MoneyInput` keeps its own text
//state and only re-syncs across undefined and number, so reading the rate box back tells you
//nothing about whether the form's rate was overwritten.
const created = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/features/queries", () => ({
  useCreatePlane: () => ({ mutate: created.mutate, isPending: false }),
  useUpdateResource: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
//Home base is required, so a test that submits has to be able to choose one. The real
//Combobox is a Radix popover with a command list, which is a lot of machinery to drive for
//a value this test does not care about.
vi.mock("@/components/combobox", () => ({
  Combobox: ({
    options,
    onChange,
  }: {
    options: { value: string; label: string }[];
    onChange: (v: string) => void;
  }) => (
    <button type="button" onClick={() => onChange(options[0]?.value ?? "")}>
      Pick home base
    </button>
  ),
}));
vi.mock("@/components/docs-hint", () => ({ DocsHint: () => null }));
vi.mock("@/components/subscription/plan", () => ({ PerPlanePricingNote: () => null }));

//A dialog behind a media query, and jsdom has no matchMedia. The wrapper keeps the test
//about the fields rather than about where they are mounted.
vi.mock("@/components/responsive-modal", () => ({
  ResponsiveModal: ({
    children,
    footer,
  }: {
    children?: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));

//Radix measures its Switch thumb on mount, and jsdom ships no ResizeObserver, so the whole
//form throws before a single field renders. Nothing here depends on a measurement, so a
//no-op is enough to get the tree mounted.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

const { AircraftFormModal } = await import("./aircraft-form");

/** A row as the registry returns it. Airplane on purpose: a glider unmounts the rate field. */
function match(over: Partial<RegistryMatch> = {}): RegistryMatch {
  return {
    tailNumber: "N172TS",
    serialNumber: "172S10648",
    make: "CESSNA",
    model: "172S",
    year: 2018,
    category: "airplane",
    aircraftClass: "single_engine_land",
    engineType: "reciprocating",
    gearType: "tricycle",
    seats: 4,
    categoryClass: null,
    ...over,
  };
}

function openForm() {
  render(
    <AircraftFormModal
      open
      onOpenChange={() => {}}
      locations={[{ id: 1, name: "Home base" } satisfies Location]}
    />
  );
}

const serialBox = () => screen.getByLabelText("Serial number (optional)") as HTMLInputElement;

afterEach(() => {
  //Not automatic without vitest globals, and without it every render stacks up in the same
  //document, so the next test finds two of every field.
  cleanup();
  picked.current = null;
  vi.clearAllMocks();
});

describe("choosing a registry suggestion", () => {
  it("fills in the serial number the federal file has", () => {
    /**
     * The bug this pins: the serial arrived on the match and was dropped, so the one field
     * an AD's applicability is written against stayed empty on an aircraft added by lookup.
     */
    picked.current = match();
    openForm();

    fireEvent.click(screen.getByText("Choose suggestion"));

    expect(serialBox().value).toBe("172S10648");
  });

  it("leaves a serial read off the plate alone when the registry row has none", () => {
    //The blank column lands as null, not "", and either way a missing serial must not wipe
    //a number somebody walked out to the aeroplane for.
    picked.current = match({ serialNumber: null });
    openForm();
    fireEvent.change(serialBox(), { target: { value: "PLATE-0042" } });

    fireEvent.click(screen.getByText("Choose suggestion"));

    expect(serialBox().value).toBe("PLATE-0042");
  });

  it("does not touch the rate or the fuel capacity, which are the school's numbers", () => {
    //Deliberately not prefilled: a plausible-looking wrong hourly rate is worse than an
    //empty one, and nobody re-reads a field that already looks answered.
    created.mutate.mockClear();
    picked.current = match();
    openForm();
    const rate = screen.getByLabelText("Rate (per hour)") as HTMLInputElement;
    const fuel = screen.getByLabelText("Fuel capacity (optional)") as HTMLInputElement;
    fireEvent.change(rate, { target: { value: "165" } });
    fireEvent.change(fuel, { target: { value: "56" } });

    fireEvent.click(screen.getByText("Choose suggestion"));

    expect(fuel.value).toBe("56");
    //The airframe facts still came across, so this is the registry being narrow rather than
    //the pick having quietly done nothing.
    expect((screen.getByLabelText("Make") as HTMLInputElement).value).toBe("CESSNA");

    //THE RATE IS CHECKED THROUGH THE PAYLOAD, not through the box. Asserting on the input
    //would pass even if the registry started overwriting the rate, because MoneyInput holds
    //its own text and would go on showing what was typed.
    fireEvent.click(screen.getByText("Pick home base"));
    fireEvent.submit(document.getElementById("modal-aircraft-form") as HTMLFormElement);
    const payload = created.mutate.mock.calls[0]?.[0];
    expect(payload?.type?.plane?.cost?.wetRate).toBe(16500);
    expect(payload?.type?.plane?.serialNumber).toBe("172S10648");
  });
});
