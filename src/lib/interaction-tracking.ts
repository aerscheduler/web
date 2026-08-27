/**
 * Delegated UI instrumentation for the console.
 *
 * ## Why this exists
 *
 * PostHog's `autocapture` was already on, and it was already failing at the two
 * questions worth asking. Over one 30-day window on `app.aerscheduler.com`:
 *
 *  - 1,257 of ~2,900 captured clicks carried NO text at all. Those are the icon
 *    buttons, which is most of the toolbar, every table row action and every close
 *    control, so the busiest half of the console was recorded as an anonymous click.
 *  - 174 of 304 `change` events collapsed to the SAME element chain,
 *    `input.aria-invalid:border-destructive…`, because every field in the console is
 *    the same shadcn component with the same Tailwind classes. "Which fields do
 *    people type into" was not a hard query, it was an unanswerable one.
 *
 * The obvious fix, hand-labelling 501 `<Button>`s and 618 fields, is a fix that rots:
 * the next feature ships unlabelled and nobody notices, exactly the way an unnamed
 * route silently broke `$screen` on mobile for the life of the app. So this listens
 * once at the document instead, and derives a label from what the markup already has
 * to carry for accessibility. New features are covered without being asked, which is
 * the same bargain `api.raw` makes for writes in `lib/api.ts`.
 *
 * ## What it reports
 *
 *   ui_click       every activation of a control, with a stable label and its context
 *   field_focus    first time a person puts the cursor in a field, once per visit
 *   field_changed  a field that actually received input (never the input itself)
 *   form_submitted a form that made it to submit, with how many fields were touched
 *   form_abandoned a form touched and left, WITH THE LAST FIELD TOUCHED
 *
 * `form_abandoned.last_field` is the one to look at first. It is the closest thing
 * the console has to a person saying which question made them give up.
 *
 * ## Values never leave the browser
 *
 * Same rule as `describeFilters` in `analytics.ts`: identity yes, content no. A field
 * reports its NAME and whether it ended up non-empty, never what was typed. Labels
 * are taken from `aria-label`, `.sr-only` text, `<label for>` and lucide icon names,
 * all of which are static strings the app itself ships.
 *
 * Visible text is accepted as a last resort but sanitised, because in this product the
 * visible text is frequently a customer: table bodies hold student names, emails and
 * tail numbers. Anything inside a table row reports as the row rather than its
 * contents, and anything that looks like an address, a phone number or a person is
 * replaced with a placeholder. When in doubt this reports less.
 */

import { normalizePath, track } from "./analytics";

function currentPath(): string {
  return normalizePath(window.location.pathname);
}

// ---------------------------------------------------------------- redaction

/** Caps a label before it is reported. Longer than this is prose, not a control. */
const MAX_LABEL = 60;

/**
 * Text that is somebody's data rather than the app's own wording.
 *
 * Deliberately eager. A false positive costs one `<redacted>` in a chart; a false
 * negative puts a customer's email address in a third-party analytics tool.
 */
const LOOKS_PERSONAL = [
  /\S+@\S+/, //           email
  /\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}/, // phone
  /\bN\d{1,5}[A-Z]{0,2}\b/, // US tail number
  /\d{1,5}\s+\w+\s+(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd)\b/i,
];

/** React's `useId` output, which is unique per render and useless as a name. */
const GENERATED_ID = /[«»:]|^r[0-9a-z]+$|^radix-/i;

function cleanText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length > MAX_LABEL) return null;
  if (LOOKS_PERSONAL.some((pattern) => pattern.test(text))) return "<redacted>";
  return text;
}

// ---------------------------------------------------------------- labels

/** Controls worth reporting a click on, most specific first. */
const CONTROL_SELECTOR = [
  "[data-track]",
  "button",
  "a[href]",
  "summary",
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="combobox"]',
  '[role="link"]',
].join(",");

