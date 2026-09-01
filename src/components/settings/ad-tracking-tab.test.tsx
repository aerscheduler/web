// @vitest-environment jsdom
import { cleanup, render, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdReadiness, Resource } from "@/types/api";

/**
 * The readiness list is a data-entry surface, not a readout.
 *
 * It is where a school learns that a tail has no serial number, so it opens that
 * aircraft's form on the spot. Both of the things covered here failed silently in the
 * browser rather than throwing: a row whose record will not load looked untouched and
 * did nothing, and a row said nothing about being a control at all.
 */

//Hoisted with the mock factory, because `vi.mock` runs before the module body.
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

//The modal itself is exercised on its own; here it only has to say whether it is open,
//so the panel's own decisions are what is under test.
vi.mock("@/components/aircraft/aircraft-form", () => ({
  AircraftFormModal: ({ open, resource }: { open: boolean; resource?: Resource | null }) =>
    open ? <div data-testid="form">{`editing ${resource?.id}`}</div> : null,
}));
vi.mock("@/components/docs-hint", () => ({ DocsHint: () => null }));

let resourceState: { data?: Resource; isLoading: boolean; isError: boolean } = {
  data: undefined,
  isLoading: false,
  isError: false,
};
const readiness: AdReadiness = {
  mode: "manual",
  externalSystem: null,
  counts: { total: 2, serial: 1, model: 1, none: 0 },
  aircraft: [
    {
      resourceId: 11,
      tailNumber: "N172TS",
      make: "Cessna",
      model: "172S",
      serialNumber: "172S10648",
      quality: "serial",
      missing: [],
    },
    {
      resourceId: 12,
      tailNumber: "N44TS",
      make: "Piper",
      model: "PA-44 Seminole",
      serialNumber: null,
      quality: "model",
      missing: ["serial number"],
    },
  ],
};

vi.mock("@/features/queries", () => ({
  useAdTracking: () => ({ data: readiness, isLoading: false }),
  useSetAdTracking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLocations: () => ({ data: [] }),
  useResource: () => resourceState,
}));

import { AdTrackingTab } from "./ad-tracking-tab";

beforeEach(() => {
  resourceState = { data: undefined, isLoading: false, isError: false };
  toastError.mockClear();
});

afterEach(() => {
  //Not automatic without vitest globals, and without it every render stacks up in the
  //same document, so the second test finds two of every row.
  cleanup();
  vi.clearAllMocks();
});

describe("the AD readiness list", () => {
  it("names each row as the control it is, rather than as a tail number", () => {
    render(<AdTrackingTab />);
    expect(screen.getByLabelText("Edit N44TS")).toBeTruthy();
  });

  it("says so when the record will not load, and does not leave the row dead", () => {
    /**
     * The bug this pins: `setEditingId` was called with the id it already held, React
     * bailed out of the render, no refetch was triggered, and the row stayed unusable
     * until a page reload. Letting go of the id is what makes the next click a real
     * state change.
     */
    resourceState = { data: undefined, isLoading: false, isError: true };
    render(<AdTrackingTab />);

    fireEvent.click(screen.getByLabelText("Edit N44TS"));

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("form")).toBeNull();
    //Still a live control, not a spent one.
    expect(screen.getByLabelText("Edit N44TS").hasAttribute("disabled")).toBe(false);
  });

  it("opens the form on the aircraft whose row was chosen", () => {
    resourceState = { data: { id: 12 } as Resource, isLoading: false, isError: false };
    render(<AdTrackingTab />);

    fireEvent.click(screen.getByLabelText("Edit N44TS"));

    expect(screen.getByTestId("form").textContent).toBe("editing 12");
  });

  it("does not offer a search box to a fleet you can read at a glance", () => {
    render(<AdTrackingTab />);
    expect(screen.queryByLabelText("Search this fleet")).toBeNull();
  });
});
