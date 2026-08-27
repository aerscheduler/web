// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured: Array<{ event: string; props: Record<string, unknown> }> = [];

vi.mock("./analytics", () => ({
  track: (event: string, props: Record<string, unknown>) => captured.push({ event, props }),
  normalizePath: (path: string) =>
    path
      .split("/")
      .map((s) => (/^\d+$/.test(s) ? ":id" : s))
      .join("/") || "/",
}));

const { controlLabel, controlContext, fieldName, onNavigation, startInteractionTracking } =
  await import("./interaction-tracking");

startInteractionTracking();

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

beforeEach(() => {
  captured.length = 0;
  onNavigation();
});

describe("controlLabel", () => {
  it("prefers an explicit data-track over everything else", () => {
    const el = mount(`<button data-track="ramp-out" aria-label="Other">Text</button>`);
    expect(controlLabel(el)).toBe("ramp-out");
  });

  it("names an icon-only button from its aria-label", () => {
    const el = mount(`<button aria-label="Delete aircraft"><svg class="lucide lucide-trash-2"/></button>`);
    expect(controlLabel(el)).toBe("Delete aircraft");
  });

  // The 1,257-anonymous-clicks case: no text, no aria-label, just an icon.
  it("falls back to the lucide icon name when nothing else names it", () => {
    const el = mount(`<button><svg class="lucide lucide-trash-2"/></button>`);
    expect(controlLabel(el)).toBe("icon:trash-2");
  });

  it("reads shadcn's sr-only convention", () => {
    const el = mount(`<button><svg class="lucide lucide-x"/><span class="sr-only">Close</span></button>`);
    expect(controlLabel(el)).toBe("Close");
  });

  it("reports a table-row control as the row, never as the customer in it", () => {
    const el = mount(
      `<table><tbody><tr><td><button>Sarah Whitfield</button></td></tr></tbody></table>`
    ).querySelector("button")!;
    expect(controlLabel(el)).toBe("row");
  });

  it("redacts an email that reaches the text fallback", () => {
    const el = mount(`<button>sarah@example.com</button>`);
    expect(controlLabel(el)).toBe("<redacted>");
  });

  it("redacts a tail number", () => {
    const el = mount(`<button>N172SP</button>`);
    expect(controlLabel(el)).toBe("<redacted>");
  });

  it("keeps ordinary UI copy intact", () => {
    const el = mount(`<button>Save changes</button>`);
    expect(controlLabel(el)).toBe("Save changes");
  });
});

describe("controlContext", () => {
  it("names the dialog a control sits in, so 'Delete' is not ambiguous", () => {
    const el = mount(
      `<div role="dialog"><h2 data-slot="dialog-title">Cancel reservation</h2><button>Delete</button></div>`
    ).querySelector("button")!;
    expect(controlContext(el)).toBe("dialog:Cancel reservation");
  });

  it("separates a table row from the page", () => {
    const el = mount(`<table><tbody><tr><td><button>Edit</button></td></tr></tbody></table>`).querySelector(
      "button"
    )!;
    expect(controlContext(el)).toBe("table-row");
  });
});

describe("fieldName", () => {
  it("prefers the hand-written id, which survives a copy change", () => {
    const el = mount(
      `<div><label for="hobbs-in">Hobbs in</label><input id="hobbs-in" /></div>`
    ).querySelector("input")!;
    expect(fieldName(el)).toBe("hobbs-in");
  });

  it("ignores a React useId value and falls through to the label", () => {
    const el = mount(
      `<div><label for="«r3»">Tach out</label><input id="«r3»" /></div>`
    ).querySelector("input")!;
    expect(fieldName(el)).toBe("Tach out");
  });

  it("falls back to the placeholder for an unlabelled search box", () => {
    const el = mount(`<input placeholder="Search people" />`);
    expect(fieldName(el)).toBe("Search people");
  });
});

