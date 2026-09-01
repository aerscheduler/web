import * as React from "react";

/**
 * Make a pile of modals look like a pile instead of a collision.
 *
 * WHY THIS EXISTS. A modal opened from inside another modal rendered as a second card
 * sitting flat on the first: both full size, both fully lit, and two `bg-black/50` overlays
 * composing into one near-opaque wall. It read as a rendering accident rather than as a
 * hierarchy, and it is not rare here. The close-out asks for a meter-anomaly confirm and
 * then a grounding confirm from inside the correction form, and voiding an invoice confirms
 * from inside a details dialog.
 *
 * So the topmost surface is presented normally and everything beneath it recedes, the way a
 * stack of cards does, with only the top overlay darkening. People already read that as
 * "this sits on top of that".
 *
 * ================================================================================
 * WHY THIS IS IMPERATIVE, WHICH IS NOT THE OBVIOUS CHOICE
 * ================================================================================
 *
 * Two React-shaped versions came first and both failed, in ways worth recording because the
 * next person will reach for them again.
 *
 * A MODULE-LEVEL ARRAY of open ids, with depth read from position in it. That is
 * bookkeeping, and bookkeeping drifts: one cleanup that does not run leaves an id behind
 * forever, and since depth counts from the end, a single stale entry pushes every later
 * modal back a step. Every dialog for the rest of the session then rendered shrunk and
 * translucent with no overlay, for no reason a reader could find.
 *
 * A SUBSCRIPTION (`useSyncExternalStore`) with depth read from the DOM. The store cannot
 * drift, but the notification does not reliably reach a surface in a DIFFERENT PORTAL in
 * time: the dialog underneath kept rendering at depth 0 after the alert above it had
 * mounted and was demonstrably later in document order. Verified in the browser, not
 * assumed.
 *
 * The thing being coordinated is not React state. It is the arrangement of sibling nodes
 * that React deliberately renders into separate trees. So the DOM is read and written
 * directly, once, whenever the pile changes. There is nothing to leak, nothing to notify,
 * and the result is correct even if a cleanup is skipped, because the next open or close
 * re-derives every surface from scratch.
 */

/** Scale/lift per step, capped: three deep is a mistake to fix, not a shape to design for. */
const MAX_STEP = 3;

/** Set on every registered surface, so it animates both back and forward. */
const TRANSITION = "transform 200ms ease, opacity 200ms ease";

//================================================================================
// POINTER EVENTS ARE RADIX'S, NOT OURS, AND TOUCHING THEM BRICKED EVERY MODAL
//================================================================================
//
// This file used to set `pointer-events: none` on a receded surface and
// `removeProperty("pointer-events")` on the way back, on the reasoning that "the pile is
// decoration; the top surface owns the interaction". Both halves were wrong, and the second
// was catastrophic.
//
// Radix's DismissableLayer already owns this property. It sets `pointer-events: none` on
// `document.body` while any modal layer is open and writes `pointer-events: auto` INLINE on
// the topmost layer's own node (react-dismissable-layer, `isPointerEventsEnabled ? "auto" :
// "none"`). So the blocking this file was trying to add already existed, correctly, one
// layer down.
//
// The damage was on the return. Removing the property deleted RADIX'S `auto`, React had no
// reason to re-render that node's style, and the content is a child of `<body>` through a
// portal, so it inherited the body's `none`. The result was a modal that looked completely
// normal, full size and fully lit with its overlay restored, and could not be clicked
// again for the rest of its life: not its buttons, not its fields, not its close X. The
// only way out was Escape or an overlay click, abandoning whatever had been typed.
//
// Found by adversarial review with a measured control: an unregistered Sheet put through
// the identical sequence stayed alive, and only registered surfaces bricked. Every flow
// that raises a confirm from inside its own modal was affected, including the two this
// mechanism was written for.
//
// So: this file styles appearance only. It never writes `pointer-events`.
//================================================================================

function stepFor(depth: number): number {
  return Math.min(depth, MAX_STEP);
}

/**
 * Re-derive every open surface's appearance from the document.
 *
 * Document order is mount order for portalled surfaces, so the LAST match is the top of the
 * pile. Everything before it recedes by how far from the top it sits.
 */
/** Which edge each sheet side is pinned to, so it recedes toward its own border. */
const SHEET_ORIGIN: Record<string, string> = {
  right: "right center",
  left: "left center",
  top: "center top",
  bottom: "center bottom",
};

