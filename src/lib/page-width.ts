/**
 * How wide a page is allowed to get. Two measures, and the choice is about CONTENT.
 *
 * The app shell gives every page the wide measure by default, because most of this console
 * is boards, tables and queues, and those genuinely use the width: a dispatch board shows
 * more of the day, a table shows more columns before it starts hiding them, and the squawk
 * inbox has room to be two panes instead of a list with a drawer over it.
 *
 * A page whose content is a COLUMN OF FORM FIELDS or prose asks for the narrow one. Nothing
 * is gained by running a name field across 1600px, and plenty is lost: the label sits a
 * long way from where you type, and the eye has to travel the width of a desk to read a
 * setting's help text back to its control. Same reason the squawk write-up sets
 * `max-w-prose` on its description inside a pane that is much wider than that.
 *
 * Applied by the page rather than declared to the shell, so it is visible in the file you
 * are reading: `<TableView className={NARROW_PAGE}>`.
 */

/**
 * The default, set by the app shell. 1920 minus the nav rail, so the commonest big monitor
 * is filled edge to edge and anything past it keeps a margin instead of stretching a header
 * across a desk.
 *
 * Here for reference and for anything that needs to reason about it; the shell writes the
 * literal, because a Tailwind arbitrary value cannot read a constant. Change both together.
 */
export const PAGE_MAX_PX = 1680;

/** What {@link NARROW_PAGE} caps at. Same caveat about the literal. */
export const NARROW_PAGE_MAX_PX = 1280;

/**
 * For settings, profile, and anything else that is mostly fields to fill in.
 *
 * Centred, so a narrow page sits in the middle of a wide window rather than hugging the
 * nav rail with a void to its right.
 */
export const NARROW_PAGE = "mx-auto w-full max-w-[1280px]";
