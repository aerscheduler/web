// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Settings, Airworthiness Directives: one switch, saved the moment it is flipped. */

const mutateAsync = vi.fn(async (input: { enabled: boolean }) => ({ mode: input.enabled ? "catalogue" : "off", enabled: input.enabled }));
let current = { mode: "off", enabled: false };

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/docs-hint", () => ({ DocsHint: () => null }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/features/queries", () => ({
  useAdTracking: () => ({ data: current, isLoading: false }),
  useSetAdTracking: () => ({ mutateAsync, isPending: false, variables: undefined }),
}));

import { AdTrackingTab } from "./ad-tracking-tab";

afterEach(() => {
  cleanup();
  mutateAsync.mockClear();
});

describe("AdTrackingTab", () => {
  it("shows one switch, off by default, and turns it on with enabled: true", () => {
    current = { mode: "off", enabled: false };
    render(<AdTrackingTab />);
    const toggle = screen.getByRole("switch", { name: "Find the ADs for our aircraft" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText(/What we could match/)).toBeNull();
    fireEvent.click(toggle);
    expect(mutateAsync).toHaveBeenCalledWith({ enabled: true });
  });

  it("when on, says where the ADs are", () => {
    current = { mode: "catalogue", enabled: true };
    render(<AdTrackingTab />);
    expect(screen.getByRole("switch", { name: "Find the ADs for our aircraft" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Maintenance, Fleet ADs")).toBeTruthy();
  });
});