function restack(): void {
  if (typeof document === "undefined") return;

  //OPEN ONES ONLY, and this is load-bearing rather than tidy. Radix keeps a surface's
  //element in the document while it animates out, and some callers (ConfirmProvider renders
  //its AlertDialogContent unconditionally) leave it there indefinitely with
  //`data-state="closed"`. Counting mounted nodes therefore left the dialog underneath
  //permanently receded once a confirm had been opened even once, which looked exactly like
  //the bug this file exists to fix.
  const surfaces = Array.from(document.querySelectorAll<HTMLElement>("[data-modal-id]")).filter(
    (el) => el.getAttribute("data-state") !== "closed"
  );
  const top = surfaces.length - 1;

  surfaces.forEach((el, index) => {
    const depth = top - index;
    const step = stepFor(depth);

    if (depth <= 0) {
      //A SURFACE THAT NEVER RECEDED IS NOT OURS TO TIDY.
      //
      //This branch used to run on every top surface, including one that had opened alone
      //and never had a thing written to it. That meant clearing a `transform` and writing a
      //`transition` we did not put there, on somebody else's element. Vaul owns both on a
      //drawer: it holds the drag position in an inline `transform` (a resting drawer's is
      //`translate3d(0,0,0)`, which is why this looked harmless, but a `snapPoints` drawer
      //parks at a real offset), and its own 500ms curve was being overwritten by our 200ms
      //one on a drawer that had never been part of a stack.
      //
      //`data-modal-depth` is the record of having touched it, so its absence is the answer.
      //Exactly the mistake that made the `pointer-events` bug: reaching for a property to
      //restore it, on a surface whose current value was never ours.
      if (!el.hasAttribute("data-modal-depth")) return;

      //Back to whatever the stylesheet says. Clearing rather than writing "none" matters:
      //these surfaces are centred by Tailwind translate utilities, and an inline
      //`transform: none` would beat them and drop the dialog into the corner.
      //
      //`transition` is set rather than cleared, so coming FORWARD animates the same way
      //going back did. Clearing it made the return instant and left the property behind
      //anyway on any surface that had ever receded.
      el.style.removeProperty("transform");
      el.style.removeProperty("transform-origin");
      el.style.removeProperty("opacity");

      //A DRAWER GETS ITS TRANSFORM AND ITS CURVE BACK FROM VAUL, NOT FROM US.
      //
      //The guard above only spares a drawer that never receded. One that DID receded and
      //came forward still had our 200ms `transition` written onto it and left there, beating
      //vaul's own 500ms close curve from the stylesheet, and this is the live path rather
      //than a corner: `ResponsiveModal` renders a Drawer on phones, the correct-times sheet
      //IS a ResponsiveModal, and it raises a confirm for METER_ANOMALY and
      //MAINTENANCE_TRIGGER. Vaul rewrites `transform` on every drag frame so it recovers
      //there, but nothing makes it rewrite `transition`.
      //
      //So for a drawer we clear and hand it back rather than leaving our own value behind.
      //Same lesson as the `pointer-events` bug in the header: the property was never ours,
      //and "restore it to what we think it should be" is how that bug happened.
      if (el.getAttribute("data-slot") === "drawer-content") {
        el.style.removeProperty("transition");
      } else {
        el.style.transition = TRANSITION;
      }

      el.removeAttribute("data-modal-depth");
      return;
    }

    //DO NOT RE-STATE THE CENTRING HERE. These dialogs are centred by Tailwind v4's
    //`translate-x-[-50%] translate-y-[-50%]`, which compile to the standalone CSS
    //`translate` property, NOT into `transform`. The two compose, so an inline
    //`transform: translate(-50%, -50%) ...` adds a SECOND -50% on top of the first and
    //throws the dialog into the top-left corner. Measured: computed transform came back as
    //`matrix(0.95, 0, 0, 0.95, -256, -264.9)` beside `translate: -50% -50%`.
    //
    //So `transform` carries only the receding, and the existing `translate` goes on doing
    //the centring untouched. A drawer is pinned to an edge, has no centring to preserve,
    //and recedes toward the edge it is attached to instead.
    const slot = el.getAttribute("data-slot");
    const isDrawer = slot === "drawer-content";
    const isSheet = slot === "sheet-content";

    if (isDrawer) {
      el.style.transform = `scale(${1 - step * 0.05}) translateY(${step * 10}px)`;
      el.style.transformOrigin = "bottom center";
    } else if (isSheet) {
      //A SHEET IS PINNED TO A SIDE, usually the right, and it is what every detail panel in
      //the console is built from. It recedes by scaling toward the edge it is attached to,
      //the same idea as the drawer, so it does not drift away from its own border.
      //
      //Scale ONLY, no translate: a sheet animates itself in and out with a slide, and our
      //own offset would fight that animation on open and close.
      //THE PINNED EDGE COMES FROM THE SHEET, not from reading its class list. Sniffing for
      //`left-0` answered "right center" for BOTH a top and a bottom sheet, because neither
      //carries that class: a top sheet then receded 6px off the top of the screen while
      //staying welded to the right, which is precisely what the paragraph above forbids.
      //Any caller className containing `left-0` flipped a right sheet too. `SheetContent`
      //knows its own side and now says so in `data-modal-side`.
      el.style.transform = `scale(${1 - step * 0.03})`;
      el.style.transformOrigin = SHEET_ORIGIN[el.getAttribute("data-modal-side") ?? "right"] ?? "right center";
    } else {
      el.style.transform = `scale(${1 - step * 0.05}) translateY(${-step * 12}px)`;
      el.style.transformOrigin = "center";
    }

    //Fading rather than `filter: brightness()`, which drags every child including text and
    //images with it and reads as a broken theme in dark mode.
    el.style.opacity = String(1 - step * 0.15);
    el.style.transition = TRANSITION;
    el.setAttribute("data-modal-depth", String(depth));
  });

  //Two stacked `bg-black/50` overlays compose to 75%, three to 87%, so a second confirm all
  //but blacked the screen out. Only the top one paints. The rest stay mounted, because each
  //still traps focus and catches the outside-click that closes its own surface.
  const overlays = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-slot="dialog-overlay"],[data-slot="alert-dialog-overlay"],[data-slot="drawer-overlay"],[data-slot="sheet-overlay"]'
    )
  ).filter((el) => el.getAttribute("data-state") !== "closed");
  overlays.forEach((el, index) => {
    if (index === overlays.length - 1) {
      el.style.removeProperty("opacity");
    } else {
      el.style.opacity = "0";
    }
    el.style.transition = "opacity 200ms ease";
  });
}