describe("events", () => {
  it("reports a click with label, kind and context", () => {
    const el = mount(`<button aria-label="Ramp out">go</button>`);
    el.click();
    const click = captured.find((e) => e.event === "ui_click");
    expect(click?.props).toMatchObject({ label: "Ramp out", control: "button", context: "page" });
  });

  it("never reports what was typed into a field", () => {
    const el = mount(
      `<form><label for="notes">Notes</label><input id="notes" /></form>`
    ).querySelector("input")! as HTMLInputElement;
    el.focus();
    el.value = "student is nervous about crosswinds";
    el.dispatchEvent(new Event("change", { bubbles: true }));

    const changed = captured.find((e) => e.event === "field_changed");
    expect(changed?.props).toMatchObject({ field: "notes", filled: true });
    expect(JSON.stringify(captured)).not.toContain("crosswinds");
  });

  it("skips password fields entirely", () => {
    const el = mount(`<input type="password" name="password" />`) as HTMLInputElement;
    el.focus();
    el.dispatchEvent(new Event("change", { bubbles: true }));
    expect(captured.filter((e) => e.event.startsWith("field_"))).toHaveLength(0);
  });

  it("reports the last field touched when a form is abandoned", () => {
    const form = mount(
      `<form><label for="aircraft">Aircraft</label><input id="aircraft" /><label for="instructor">Instructor</label><input id="instructor" /></form>`
    );
    const [first, second] = [...form.querySelectorAll("input")] as HTMLInputElement[];
    first.focus();
    second.focus();
    onNavigation();

    const abandoned = captured.find((e) => e.event === "form_abandoned");
    expect(abandoned?.props).toMatchObject({
      last_field: "instructor",
      reason: "navigated",
      fields_touched: 2,
    });
  });

  it("does not report an abandonment for a form that was submitted", () => {
    const form = mount(`<form><label for="a">Aircraft</label><input id="a" /></form>`);
    (form.querySelector("input") as HTMLInputElement).focus();
    form.dispatchEvent(new Event("submit", { bubbles: true }));
    onNavigation();

    expect(captured.find((e) => e.event === "form_submitted")).toBeTruthy();
    expect(captured.find((e) => e.event === "form_abandoned")).toBeUndefined();
  });

  it("does not call a form abandoned when nobody typed in it", () => {
    mount(`<form><input id="a" /></form>`);
    onNavigation();
    expect(captured.find((e) => e.event === "form_abandoned")).toBeUndefined();
  });

  it("reports one field_focus per field per visit, not one per keystroke", () => {
    const el = mount(`<form><label for="a">Aircraft</label><input id="a" /></form>`).querySelector(
      "input"
    )! as HTMLInputElement;
    el.focus();
    el.blur();
    el.focus();
    expect(captured.filter((e) => e.event === "field_focus")).toHaveLength(1);
  });
});

describe("controls with no id, name or label[for]", () => {
  // Every <select> in the console is like this: the Add aircraft dialog alone has
  // seven, and before the group-label fallback all seven reported as unlabelled.
  it("names a select from the label in its field group", () => {
    const el = mount(
      `<div class="space-y-1.5"><label>Category</label><select><option>Airplane</option></select></div>`
    ).querySelector("select")!;
    expect(fieldName(el)).toBe("Category");
  });

  it("refuses to guess when the container holds more than one field", () => {
    const el = mount(
      `<div><label>Meters</label><input /><select><option>a</option></select></div>`
    ).querySelector("select")!;
    expect(fieldName(el)).toBe("<unlabelled select>");
  });
});

describe("dismissal", () => {
  it("counts a dialog closed with fields half-filled as an abandonment", async () => {
    const el = mount(
      `<div id="host"><div role="dialog"><h2 data-slot="dialog-title">Add aircraft</h2>
       <label for="ac-tail">Tail number</label><input id="ac-tail" /></div></div>`
    );
    (el.querySelector("input") as HTMLInputElement).focus();
    captured.length = 0;

    el.querySelector('[role="dialog"]')!.remove();
    // MutationObserver callbacks are delivered as a microtask.
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const abandoned = captured.find((e) => e.event === "form_abandoned");
    expect(abandoned?.props).toMatchObject({
      form: "Add aircraft",
      reason: "dismissed",
      last_field: "ac-tail",
    });
  });
});

describe("links named after a record", () => {
  it("names an aircraft card by its destination, not by the tail number on it", () => {
    const el = mount(`<a href="/aircraft/1906">N1906V (Lucy)</a>`);
    expect(controlLabel(el)).toBe("→ /aircraft/:id");
  });

  it("still prefers real link text when it is the app's own copy", () => {
    const el = mount(`<a href="/billing">Full schedule</a>`);
    expect(controlLabel(el)).toBe("Full schedule");
  });
});
