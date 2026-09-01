// @vitest-environment jsdom
import { render, screen, act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { AlertDialog, AlertDialogContent, AlertDialogTitle } from "./alert-dialog";
import { Sheet, SheetContent, SheetTitle } from "./sheet";
import { Drawer, DrawerContent, DrawerTitle } from "./drawer";

/**
 * THE SAME BEHAVIOUR, THROUGH THE REAL PRIMITIVES.
 *
 * `modal-stack.test.tsx` next door uses a hand-rolled stand-in, which is fine for the
 * arithmetic and useless for the thing that actually broke. Radix's DismissableLayer sets
 * `document.body { pointer-events: none }` while a modal layer is open and writes
 * `pointer-events: auto` inline on the topmost layer. The stand-in has none of that, so a
 * bug that deleted Radix's `auto` and left every modal permanently dead to the mouse passed
 * the suite, and the suite even asserted the broken value as correct.
 *
 * So these render actual Dialogs, AlertDialogs and Sheets. Slower, and the only place the
 * interaction contract can be pinned at all.
 */

const surfaces = () => Array.from(document.querySelectorAll<HTMLElement>("[data-modal-id]"));

const openOnes = () => surfaces().filter((el) => el.getAttribute("data-state") !== "closed");

afterEach(() => {
  document.body.innerHTML = "";
  document.body.style.removeProperty("pointer-events");
});

describe("a modal on its own, through the real primitive", () => {
  it("keeps the pointer-events Radix gave it", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Alone</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const [dialog] = openOnes();
    //Radix marks the top layer interactive while it has disabled the body. Whatever it
    //chose, this file must not have removed it.
    if (document.body.style.pointerEvents === "none") {
      expect(dialog.style.pointerEvents).toBe("auto");
    }
    expect(dialog.getAttribute("data-modal-depth")).toBeNull();
  });
});

describe("a confirm raised over a modal, then dismissed", () => {
  //THE BUG THAT BRICKED EVERY MODAL. Setting pointer-events on the way down and REMOVING it
  //on the way back deleted a value Radix owns. The surface came back looking perfect and
  //could never be clicked again: not its buttons, not its fields, not its close X.
  it("leaves the modal underneath clickable again", () => {
    function Stack({ confirming }: { confirming: boolean }) {
      return (
        <>
          <Dialog open>
            <DialogContent>
              <DialogTitle>Underneath</DialogTitle>
              <button type="button">Save</button>
            </DialogContent>
          </Dialog>
          <AlertDialog open={confirming}>
            <AlertDialogContent>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            </AlertDialogContent>
          </AlertDialog>
        </>
      );
    }

    const view = render(<Stack confirming />);
    const under = openOnes()[0];
    expect(under.getAttribute("data-modal-depth")).toBe("1");

    act(() => {
      view.rerender(<Stack confirming={false} />);
    });

    //Fully forward again...
    expect(under.getAttribute("data-modal-depth")).toBeNull();
    expect(under.style.transform).toBe("");

    //...and, the part that matters, still able to take a click. This file must never leave
    //an inline `pointer-events` of its own behind, in either direction.
    expect(under.style.pointerEvents).not.toBe("none");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save.isConnected).toBe(true);
  });

  //A VALUE-BASED ASSERTION CANNOT TELL WHOSE `none` IT IS. Radix legitimately writes
  //`pointer-events: none` on every layer below the top one, so seeing it on a receded
  //surface proves nothing. The invariant that actually matters is about authorship: this
  //file must not touch the property at all, in either direction, because Radix has no
  //reason to write it again once we have removed it.
  //
  //So it is asserted on the ARTEFACT: after a surface has receded and come back, Radix's
  //own inline `pointer-events: auto` must still be sitting on it while the body is still
  //`none`. That is the exact state the bug destroyed, and it holds whatever route the code
  //takes to destroy it.
  //
  //The first version of this test read the source instead and asserted it contained neither
  //"pointerEvents" nor "pointer-events". That is defeatable, and not by anything exotic:
  //`el.style.cssText = "transform: ..."` reintroduces the bug verbatim and contains neither
  //string, and so do `removeAttribute("style")` and a helper imported from a sibling file.
  //The first two are the natural shape of a "tidy up the property writes" refactor, which
  //is the change most likely to bring this back.
  //
  //The source check is kept underneath as a cheap tripwire, but it is no longer the guard.
  it("leaves Radix's pointer-events intact after receding and returning", async () => {
    const { rerender } = render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Under</DialogTitle>
          <button>Save</button>
        </DialogContent>
      </Dialog>
    );

    const under = document.querySelector<HTMLElement>('[data-slot="dialog-content"]')!;
    const before = under.getAttribute("style") ?? "";
    expect(before).toContain("pointer-events");

    //Raise a confirm over it, then dismiss it. The return trip is where the property was
    //being deleted.
    rerender(
      <>
        <Dialog open>
          <DialogContent>
            <DialogTitle>Under</DialogTitle>
            <button>Save</button>
          </DialogContent>
        </Dialog>
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogTitle>Over</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
    await waitFor(() => expect(under.getAttribute("data-modal-depth")).toBe("1"));

    rerender(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Under</DialogTitle>
          <button>Save</button>
        </DialogContent>
      </Dialog>
    );
    await waitFor(() => expect(under.getAttribute("data-modal-depth")).toBeNull());

    //Radix's authorship, still there. Written as the inline attribute rather than the
    //computed value on purpose: jsdom computes nothing useful here, and the inline value is
    //what the bug actually deleted.
    expect(under.getAttribute("style") ?? "").toContain("pointer-events");
  });

  it("does not name pointer-events anywhere in modal-stack.ts", async () => {
    const source = await import("./modal-stack.ts?raw").then((m) => m.default as string);
    const code = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");

    expect(code).not.toContain("pointerEvents");
    expect(code).not.toContain("pointer-events");
    //`cssText` and `removeAttribute("style")` both wipe Radix's value while naming neither
    //token, so they are named here too. The behavioural test above is the real guard.
    expect(code).not.toContain("cssText");
    expect(code).not.toContain('removeAttribute("style")');
  });
});