/**
 * The lucide icon inside a control, as its name.
 *
 * This is the single line that rescues the 1,257 anonymous clicks. lucide-react
 * renders `<svg class="lucide lucide-trash-2">`, so an icon-only button that carries
 * no text and no `aria-label` still says what it is: `icon:trash-2`. It reads
 * differently from a real label on purpose, so a chart shows at a glance which
 * controls are getting by on their icon alone and ought to be given an `aria-label`.
 */
function iconName(element: Element): string | null {
  const svg = element.querySelector("svg[class*='lucide-']");
  const match = svg?.getAttribute("class")?.match(/lucide-([a-z0-9-]+)/i);
  return match ? `icon:${match[1]}` : null;
}

function labelledByText(element: Element): string | null {
  const id = element.getAttribute("aria-labelledby");
  if (!id) return null;
  const target = document.getElementById(id.split(/\s+/)[0]);
  return cleanText(target?.textContent);
}

/**
 * A stable name for a control.
 *
 * The cascade runs safest-first: everything above `textContent` is a string the app
 * itself authored, so it can never be a customer.
 */
export function controlLabel(element: Element): string {
  const explicit = element.getAttribute("data-track");
  if (explicit) return explicit;

  const aria = cleanText(element.getAttribute("aria-label"));
  if (aria) return aria;

  const labelled = labelledByText(element);
  if (labelled) return labelled;

  // shadcn's convention for naming an icon button to screen readers.
  const srOnly = cleanText(element.querySelector(".sr-only")?.textContent);
  if (srOnly) return srOnly;

  // Inside a table body the visible text is the DATA, not the control: a student's
  // name, an email, a tail number. Report the row, never what is in it.
  if (element.closest("tbody, [role='row']")) {
    return iconName(element) ?? "row";
  }

  const text = cleanText(element.textContent);
  // A link named after its destination beats a link named `<redacted>`. Card and
  // cell links are labelled with the record itself, a tail number or a student, so the
  // redaction above is right to fire and would otherwise throw away the fact that
  // somebody opened an aircraft at all. The href says that safely, and in the same
  // `:id` shape as every path here.
  if ((!text || text === "<redacted>") && element.tagName === "A") {
    const href = element.getAttribute("href");
    if (href?.startsWith("/")) return `→ ${normalizePath(href.split("?")[0])}`;
  }
  if (text) return text;

  const title = cleanText(element.getAttribute("title"));
  if (title) return title;

  const icon = iconName(element);
  if (icon) return icon;

  const name = element.getAttribute("name");
  if (name && !GENERATED_ID.test(name)) return name;

  return `<unlabelled ${element.tagName.toLowerCase()}>`;
}

/**
 * Where the control was, which is what makes an ambiguous label usable.
 *
 * "Delete", "Cancel", "Add" and "Done" are each among the most-clicked labels in the
 * console and each appears on a dozen different screens. Path plus context turns them
 * back into distinct controls.
 */
export function controlContext(element: Element): string {
  const dialog = element.closest('[role="dialog"], [role="alertdialog"]');
  if (dialog) {
    const heading = cleanText(
      dialog.querySelector("[data-slot='dialog-title'], [data-slot='sheet-title'], h1, h2")
        ?.textContent
    );
    return heading ? `dialog:${heading}` : "dialog";
  }
  if (element.closest('[role="menu"], [data-slot="dropdown-menu-content"]')) return "menu";
  if (element.closest("thead")) return "table-header";
  if (element.closest("tbody, [role='row']")) return "table-row";
  if (element.closest("nav, [data-slot='sidebar']")) return "nav";
  if (element.closest("form")) return "form";
  return "page";
}

/**
 * What KIND of control it is, so tabs can be separated from buttons in a chart.
 *
 * The `submit` case is narrower than it looks. A `<button>` with no `type` is a SUBMIT
 * button per the HTML spec, and shadcn's `Button` sets no type, so reading `.type`
 * alone reports essentially every control in the console as a submit and the
 * distinction stops meaning anything. Only a button that is actually inside a form can
 * submit one, so that is the test.
 */