/**
 * Re-derive the pile whenever a surface opens or closes.
 *
 * The ref callbacks below fire when an element enters or leaves the document, which covers
 * most of it. They do NOT cover a surface that stays mounted and merely flips
 * `data-state` from open to closed, which is what Radix does for a dismissed confirm whose
 * component is rendered unconditionally: the element sits there, closed, forever, and
 * nothing would ever tell the dialog underneath to come forward again.
 *
 * One observer, on one attribute, for the life of the page. Cheaper than the alternative,
 * which is every surface polling.
 */
let observer: MutationObserver | null = null;

function ensureObserver() {
  if (observer || typeof document === "undefined" || typeof MutationObserver === "undefined") return;

  observer = new MutationObserver((records) => {
    for (const record of records) {
      if ((record.target as HTMLElement).hasAttribute?.("data-modal-id")) {
        restack();
        return;
      }
    }
  });

  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["data-state"],
  });
}

let nextId = 1;

/**
 * Stamp this surface so the pile can see it, and re-derive the pile as it comes and goes.
 *
 * Returns an id to render as `data-modal-id` and a REF to attach to the surface element.
 * Both are required: the attribute is the registration, and the ref is the signal.
 *
 * ================================================================================
 * WHY A REF CALLBACK AND NOT AN EFFECT
 * ================================================================================
 *
 * The obvious version puts `restack()` in a mount effect. It does not work, and the reason
 * is worth writing down because the code looks correct.
 *
 * A component like `ConfirmProvider` renders its `<AlertDialogContent>` unconditionally and
 * lets Radix decide whether to put it in the document. So the React component mounts ONCE,
 * when the app starts, with `open` false and no element on screen. A mount effect therefore
 * fires exactly once, at a moment when there is no pile, and never again, no matter how
 * many times the dialog is subsequently opened. The surface underneath stayed at full size
 * forever and the second overlay went on double-darkening the page.
 *
 * A ref callback fires when the ELEMENT enters and leaves the document, which is the event
 * that actually matters here, and it fires for every open rather than once per component.
 */
export function useModalId(
  /**
   * A ref the CALLER passed through. Composed rather than replaced.
   *
   * Under React 19 `ref` is an ordinary prop, so `<Content ref={ours} {...props} />` lets a
   * caller's ref silently win and drop ours, disabling the whole mechanism for that surface.
   * No caller passes one today, which makes this a footgun rather than a live defect, and a
   * footgun in a shared primitive is worth ten lines.
   */
  forwarded?: React.Ref<HTMLElement>
): { id: number; ref: (node: HTMLElement | null) => void } {
  const idRef = React.useRef<number | null>(null);
  if (idRef.current === null) idRef.current = nextId++;

  //READ THE CURRENT FORWARDED REF, KEEP A STABLE CALLBACK. The callback closed over
  //`forwarded` with an empty dep list, so a caller passing an inline arrow, which is the
  //common form, was handed the first render's closure for ever. Adding it to the deps
  //instead would change the callback's identity every render, and React detaches and
  //reattaches a ref whose identity changed, so every render would tear the surface out of
  //the pile and restack twice. A ref box gets both: one callback, always current.
  const forwardedRef = React.useRef(forwarded);
  forwardedRef.current = forwarded;

  const ref = React.useCallback((node: HTMLElement | null) => {
    //Hand the node on first, so a caller that needs it is never starved by our own work.
    const target = forwardedRef.current;
    if (typeof target === "function") {
      target(node);
    } else if (target && typeof target === "object") {
      (target as React.MutableRefObject<HTMLElement | null>).current = node;
    }

    if (node) {
      //The node is in the document by the time a ref callback runs, so the pile is complete
      //and this can be derived immediately, before paint. No frame where a modal shows
      //itself at full size and then jumps backward.
      ensureObserver();
      restack();
      return;
    }
    //On detach, React may call this BEFORE it removes the node, so an immediate pass can
    //still count the departing surface. Run now for the case where it has already gone, and
    //again on the next microtask for the case where it has not.
    restack();
    queueMicrotask(restack);
  }, []);

  return { id: idRef.current, ref };
}