describe("a Sheet", () => {
  //MISSED ON THE FIRST PASS, and a Sheet is what every detail panel in the console is built
  //from, so the two-overlay wall was still live on the reservation, invoice, squawk, audit
  //and ledger panels.
  it("is registered, and recedes under a confirm", () => {
    render(
      <>
        <Sheet open>
          <SheetContent>
            <SheetTitle>Detail</SheetTitle>
          </SheetContent>
        </Sheet>
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogTitle>Void this invoice?</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );

    const sheet = openOnes().find((el) => el.getAttribute("data-slot") === "sheet-content");
    expect(sheet).toBeDefined();
    expect(sheet!.getAttribute("data-modal-depth")).toBe("1");
    //Scaled toward its own edge, not dragged toward the middle of the screen.
    expect(sheet!.style.transform).toContain("scale(");
    expect(sheet!.style.transform).not.toContain("translateY");
  });

  it("stops its overlay double-darkening the page", () => {
    render(
      <>
        <Sheet open>
          <SheetContent>
            <SheetTitle>Detail</SheetTitle>
          </SheetContent>
        </Sheet>
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogTitle>Void this invoice?</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );

    const overlays = Array.from(
      document.querySelectorAll<HTMLElement>('[data-slot$="-overlay"]')
    ).filter((el) => el.getAttribute("data-state") !== "closed");

    expect(overlays.length).toBeGreaterThan(1);
    //Every one but the last is silenced.
    expect(overlays.slice(0, -1).every((el) => el.style.opacity === "0")).toBe(true);
    expect(overlays[overlays.length - 1].style.opacity).not.toBe("0");
  });
});

