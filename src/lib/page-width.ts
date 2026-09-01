/**
 * How wide a page is allowed to get.
 *
 * One measure at present: the shell caps every page at 1280, and {@link NARROW_PAGE} asks
 * for the same number. That is deliberate rather than an oversight. The console ran at
 * 1680 for a few days and it read worse, not better: a header put its title and its
 * buttons a desk apart, and a table spread its columns instead of showing more of them.
 *
 * The pair is kept because the DISTINCTION is real even while the numbers agree. A page
 * that is a column of form fields or prose is narrow because of what it holds, not
 * because of what the shell happens to cap at, so `NARROW_PAGE` still says something
 * true, and it is what should shrink if the default ever grows again. Same reason the
 * squawk write-up sets `max-w-prose` on its description inside a much wider pane.
 *
 * Applied by the page rather than declared to the shell, so it is visible in the file you
 * are reading: `<TableView className={NARROW_PAGE}>`.
 */

/**
 * The default, set by the app shell.
 *
 * Here for reference and for anything that needs to reason about it; the shell writes the
 * literal, because a Tailwind arbitrary value cannot read a constant. Change both together.
 */
export const PAGE_MAX_PX = 1280;

/** What {@link NARROW_PAGE} caps at. Same caveat about the literal. */
export const NARROW_PAGE_MAX_PX = 1280;

/**
 * For settings, profile, and anything else that is mostly fields to fill in.
 *
 * Centred, so a narrow page sits in the middle of a wide window rather than hugging the
 * nav rail with a void to its right.
 */
export const NARROW_PAGE = "mx-auto w-full max-w-[1280px]";
