# Empty-state graphics

Line drawings for **page-level** empty states in the web console. Not Lucide
icons. Compact sheets, filter "no matches", and the shared "no school" states
keep the icon.

`documents.tsx` is the approved reference. Match it. Do not invent a second style.

## How a graphic ships

1. Draw it as `_local/empty-graphics/<key>.svg` and confirm it in
   [`_local/empty-state-graphics.html`](../../../../../_local/empty-state-graphics.html)
   (workspace preview, not in package git).
2. Tony approves it there.
3. Copy the drawing into this folder as a React SVG component, register it in
   `index.tsx`, pass `graphic="the-key"` on the EmptyState.

Do not add a graphic to the product before it is approved in the HTML file.

## Layout (EmptyState, not the SVG)

The drawing's left edge lines up with the title. That is `xMinYMin` plus a tight
viewBox, not a layout change.

The empty-state *block* (graphic + title + body + buttons) is a centered column
in the card: outer `items-center justify-center`, inner `mx-auto w-fit max-w-md`
with left-aligned text. Do not pin the whole EmptyState to the card's left
border. Do not drop `mx-auto` to "fix" the drawing.

## Rules (from the documents pass)

These are the bugs that made the first drafts look like dots, then look padded.
They are load-bearing.

- **Stroke `currentColor`, fill none.** A default SVG fill is black. On a dark
  card that is invisible, so the drawing collapses to specks.
- **Tight viewBox.** Crop to the ink's bounding box (getBBox), not a padded
  240x196 frame. Leftover viewBox on the left is fake padding.
- **`preserveAspectRatio="xMinYMin meet"`.** The SVG default centers the art in
  the box. A box wider than the drawing then inserts empty space before the ink.
  Size the element to the viewBox aspect (`h-[108px] w-[79px]` for documents)
  so it does not letterbox.
- Unique silhouette per empty state. Outline, monochrome, a little depth
  (offset ghost stroke, stacked sheets). No Lucide, no emoji, no filled clipart.

## Files in product

Each unique drawing is a `.tsx` here. Page-level EmptyStates pass `graphic="the-key"`.
Aliases in `index.tsx` reuse one component:

| Keys | Shared drawing |
|------|----------------|
| `document-types`, `courses`, `compliance-log` | `documents` |
| `currency-rules`, `compliance-setup` | `currencies` |
| `aircraft-groups` | `aircraft` |
| `credited` | `requirements` |
| `renters`, `technicians`, `dispatchers`, `admins`, `guests` | `people-groups` |
| `enrolled`, `stages` | `students` |
| `member-accounts` | `my-ledger` |
| `billed` | `invoices` |

## Catalog (page-level only)

Skip: filter "no matches", compact sheets, "No active school" / "not in an
organization" (shared icon). One drawing per row, even when two pages share a
title.

### You

| Key | Title |
|-----|-------|
| `documents` | No documents yet |
| `currencies` | Nothing tracked yet |
| `my-schedule` | No flights on your schedule |
| `invoices` | No invoices yet |
| `my-ledger` | No ledger entries yet |
| `payments` | Online payments aren't set up |
| `my-training` | You're not on a course |
| `endorsements` | No endorsements yet |
| `book` | Nothing to book yet |
| `notifications` | You're all caught up. |

### Fleet

| Key | Title |
|-----|-------|
| `aircraft` | No aircraft yet |
| `simulators` | No simulators yet |
| `rooms` | No rooms yet |
| `locations` | No locations yet |
| `inspections` | No inspections set up |
| `compliance-log` | Nothing signed off yet |
| `squawks-open` | No open squawks, the fleet's clean. |
| `squawks-resolved` | Nothing resolved yet |
| `maintenance` | Nothing being tracked yet |
| `compliance-clear` | Everything's cleared to fly |
| `compliance-setup` | Track medicals, flight reviews & checkouts |

### People

| Key | Title |
|-----|-------|
| `people-you` | Just you so far |
| `instructors` | No instructors yet |
| `students` | No students yet |
| `renters` | No renters yet |
| `technicians` | No technicians yet |
| `dispatchers` | No dispatchers yet |
| `admins` | No admins yet |
| `people-roles` | Everyone has a role |
| `guests` | No guests yet |

### Training

| Key | Title |
|-----|-------|
| `courses` | No courses yet |
| `stages` | No stages yet |
| `enrolled` | Nobody enrolled yet |
| `in-training` | Nobody is in training |
| `requirements` | No requirements |
| `credited` | Nothing credited yet |

### Settings

| Key | Title |
|-----|-------|
| `booking-offerings` | No booking offerings yet |
| `aircraft-groups` | No aircraft groups yet |
| `people-groups` | No people groups yet |
| `ratings` | No ratings yet |
| `currency-rules` | No currency rules yet |
| `memberships` | No membership plans yet |
| `document-types` | No document types yet |
| `api-keys` | No API keys yet |

### Billing, operations, reports

| Key | Title |
|-----|-------|
| `billed` | Everything billed |
| `member-accounts` | No member accounts yet |
| `announcements` | No announcements yet |
| `dispatch` | Your dispatch board is clear |
| `cancellations` | Pick a date range |
| `report-schedules` | Nothing scheduled yet |
| `reports` | No reports available |

New product files: kebab-case, named after the key, one component per file.
