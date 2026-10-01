import * as React from "react";

/** A second press this soon after the first is the second half of a double click. */
const DOUBLE_MS = 600;

/** Presses that start on a control inside a row belong to the control, never to the row. */
export const ROW_CONTROLS = "button, a, input, select, textarea, [role='menuitem'], [data-row-ignore], [data-drag-exempt]";

/**
 * Double click to open a record's own page, on rows whose single click opens a panel beside the
 * list (Tony, 2026-09-30).
 *
 * Not the browser's `dblclick`, and not the row's own second mousedown: the first click opens the
 * panel, and by the second press the list has narrowed (another element under the pointer) or the
 * panel holds the page inert (the press lands on <html>, and the row never hears it). So the FIRST
 * press remembers its row and listens on the whole document for the next press; a second press
 * within the double-click time opens THAT row's page wherever it lands, and the click that follows
 * it is swallowed so nothing that slid under the pointer fires too.
 *
 * `press` goes on each row's onMouseDown.
 */
export function useSecondPress<T>(open: (item: T) => void) {
  const openRef = React.useRef(open);
  openRef.current = open;
  const cleanup = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => cleanup.current?.(), []);

  const press = React.useCallback((item: T, e: React.MouseEvent) => {
    if (e.button !== 0 || e.detail > 1) return;
    const control = (e.target as HTMLElement).closest(ROW_CONTROLS);
    if (control && control !== e.currentTarget) return;
    cleanup.current?.();
    cleanup.current = armSecondPress(() => openRef.current(item));
  }, []);
  return { press };
}

/**
 * After a first press: the next press on the page, if it is the second of a double click, runs
 * `onDouble` and swallows its click. Returns the disarm.
 */
export function armSecondPress(onDouble: () => void): () => void {
  const at = Date.now();
  let swallow = false;
  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (e.detail >= 2 && Date.now() - at < DOUBLE_MS) {
      e.preventDefault();
      swallow = true;
      onDouble();
    }
    document.removeEventListener("mousedown", onDown, true);
    if (!swallow) disarm();
  };
  const onClick = (e: MouseEvent) => {
    if (!swallow) return;
    e.preventDefault();
    e.stopPropagation();
    disarm();
  };
  const timer = window.setTimeout(() => disarm(), DOUBLE_MS + 400);
  function disarm() {
    window.clearTimeout(timer);
    document.removeEventListener("mousedown", onDown, true);
    document.removeEventListener("click", onClick, true);
  }
  // Added while the first press is still dispatching: its capture pass on the document is over,
  // so it cannot count as the second. Not on a timer: the second press of a quick double click can
  // be handled before a timer runs.
  document.addEventListener("mousedown", onDown, true);
  document.addEventListener("click", onClick, true);
  return disarm;
}