function controlKind(element: Element): string {
  const role = element.getAttribute("role");
  if (role) return role;
  const tag = element.tagName.toLowerCase();
  if (tag === "a") return "link";
  if (tag === "button") {
    const submits =
      (element as HTMLButtonElement).type === "submit" && element.closest("form") !== null;
    return submits ? "submit" : "button";
  }
  return tag;
}

// ---------------------------------------------------------------- fields

const FIELD_SELECTOR = "input, textarea, select, [contenteditable='true']";

/** Fields whose very presence is sensitive; counted, never named further. */
const SECRET_TYPES = new Set(["password", "hidden"]);

/**
 * A stable name for a field.
 *
 * `<label for>` is the workhorse: the console uses it 254 times, so most fields can be
 * named from the same markup that makes them accessible. `name` and `id` come first
 * where they exist, but React's `useId` values are filtered out because they change
 * every render and would produce one chart row per page load.
 */
export function fieldName(element: Element): string {
  const explicit = element.getAttribute("data-track");
  if (explicit) return explicit;

  const name = element.getAttribute("name");
  if (name && !GENERATED_ID.test(name)) return name;

  const id = element.getAttribute("id");
  if (id && !GENERATED_ID.test(id)) return id;

  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    const text = cleanText(label?.textContent);
    if (text) return text;
  }

  const wrapping = cleanText(element.closest("label")?.textContent);
  if (wrapping) return wrapping;

  const group = groupLabel(element);
  if (group) return group;

  const aria = cleanText(element.getAttribute("aria-label")) ?? labelledByText(element);
  if (aria) return aria;

  // Placeholders are static app copy, so they are safe and often the only name a
  // search box has.
  const placeholder = cleanText(element.getAttribute("placeholder"));
  if (placeholder) return placeholder;

  return `<unlabelled ${element.tagName.toLowerCase()}>`;
}

/**
 * The label sitting beside a control in its own field group.
 *
 * Every `<select>` in the console has no `id`, no `name` and therefore no
 * `label[for]` pointing at it: the Add aircraft dialog alone holds seven of them
 * (Category, Class, Engine, Fuel, Gear, Meters, Fuel unit) and without this they all
 * report as `<unlabelled select>`. Dropdowns are where the decisions are, meter mode,
 * reservation type, fuel unit, so a blind spot there is the expensive kind.
 *
 * The markup is consistently `<div class="space-y-1.5"><Label>Category</Label>
 * <select/></div>`, so the label is findable by walking up. A container holding more
 * than one field cannot name any single one of them, and that is the stop condition:
 * better `<unlabelled select>` than confidently attaching the wrong name.
 */
function groupLabel(element: Element): string | null {
  let node = element.parentElement;
  for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
    if (node.querySelectorAll(FIELD_SELECTOR).length > 1) return null;
    const text = cleanText(node.querySelector("label")?.textContent);
    if (text) return text;
  }
  return null;
}

function fieldType(element: Element): string {
  if (element.tagName === "TEXTAREA") return "textarea";
  if (element.tagName === "SELECT") return "select";
  if (element.getAttribute("contenteditable") === "true") return "richtext";
  return (element as HTMLInputElement).type || "text";
}

/** Whether a field ended up with anything in it. The fact, never the content. */
function isFilled(element: Element): boolean {
  const input = element as HTMLInputElement;
  if (input.type === "checkbox" || input.type === "radio") return input.checked;
  if (element.getAttribute("contenteditable") === "true") {
    return (element.textContent ?? "").trim().length > 0;
  }
  return (input.value ?? "").trim().length > 0;
}