describe("a drawer coming back to the front", () => {
  //VAUL OWNS A DRAWER'S TRANSFORM AND ITS CURVE. The depth-0 branch spares a drawer that
  //never receded, but one that DID receded was still left carrying our 200ms transition,
  //which beats vaul's own 500ms close curve from the stylesheet. This is the live path on a
  //phone: ResponsiveModal renders a Drawer, the correct-times sheet is one, and it raises a
  //confirm for METER_ANOMALY and MAINTENANCE_TRIGGER.
  it("is handed back its own transition rather than keeping ours", async () => {
    const { rerender } = render(
      <Drawer open>
        <DrawerContent>
          <DrawerTitle>Correct times</DrawerTitle>
        </DrawerContent>
      </Drawer>
    );

    const drawer = document.querySelector<HTMLElement>('[data-slot="drawer-content"]')!;

    rerender(
      <>
        <Drawer open>
          <DrawerContent>
            <DrawerTitle>Correct times</DrawerTitle>
          </DrawerContent>
        </Drawer>
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogTitle>This will ground the aircraft</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
    await waitFor(() => expect(drawer.getAttribute("data-modal-depth")).toBe("1"));
    expect(drawer.style.transform).toContain("scale");

    rerender(
      <Drawer open>
        <DrawerContent>
          <DrawerTitle>Correct times</DrawerTitle>
        </DrawerContent>
      </Drawer>
    );
    await waitFor(() => expect(drawer.getAttribute("data-modal-depth")).toBeNull());

    //Everything we wrote is gone, including the transition.
    expect(drawer.style.transform).toBe("");
    expect(drawer.style.transition).toBe("");
    expect(drawer.style.opacity).toBe("");
  });
});

describe("a sheet's pinned edge", () => {
  //A SHEET RECEDES TOWARD THE EDGE IT IS ATTACHED TO, or it drifts off its own border. The
  //side used to be sniffed out of the class list by looking for `left-0`, which neither a
  //top nor a bottom sheet carries, so both were receded about `right center`: measured in a
  //real browser, a top sheet dropped 6px off the top of the screen and pulled 38px in from
  //the left while staying welded to the right.
  it.each([
    ["right", "right center"],
    ["left", "left center"],
    ["top", "center top"],
    ["bottom", "center bottom"],
  ] as const)("recedes about its own edge: %s", async (side, origin) => {
    const { rerender } = render(
      <Sheet open>
        <SheetContent side={side}>
          <SheetTitle>Panel</SheetTitle>
        </SheetContent>
      </Sheet>
    );

    const sheet = document.querySelector<HTMLElement>('[data-slot="sheet-content"]')!;

    rerender(
      <>
        <Sheet open>
          <SheetContent side={side}>
            <SheetTitle>Panel</SheetTitle>
          </SheetContent>
        </Sheet>
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogTitle>Void this invoice?</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );

    await waitFor(() => expect(sheet.getAttribute("data-modal-depth")).toBe("1"));
    expect(sheet.style.transformOrigin).toBe(origin);
  });
});

describe("a caller's own ref", () => {
  //Under React 19 `ref` is an ordinary prop, so ours and theirs compete. Both must land.
  //
  //THE FIRST VERSION OF THIS TEST PASSED WHILE THE MECHANISM WAS DEAD. It asserted that the
  //caller's ref fired and that `data-modal-id` was set, and neither is evidence: the
  //caller's ref fired precisely BECAUSE it had won and replaced ours, and JSX writes
  //`data-modal-id` whatever happens to the ref. With `{...props}` spread after
  //`ref={modalRef}`, the caller's ref silently displaced ours, the surface never registered,
  //and nothing beneath it receded, which is the whole point of the file.
  //
  //So the assertion is now the EFFECT: with a caller ref attached to the surface on top,
  //the surface underneath must still recede.
  it("does not stop the surface registering", async () => {
    let seen: HTMLElement | null = null;

    const { rerender } = render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Under</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const under = document.querySelector<HTMLElement>('[data-slot="dialog-content"]')!;

    rerender(
      <>
        <Dialog open>
          <DialogContent>
            <DialogTitle>Under</DialogTitle>
          </DialogContent>
        </Dialog>
        <AlertDialog open>
          <AlertDialogContent ref={(node: HTMLElement | null) => { seen = node; }}>
            <AlertDialogTitle>Composed</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );

    //Theirs landed.
    await waitFor(() => expect(seen).not.toBeNull());
    //And so did ours: the dialog underneath actually receded.
    await waitFor(() => expect(under.getAttribute("data-modal-depth")).toBe("1"));
    expect(under.style.transform).toContain("scale");
  });
});
