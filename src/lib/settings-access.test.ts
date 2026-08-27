import { describe, expect, it } from "vitest";
import { canSeeSettingsTab, settingsSectionsFor, SETTINGS_TABS } from "@/lib/settings-sections";

//---------------------------------------------------------------------------------
// Who can open which Settings pane.
//
// Settings as a whole is reachable on the `manageOrgSettings` grant, on purpose, so a
// school can let an office manager edit its details without making them an admin. The
// Plan pane is the exception: it names what AerScheduler charges this school, the rate
// we quoted them, and how many aircraft we comp. That is the school's commercial
// position with us, and it is admin/owner only, the same line the paywall draws.
//---------------------------------------------------------------------------------

const tabsFor = (enterprise: boolean, admin: boolean) =>
  settingsSectionsFor(enterprise, admin).flatMap((s) => s.tabs.map((t) => t.value));

describe("the Plan pane", () => {
  it("is offered to an admin", () => {
    expect(tabsFor(false, true)).toContain("plan");
  });

  it("is hidden from a non-admin who reached Settings on a grant", () => {
    expect(tabsFor(false, false)).not.toContain("plan");
  });

  it("is not reachable by typing ?tab=plan", () => {
    // Hiding the rail entry is not a gate on its own: `?tab=` is a plain query string.
    expect(canSeeSettingsTab("plan", false, false)).toBe(false);
    expect(canSeeSettingsTab("plan", false, true)).toBe(true);
  });
});

describe("the rest of Settings", () => {
  it("still reaches a non-admin, or the grant would be pointless", () => {
    // The failure to avoid is over-correcting: gating all of Settings on admin would
    // undo the granular permissions feature for the exact people it exists for, which
    // is the mistake /training already made once.
    const tabs = tabsFor(false, false);
    expect(tabs).toContain("organization");
    expect(tabs).toContain("booking-preferences");
    expect(tabs.length).toBeGreaterThan(5);
  });

  it("drops no section entirely for a non-admin", () => {
    // Plan lives in the Billing group beside Billing, Memberships and the rest, so
    // hiding it must not empty a whole rail heading.
    const groups = settingsSectionsFor(false, false).map((s) => s.label);
    expect(groups).toContain("Billing");
    expect(groups).toContain("School");
  });
});

describe("the enterprise filter still works alongside it", () => {
  it("hides API keys from a non-enterprise admin", () => {
    expect(tabsFor(false, true)).not.toContain("api-keys");
    expect(tabsFor(true, true)).toContain("api-keys");
  });

  it("hides both from a non-enterprise non-admin", () => {
    const tabs = tabsFor(false, false);
    expect(tabs).not.toContain("api-keys");
    expect(tabs).not.toContain("plan");
  });
});

describe("the registry itself", () => {
  it("marks exactly the panes that are somebody's commercial business", () => {
    // A guard rail on the registry rather than the filter: if a new pane is added that
    // shows what the school pays us, it should be added here consciously.
    const adminOnly = SETTINGS_TABS.filter((t) => t.adminOnly).map((t) => t.value);
    expect(adminOnly).toEqual(["plan"]);
  });
});