/** Which form a field belongs to, so abandonment can be attributed to one. */
function formName(element: Element): string {
  const form = element.closest("form");
  if (form) {
    const explicit = form.getAttribute("data-track") ?? form.getAttribute("name");
    if (explicit && !GENERATED_ID.test(explicit)) return explicit;
  }
  const dialog = element.closest('[role="dialog"], [role="alertdialog"]');
  if (dialog) {
    const heading = cleanText(
      dialog.querySelector("[data-slot='dialog-title'], [data-slot='sheet-title'], h1, h2")
        ?.textContent
    );
    if (heading) return heading;
  }
  return currentPath();
}

// ---------------------------------------------------------------- form sessions

/**
 * One in-progress form fill.
 *
 * Opened by the first focus into a field and closed by submit, by navigation, or by
 * the tab going away. Whichever closes it decides whether this was a completion or an
 * abandonment, and abandonment is the interesting one.
 */
type FormSession = {
  form: string;
  path: string;
  started: number;
  touched: Set<string>;
  filled: Set<string>;
  lastField: string | null;
  submitted: boolean;
  /** The dialog, sheet or form the fields live in; watched so a dismissal is seen. */
  root: Element | null;
};

let session: FormSession | null = null;

/**
 * Notices a half-filled form being dismissed rather than navigated away from.
 *
 * Almost every form in this console lives in a dialog or a sheet, and the ordinary way
 * to give up on one is Escape, Cancel or the X, none of which change the URL. Watching
 * only navigation would therefore have missed the common case and reported abandonment
 * for the rare one, which is worse than not measuring it: the numbers would look real.
 *
 * Only runs while a form is actually open, so the console is not paying for a
 * subtree observer the rest of the time.
 */
let dismissWatcher: MutationObserver | null = null;

function watchForDismissal(root: Element | null): void {
  dismissWatcher?.disconnect();
  dismissWatcher = null;
  if (!root || typeof MutationObserver === "undefined") return;

  dismissWatcher = new MutationObserver(() => {
    if (!session?.root || session.root.isConnected) return;
    closeSession("dismissed");
  });
  dismissWatcher.observe(document.body, { childList: true, subtree: true });
}

/** The dialog, sheet or form a field belongs to, as an element. */
function sessionRoot(element: Element): Element | null {
  return element.closest('[role="dialog"], [role="alertdialog"], form');
}

function openSession(form: string, root: Element | null = null): FormSession {
  if (session && session.form === form && !session.submitted) return session;
  closeSession("switched");
  session = {
    form,
    path: currentPath(),
    started: Date.now(),
    touched: new Set(),
    filled: new Set(),
    lastField: null,
    submitted: false,
    root,
  };
  watchForDismissal(root);
  return session;
}

function closeSession(
  reason: "submitted" | "navigated" | "switched" | "hidden" | "dismissed"
): void {
  const open = session;
  session = null;
  dismissWatcher?.disconnect();
  dismissWatcher = null;
  if (!open || open.submitted) return;
  // A form nobody actually typed in was not abandoned, it was merely on screen.
  if (!open.touched.size) return;

  track("form_abandoned", {
    path: open.path,
    form: open.form,
    reason,
    last_field: open.lastField,
    fields_touched: open.touched.size,
    fields_filled: open.filled.size,
    // The fields they got through before stopping, in the order they hit them. Read
    // alongside `last_field` this shows the shape of the drop-off, not just its point.
    touched: [...open.touched],
    seconds: Math.round((Date.now() - open.started) / 1000),
  });
}

// ---------------------------------------------------------------- listeners

/** Fields already reported this visit, so holding a key is not 40 events. */
let focusedThisVisit = new Set<string>();

function onClick(event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const control = target.closest(CONTROL_SELECTOR);
  if (!control) return;
  // Typing in a field is not clicking a control, even though a field can match
  // `[role=combobox]`.
  if (control.matches(FIELD_SELECTOR)) return;

  track("ui_click", {
    path: currentPath(),
    label: controlLabel(control),
    control: controlKind(control),
    context: controlContext(control),
    disabled: control.hasAttribute("disabled") || control.getAttribute("aria-disabled") === "true",
  });
}

