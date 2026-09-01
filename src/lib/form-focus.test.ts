// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import { startFormFocus } from "./form-focus";

/**
 * The delegated listener is wired once per document, and `startFormFocus` is deliberately
 * idempotent, so every test here shares the one listener installed by the first call.
 * That is the real production shape: one listener, many forms.
 */
startFormFocus();

/** Submit and wait past both attempts (rAF, then the 250ms retry). */
async function submit(form: HTMLFormElement): Promise<void> {
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 320));
}

function mount(html: string): HTMLFormElement {
  document.body.innerHTML = `<form id="f">${html}</form>`;
  const form = document.getElementById("f") as HTMLFormElement;
  // jsdom has no layout, so scrollIntoView is not implemented. Spy on it rather than
  // stubbing the prototype away, so a test can assert we actually asked to scroll.
  for (const el of [...form.querySelectorAll("*"), form]) {
    (el as HTMLElement).scrollIntoView = vi.fn();
  }
  return form;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("startFormFocus", () => {
  it("focuses and scrolls to the first invalid field", async () => {
    const form = mount(`
      <input id="a" />
      <input id="b" aria-invalid="true" />
      <input id="c" aria-invalid="true" />
    `);
    await submit(form);

    expect(document.activeElement?.id).toBe("b");
    expect(document.getElementById("b")!.scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      behavior: "auto",
    });
  });

  it("never asks for smooth, which react-remove-scroll cancels inside a dialog", async () => {
    const form = mount(`<input id="a" aria-invalid="true" />`);
    await submit(form);

    const call = vi.mocked(document.getElementById("a")!.scrollIntoView).mock.calls[0][0];
    expect(call).toMatchObject({ behavior: "auto" });
  });

  it("falls through to the focusable descendant when the mark is on a wrapper", async () => {
    // The composite-field shape: aria-invalid on a div, the real control inside it. This
    // is what the per-form `querySelector("button")` patches existed to work around.
    const form = mount(`
      <div id="wrap" aria-invalid="true"><button type="button" id="trigger">Pick</button></div>
    `);
    await submit(form);

    expect(document.activeElement?.id).toBe("trigger");
    expect(document.getElementById("wrap")!.scrollIntoView).toHaveBeenCalled();
  });

  it("skips a disabled control rather than focusing nothing", async () => {
    const form = mount(`
      <div id="wrap" aria-invalid="true">
        <button type="button" id="off" disabled>No</button>
        <button type="button" id="on">Yes</button>
      </div>
    `);
    await submit(form);

    expect(document.activeElement?.id).toBe("on");
  });

  it("leaves a valid form alone", async () => {
    const form = mount(`<input id="a" /><input id="b" aria-invalid="false" />`);
    document.body.focus();
    await submit(form);

    expect(document.activeElement?.id).not.toBe("a");
    expect(document.getElementById("a")!.scrollIntoView).not.toHaveBeenCalled();
  });

  it("prefers a field inside the submitted form over a stale one elsewhere", async () => {
    document.body.innerHTML = `
      <div id="other" aria-invalid="true"><input id="stale" /></div>
      <form id="f"><input id="mine" aria-invalid="true" /></form>
    `;
    const form = document.getElementById("f") as HTMLFormElement;
    for (const el of document.querySelectorAll("*")) {
      (el as HTMLElement).scrollIntoView = vi.fn();
    }
    await submit(form);

    expect(document.activeElement?.id).toBe("mine");
  });

  it("catches validation that lands late, after the first animation frame", async () => {
    const form = mount(`<input id="a" />`);
    // A form that validates behind an await marks its field after the rAF attempt; the
    // 250ms retry is what covers it.
    setTimeout(() => document.getElementById("a")!.setAttribute("aria-invalid", "true"), 60);
    await submit(form);

    expect(document.activeElement?.id).toBe("a");
  });
});
