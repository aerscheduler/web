// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useModalId } from "./modal-stack";

/**
 * A pile of modals has to look like a pile.
 *
 * APPEARANCE ONLY. This stand-in has no Radix, so it cannot say anything about interaction,
 * and it used to try: it asserted an empty `pointer-events` as correct, which is precisely
 * the signature of the bug that left every real modal permanently dead to the mouse. The
 * interaction contract is pinned in `modal-stack.real.test.tsx`, against the real
 * primitives, where `DismissableLayer` actually participates.
 *
 * The behaviour under test is DOM arrangement rather than React state, and deliberately so:
 * these surfaces render into separate portals, and two React-shaped attempts at this failed
 * before the imperative one worked (see the header of modal-stack.ts). So the assertions
 * here are on what a person would actually see: which card recedes, which overlay paints,
 * and whether everything comes back when the top one goes away.
 */

/** A stand-in for one modal surface, stamped the way the real primitives stamp themselves. */
function Surface({ slot, state = "open" }: { slot: string; state?: "open" | "closed" }) {
  const { id, ref } = useModalId();
  return (
    <div ref={ref} data-modal-id={id} data-slot={slot} data-state={state}>
      <div data-slot={slot.replace("-content", "-overlay")} data-state={state} />
    </div>
  );
}

const surfaces = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-modal-id]")).map((el) => ({
    slot: el.dataset.slot,
    depth: el.getAttribute("data-modal-depth"),
    transform: el.style.transform,
    opacity: el.style.opacity,
  }));

const overlayOpacity = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-slot$="-overlay"]')).map(
    (el) => el.style.opacity || "(default)"
  );

afterEach(() => {
  document.body.innerHTML = "";
});

describe("a single modal", () => {
  it("is left completely alone", () => {
    render(<Surface slot="dialog-content" />);

    expect(surfaces()).toEqual([
      { slot: "dialog-content", depth: null, transform: "", opacity: "" },
    ]);
    expect(overlayOpacity()).toEqual(["(default)"]);
  });
});

describe("a modal opened from inside a modal", () => {
  it("pushes the one underneath back and stops it taking clicks", () => {
    const view = render(
      <>
        <Surface slot="dialog-content" />
        <Surface slot="alert-dialog-content" />
      </>
    );

    const [under, over] = surfaces();
    expect(under.depth).toBe("1");
    expect(under.transform).toContain("scale(0.95)");
    expect(Number(under.opacity)).toBeLessThan(1);

    //The top card is presented exactly as it would be on its own.
    expect(over.depth).toBeNull();
    expect(over.transform).toBe("");

    view.unmount();
  });

  //THE CENTRING BUG, pinned. Tailwind v4 compiles `translate-x-[-50%]` to the standalone
  //CSS `translate` property, which COMPOSES with `transform`. An earlier version repeated
  //the -50% here and the dialog jumped to the top-left corner of the screen.
  it("never re-states the centring, which would double it", () => {
    render(
      <>
        <Surface slot="dialog-content" />
        <Surface slot="alert-dialog-content" />
      </>
    );

    expect(surfaces()[0].transform).not.toContain("-50%");
  });

  //Two stacked bg-black/50 overlays compose to 75%, three to 87%.
  it("lets only the topmost overlay darken the page", () => {
    render(
      <>
        <Surface slot="dialog-content" />
        <Surface slot="alert-dialog-content" />
      </>
    );

    expect(overlayOpacity()).toEqual(["0", "(default)"]);
  });

  it("recedes an edge-anchored drawer toward its own edge instead of the centre", () => {
    render(
      <>
        <Surface slot="drawer-content" />
        <Surface slot="alert-dialog-content" />
      </>
    );

    const under = surfaces()[0];
    expect(under.transform).toContain("scale(0.95)");
    //Down and out of the way, not up: a bottom drawer leaves by the bottom.
    expect(under.transform).toContain("translateY(10px)");
  });

  it("saturates rather than shrinking a fourth dialog into nothing", () => {
    render(
      <>
        <Surface slot="dialog-content" />
        <Surface slot="dialog-content" />
        <Surface slot="dialog-content" />
        <Surface slot="dialog-content" />
        <Surface slot="dialog-content" />
      </>
    );

    const depths = surfaces().map((s) => s.depth);
    expect(depths).toEqual(["4", "3", "2", "1", null]);
    //Depth 4 is styled the same as depth 3: the effect stops getting worse.
    const [deepest, next] = surfaces();
    expect(deepest.transform).toBe(next.transform);
  });
});

describe("when the top modal goes away", () => {
  //THE ONE THAT WAS STUCK. Radix leaves a dismissed surface in the document with
  //`data-state="closed"`, and a caller that renders its content unconditionally leaves it
  //there for good. Counting mounted nodes left the dialog underneath permanently receded
  //once a confirm had been opened even once.
  it("brings the one underneath fully forward, even though the closed node lingers", async () => {
    function Pair({ confirmOpen }: { confirmOpen: boolean }) {
      return (
        <>
          <Surface slot="dialog-content" />
          <Surface slot="alert-dialog-content" state={confirmOpen ? "open" : "closed"} />
        </>
      );
    }

    const view = render(<Pair confirmOpen />);
    expect(surfaces()[0].depth).toBe("1");

    view.rerender(<Pair confirmOpen={false} />);
    //The `data-state` flip is noticed by a MutationObserver, which delivers on a microtask.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const [under] = surfaces();
    expect(under.depth).toBeNull();
    expect(under.transform).toBe("");
    expect(under.opacity).toBe("");
    //And the surviving overlay paints again.
    expect(overlayOpacity()[0]).toBe("(default)");
  });

  it("restores the one underneath when the top unmounts entirely", async () => {
    function Pair({ withConfirm }: { withConfirm: boolean }) {
      return (
        <>
          <Surface slot="dialog-content" />
          {withConfirm && <Surface slot="alert-dialog-content" />}
        </>
      );
    }

    const view = render(<Pair withConfirm />);
    expect(surfaces()[0].depth).toBe("1");

    view.rerender(<Pair withConfirm={false} />);
    //React can null the ref before removing the node, so the pile settles a microtask later.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(surfaces()[0].depth).toBeNull();
  });
});