function onFocusIn(event: Event): void {
  const target = event.target;
  if (!(target instanceof Element) || !target.matches(FIELD_SELECTOR)) return;

  const type = fieldType(target);
  if (SECRET_TYPES.has(type)) return;

  const field = fieldName(target);
  const form = formName(target);
  const open = openSession(form, sessionRoot(target));
  open.lastField = field;
  open.touched.add(field);

  const key = `${open.path}|${form}|${field}`;
  if (focusedThisVisit.has(key)) return;
  focusedThisVisit.add(key);

  track("field_focus", { path: open.path, form, field, type });
}

function onChange(event: Event): void {
  const target = event.target;
  if (!(target instanceof Element) || !target.matches(FIELD_SELECTOR)) return;

  const type = fieldType(target);
  if (SECRET_TYPES.has(type)) return;

  const field = fieldName(target);
  const form = formName(target);
  const filled = isFilled(target);

  const open = openSession(form, sessionRoot(target));
  open.lastField = field;
  open.touched.add(field);
  if (filled) open.filled.add(field);
  else open.filled.delete(field);

  track("field_changed", { path: open.path, form, field, type, filled });
}

function onSubmit(event: Event): void {
  const form = event.target;
  if (!(form instanceof Element)) return;

  const name = formName(form.querySelector(FIELD_SELECTOR) ?? form);
  const open = session;
  if (open) open.submitted = true;

  track("form_submitted", {
    path: currentPath(),
    form: name,
    fields_touched: open?.touched.size ?? 0,
    fields_filled: open?.filled.size ?? 0,
    seconds: open ? Math.round((Date.now() - open.started) / 1000) : null,
  });
  session = null;
}

/**
 * A validation message the person actually saw.
 *
 * A form they submit three times before it takes is a form fighting them, and the
 * failure is invisible in every other event here: `form_submitted` fires each time and
 * looks like success. shadcn marks the offending control `aria-invalid`, so the count
 * of those after a submit is the count of things they got told off about.
 */
function reportValidation(path: string, form: string): void {
  const invalid = document.querySelectorAll("[aria-invalid='true']");
  if (!invalid.length) return;
  const fields = [...invalid].slice(0, 10).map((element) => fieldName(element));
  track("form_validation_failed", { path, form, count: invalid.length, fields });
}

// ---------------------------------------------------------------- wiring

let wired = false;

/**
 * Attach the listeners. Idempotent, and safe to call before consent exists.
 *
 * Everything routes through `track()` in `analytics.ts`, which drops on the floor
 * until PostHog is both consented and loaded, so this never has to know about consent
 * itself. Listeners are registered in the CAPTURE phase deliberately: plenty of
 * handlers in the console call `stopPropagation`, and a bubble-phase listener would
 * silently miss exactly the controls that do the most.
 */
export function startInteractionTracking(): void {
  if (wired || typeof document === "undefined") return;
  wired = true;

  document.addEventListener("click", onClick, true);
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("change", onChange, true);
  document.addEventListener("submit", onSubmit, true);

  // Validation is rendered a tick after submit, so look once React has painted.
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof Element)) return;
      const path = currentPath();
      const name = formName(form.querySelector(FIELD_SELECTOR) ?? form);
      setTimeout(() => reportValidation(path, name), 250);
    },
    true
  );

  // A tab closed mid-form is an abandonment like any other. `pagehide` for the same
  // reason `analytics.ts` uses it for dwell: it is the one that fires on mobile Safari.
  window.addEventListener("pagehide", () => closeSession("hidden"));
}

/**
 * Called by the router on every resolved navigation.
 *
 * Leaving a screen closes any half-filled form on it, and resets the once-per-visit
 * focus dedupe so returning to a screen counts as a fresh look at it.
 */
export function onNavigation(): void {
  closeSession("navigated");
  focusedThisVisit = new Set();
}
