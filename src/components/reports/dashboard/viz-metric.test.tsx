// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { VizMetric } from "./viz-metric";
import { setActiveBillingCurrency } from "@/lib/billing-currency";

afterEach(() => {
  cleanup();
  setActiveBillingCurrency(null);
});

const columns = [{ key: "net", label: "Net", type: "money" as const }];

describe("VizMetric compact baseline", () => {
  it("puts the sign before the symbol: -£12.5k, not £-12.5k", () => {
    setActiveBillingCurrency("gbp");
    render(<VizMetric metric="net" columns={columns} totals={{ net: 100 }} previousTotals={{ net: -1_250_000 }} />);
    expect(screen.getByText("from -£12.5k")).toBeTruthy();
  });

  it("reads a positive baseline as before", () => {
    render(<VizMetric metric="net" columns={columns} totals={{ net: 100 }} previousTotals={{ net: 1_250_000 }} />);
    expect(screen.getByText("from $12.5k")).toBeTruthy();
  });
});
