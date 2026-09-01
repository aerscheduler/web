/**
 * Take the person to the field that stopped their submit.
 *
 * Every validate-on-submit form in the console renders its complaint inline and leaves
 * the page exactly where it was. On a short form that reads fine. On a tall one inside a
 * scrolling dialog it is a dead button: the aircraft form is ~995px of content in a 503px
 * window, so a school owner who missed only "Home base" clicked Add aircraft eleven times
 * in ninety seconds and rage-clicked it, because every single thing the form had to say
 * was five hundred pixels below the fold.
 *
 * Sixteen call sites had each hand-rolled half of the answer, `getElementById(id).focus()`
 * against a per-form table of ids, and not one of them scrolled. Two had already grown
 * `?.querySelector("button")` patches because the id landed on a wrapper instead of
 * something focusable. That is a convention failing in the open, so this replaces it with
 * one delegated listener and no per-form code at all.
 *
 * The signal is `aria-invalid`, which is the same thing `interaction-tracking.ts` counts to
 * report `form_validation_failed`, and the same attribute shadcn's field styling keys on. So
 * a field that is marked correctly is highlighted, scrolled to, focused, and measured for
 * free, and a field that is not marked is invisible to all four. That is the one rule worth
 * enforcing: set `aria-invalid` whenever you render an error message.
 */

/** Focusable in practice, ignoring anything disabled or deliberately removed from the order. */
const FOCUSABLE =
  'input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function isFocusable(el: Element): boolean {
  return el.matches(FOCUSABLE) && !el.matches("[disabled]") && !el.matches('[tabindex="-1"]');
}

/**
 * The thing to actually put the cursor in.
 *
 * `aria-invalid` usually sits on the control itself, but composite fields put it on a
 * trigger or a wrapper, so fall through to the first focusable descendant rather than
 * focusing nothing, which is the exact failure the per-form `querySelector("button")`
 * patches existed to work around.
 */
function focusTarget(invalid: Element): HTMLElement | null {
  if (invalid instanceof HTMLElement && isFocusable(invalid)) return invalid;
  const inner = [...invalid.querySelectorAll(FOCUSABLE)].find(isFocusable);
  return inner instanceof HTMLElement ? inner : null;
}

/**
 * Scroll the field into view and focus it.
 *
 * INSTANT, NOT SMOOTH, AND NOT BY PREFERENCE.
 *
 * `behavior: "smooth"` silently does nothing inside a dialog: Radix wraps its content in
 * react-remove-scroll to lock the page behind it, and that cancels the queued animation
 * every frame, so the container never moves. Measured on the aircraft form, smooth left
 * scrollTop at 0 while auto moved the full 492px to the same element. Every tall form in
 * the console is in a dialog, so smooth would have failed in exactly the case this exists
 * for, and failed invisibly. Instant is also the right answer on its own merits: this is
 * a jump to the thing blocking you, not a scenic tour, and it needs no reduced-motion
 * branch because it already respects it.
 *
 * `preventScroll` on the focus because focus() does its own jump to `nearest`, which would
 * undo the centering we just did. Centering rather than `nearest` so the error message
 * underneath the field is on screen too, which is the whole point.
 */
function reveal(invalid: Element): void {
  invalid.scrollIntoView({ block: "center", behavior: "auto" });
  focusTarget(invalid)?.focus({ preventScroll: true });
}

/**
 * The first invalid field inside this form, in document order.
 *
 * Scoped to the submitted form so a stale error elsewhere on the page (another dialog in
 * the stack, a filter bar) cannot steal the jump. Falls back to a document-wide look for
 * the forms that portal a field out of their own subtree.
 */
function firstInvalid(form: Element): Element | null {
  return (
    form.querySelector("[aria-invalid='true']") ??
    document.querySelector("[aria-invalid='true']")
  );
}

let wired = false;

/**
 * Attach the listener. Idempotent.
 *
 * Capture phase for the same reason `interaction-tracking.ts` gives: handlers in the
 * console call `stopPropagation`, and a bubble-phase listener would miss exactly the
 * forms that do the most work.
 *
 * Validation is state set during the submit handler, so it is not in the DOM yet when
 * this fires. One animation frame covers React's paint; the 250ms retry covers a form
 * that validates behind an await, and matches the delay the tracking module already
 * settled on. Whichever finds a field first wins and the other is a no-op.
 */
export function startFormFocus(): void {
  if (wired || typeof document === "undefined") return;
  wired = true;

  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof Element)) return;

      let done = false;
      const attempt = () => {
        if (done) return;
        const invalid = firstInvalid(form);
        if (!invalid) return;
        done = true;
        reveal(invalid);
      };

      requestAnimationFrame(attempt);
      setTimeout(attempt, 250);
    },
    true
  );
}
