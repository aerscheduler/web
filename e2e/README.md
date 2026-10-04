# Console E2E (Playwright)

Local / CI only. Refuses production API hosts unless `ALLOW_PROD_E2E=1`.

## One-command stack (recommended)

Starts ephemeral Postgres (tmpfs), migrates, seeds AERTEST01, runs the API on
`:5101`, and lets Playwright start Vite on `:5173`. Your everyday dev DB/API
(`mydb` / `:5001`) can stay running.

```bash
cd web
npm run test:e2e:stack
# one spec:
npm run test:e2e:stack -- e2e/schedule/booking-adversarial.spec.ts
# headed:
npm run test:e2e:stack:headed
```

Requires Podman or Docker. Teardown is automatic; if a run is interrupted:

```bash
./scripts/e2e-down.sh
```

Override ports with `E2E_PG_PORT`, `E2E_API_PORT`, `E2E_WEB_PORT`.

## Manual prerequisites

```bash
cd server && npm run dev          # :5001 + AERTEST01 seeded
# Re-run if booking tests hit the subscribe paywall (trial lapsed):
PGPASSWORD=mysecretpassword psql -h 127.0.0.1 -U admin -d mydb -f server/prisma/seed-test-accounts.sql
cd web && VITE_API_PROXY=http://127.0.0.1:5001 npm run dev
```

## Run (manual stack)

```bash
cd web
npm run test:e2e
# headed:
npm run test:e2e:headed
# UI mode:
npm run test:e2e:ui
```

Defaults: `VITE_API_PROXY=http://127.0.0.1:5001`, Playwright starts Vite on
`127.0.0.1:5173` unless `PLAYWRIGHT_SKIP_WEBSERVER=1`.

## What is covered

| Spec | Flow |
|------|------|
| `e2e/auth.setup.ts` | UI login as owner + storageState + E2E cleanup |
| `e2e/auth/login.spec.ts` | Real login + bad password |
| `e2e/schedule/journeys.spec.ts` | Schedule loads; create affordance |
| `e2e/schedule/ui-create.spec.ts` | Owner: New reservation form through POST /reservations |
| `e2e/schedule/me-book-create.spec.ts` | Student: /me/book solo self-serve booking |
| `e2e/schedule/booking-request.spec.ts` | Student submits booking request; owner approves from desk queue |
| `e2e/schedule/public-booking.spec.ts` | Guest `/book/{slug}/{offering}` picker (desktop Day card + rail month + AerScheduler link; Week calendar full-bleed with heatmap pills; Week times; phone is day view only, page scroll, no card); form hidden until a start time is picked; submit stays unverified until email confirm; confirm token promotes to desk queue; junk confirm token; embed `?embed=1` with no cookie banner; foreign iframe blocked until Websites that may embed lists the parent; same-origin preview still loads; owner Settings public-link/embed-host save plus Offerings public-link copy; student `/me/book` is still reservation types |
| `e2e/schedule/public-booking-roles.spec.ts` | Owner/admin Settings Booking links + More → Booking links; other roles bounced from `/settings` and `/offerings`; `/me/book` by role (staff empty, flying types, technician maintenance); desk queue hidden from members; dispatcher Decline + dispatcher/admin/owner Approve; guest tails follow Guests visibility; pause / 7-day horizon / 48-hour notice / pick-aircraft vs visibility / Allow public requests from the UI; API 403 for offerings/visibility/desk queue/convert by role; admin can save offering copy; duration / eligible aircraft / pick-aircraft only (no instructor or location requester toggles); collection style on the offering; authenticated slot labels follow each audience's calendar setting |
| `e2e/schedule/booking-adversarial.spec.ts` | Approval + ledger gate matrix: multi-select, role split, decline/cancel, min credit / max owing / $0 floor |
| `e2e/schedule/api-lifecycle.spec.ts` | Create / patch / cancel reservation via API |
| `e2e/schedule/slot-offer-cancel-recovery.spec.ts` | API: Standby → cancel → offer → accept; desk withdraw; Pending offers opens |
| `e2e/schedule/slot-offer-cancel-recovery-ui.spec.ts` | UI clicks: stand by → cancel dialog → Pending offers → Accept on Offers tab; Withdraw |
| `e2e/schedule/standby-preferences.spec.ts` | Student: "first dibs" callout on My schedule links to Profile → Standby; Standby modal refuses no day, saves exact criteria (Sat afternoons, Tue 2 to 5 PM custom); rows sort Monday first in 12-hour time; callout gone once configured; Withdraw from rows; "Suggest open slots to me" PUTs both ways; the X hides the callout after reload |
| `e2e/billing/invoices.spec.ts` | Billing / invoices reachable |
| `e2e/billing/sales-tax.spec.ts` | Sales tax: rate + rules, preview taxes parts not labour, uncategorised lines never taxed, exempt customer, 409 on a moved total, whole-number qty; owner-only writes, below-admin refusals equal for real and absent ids; Settings pane and New invoice in the console (serial, restores settings) |
| `e2e/billing/mark-paid-and-past-due.spec.ts` | Murray §13, 14, 16 on one bill to the test aircraft owner (raised against the org's test-mode Stripe; skips without it): due two days ago so it reads Past due on the panel and under the Past due filter, with the bill-to block carrying the shop's billing address; Mark paid refuses a check number on cash, a future date and payment fields on a void before writing; the form refuses no method, then records Check #1234, today's date and a note, and the panel says "Paid by check #1234 on"; the owner (own browser) reads the same line and the bill-to, never the desk's note; files shown to the owner or kept to the shop, the owner gets only theirs, a non-billed member and an absent id get identical refusals, the owner cannot attach |
| `e2e/maintenance/work-orders.spec.ts` | Work orders: open a job from the board through the form (bill-to defaults to the aircraft's owner, meters in prefilled), items and the owner's answer, stage changes on the job page, the aircraft's In the shop chip follows the job, audit trail, shop roles read and pilots get equal refusals for a real and an absent job, search, validation, admin-only delete; Settings > Shop rates (admin only), labor and a part priced from them, the invoice preview (raising needs Stripe, so it stops there), linking a maintenance booking (serial, cleans up its aircraft, owner, bookings and jobs, and puts the school's rates back) |
| `e2e/maintenance/work-order-stripe.spec.ts` | **Off unless `STRIPE_E2E=1`.** A job's bill against real test-mode Stripe: the desk raises it from the job page with a due date picked on the calendar, Stripe holds the previewed invoice (open, due in ten days, a line per billed charge, the no-charge line left off), a test card pays it and the `invoice.paid` webhook marks the job paid; a technician adds work but gets 403 raising it, a dispatcher gets 403 on the preview; a member billed for a job sees it in My invoices and pays it; voiding frees the lines. Needs the test org connected to a test Stripe account and `server/bin/stripe-listen.sh` running (see the stripe-local skill) |
| `e2e/maintenance/inspection-status.spec.ts` | Murray spec 5's statuses: a technician marks an overdue inspection Not applicable on the inspection page with a reason (PATCH body and the stored `due.status` checked), the list grouped by status shows its own group and the reason; a job booked on it reads Scheduled, then In progress, and the tag opens the job; a dispatcher reads the inspection with `work` and `workOrderItems` stripped; the outside owner sees "not applicable" with the reason and the job on `/me/aircraft/:id`; It applies again puts it back to overdue. On N4417T with a rule that does not ground; needs seed-test-accounts.sql |
| `e2e/billing/prepaid-package-flow.spec.ts` | Prepaid guest: invoice at confirm, Collect payment, ramp, close-out, no second Hobbs invoice (skips without Stripe Connect) |
| `e2e/billing/invoice-privacy-and-offline.spec.ts` | Calendar GET hides other people's rates/invoices; missing-invoice banner; Record check; wedged-approve toast |
| `e2e/billing/ledger.spec.ts` | Ledger GET/auth/write contracts; `/me` Add funds + desk credit/refund/adjustment when mode is on |
| `e2e/people/invite.spec.ts` | People + invite sheet |
| `e2e/operations/hide-announcement.spec.ts` | Got it hides a notice from Home; board still lists it |
| `e2e/operations/squawk-files.spec.ts` | Photos/PDFs on squawk create and notes: API fileNames, real local upload POST, hasAttachments, role gates, junk types, 6-file toast; student can open the write-up |
| `e2e/operations/resource-papers.spec.ts` | Aircraft papers locker: owner upload, student read, staff-only hidden, fileUrls refused, dispatcher/tech/renter roles, cap, Papers tab, sim has no tab, `/me/book` Papers only for bookers, iPhone HEIC name + JPEG-in-HEIC rename |
| `e2e/operations/reminder-files.spec.ts` | Files on an open inspection: owner JPEG, list `hasAttachments` without keys, sign-off copies onto the compliance record and clears the next cycle, fileUrls refused, junk types, sixth file, student/dispatcher 403, technician can attach, Files sheet on All inspections |
| `e2e/access/route-matrix.spec.ts` | Every guarded top-level route opened as all 7 seeded roles: loads, or bounces to `/me`. Expectations live in `e2e/access/route-access.expected.ts`, and `src/lib/route-matrix-agrees.test.ts` (vitest) fails in a second if they stop matching the real `canAccess`, or if a new `ROUTE_ACCESS` key is added with no row here |
| `e2e/access/shop-visibility-matrix.spec.ts` | The shop's customer and aircraft as each of the 7 roles sees them, through every door that returns a person or the aircraft (roster, member by id, person by id, `/users`, the sign-in payload, the aircraft record and both lists). Staff see all of it; pilots see none, and each refusal must equal the answer for an id nobody has |
| `e2e/aircraft/shop-aircraft.spec.ts` | A customer's aircraft in the shop: absent from the fleet list, the plain `/resources` list the app reads and the org payload sign-in returns; every non-maintenance booking refused; maintenance allowed; not counted on the plan; Fleet / Customer aircraft tabs. Its owner: external + unclaimed, real address shown (never the placeholder login) on People, the Owners panel and the invoice picker, cannot sign in, in no booking picker, name links to their page. **Every hidden-record refusal (~30 doors: bookings, side doors, person routes, standby, squawks) is compared byte for byte with the same request for an id nobody has** |
| `e2e/aircraft/meter-log.spec.ts` | An aircraft's Hobbs and tach log: a never-read customer aircraft says so; a technician records a reading (the aircraft's times move); a lower one is asked about and kept as a Correction; a dispatcher sees the list but no Record button and gets 403 from the API |
| `e2e/aircraft/aircraft-records.spec.ts` | An aircraft's records (Murray spec sections 3, 8, 16): the History tab lists a finished job and opens it; a pilot is refused alike for a customer's aircraft, a fleet aircraft and an absent id, a technician the same on Invoices, a dispatcher's history has no jobs; the owner's own history, and somebody else's aircraft reads as absent. A paper shown to the owner reaches `/me/aircraft/:id` and stops when kept to the shop (refused on the fleet). Files on the owner's account: the shop shows one, the owner sees it on `/me` and adds one, the shop sees it as theirs and cannot hide it. The hangar booking's `shopJob` reaches a technician in full, a dispatcher without the request, a pilot not at all. A pilot's aircraft page has no History tab |
| `e2e/aircraft/components.spec.ts` | Life-limited components (Murray spec 5): an admin adds one in the Components card on the Maintenance tab (validation, the tach reading defaulted, since overhaul), sees "40.0 h left" amber and the linked one-off inspection in the API (`componentClock`, due at the limit) and opens it from the row; editing the limit MOVES the same inspection; deleting or re-pointing that inspection by itself answers 400; "Record it came off" retires it and keeps the part under "came off". A technician adds one to a customer aircraft (both clocks, two inspections); the outside owner reads it on `/me/aircraft/:id` without the shop's notes and is refused the shop's door alike for every id. Instructors and students refused alike on every door for a customer aircraft, a fleet aircraft and an absent id; a dispatcher reads and cannot write; a component asked for under the wrong aircraft equals an absent one. Papers: "No airworthiness certificate or registration on file" until both are, the add form opening on the missing one. The registration renewal preset (84 calendar months, §47.40, never grounding) in the API and the add-inspections picker |
| `e2e/owner/owner-portal.spec.ts` | An aircraft owner signed in from outside the organization: the shop records them, they sign up and join (a fixed test login, made on first run), and stay external. The school's API answers 403 (board, roster, fleet, the shop's job route); their own job answers with charges and no costs; an absent job 404. In the browser: Home and Invoices in the rail and nothing says "My aircraft", /schedule and /me/aircraft send them home, Quick actions open Request work and Update times named for the aircraft, they approve a found item (the shop's API shows it approved) and request work (a Requested job appears) |
| `e2e/demo/owner-demo.spec.ts` | The public demo as the shop's customer: /demo, pick Aircraft owner, the switch lands as the outside owner the server lists (no roles, `external`), on /me with "Aircraft owner" in the banner. Needs you shows a finding to answer; Review opens the job with Approve on it; View and pay opens an unpaid invoice whose Pay is disabled with "Paying is turned off in the demo.", and no `/stripe/invoice` request is made. Exits to hand the sandbox back. Needs the demo pool seeded with a claimed outside owner |
| `e2e/owner/request-work.spec.ts` | An outside aircraft owner asks for work with everything a request can say: Grounded (chip menu), where it is, Hobbs and tach now, and a photo. The POST answers 201 with `aircraftTimes: updated` and one upload slot; the owner's job shows the request facts; the technician's `GET /work-orders/:id` carries `ownerRequest` and `requestReading`; the aircraft's meter log moved and its newest entry is "With the request", linked to the job. Deletes the job after. Needs seed-test-accounts.sql (test-aircraft-owner owns N4417T) |
| `e2e/training/api-lifecycle.spec.ts` | Curriculum HTTP: unsigned reuse, extra dual after a live pass, leftover unsigned 409, U retake, concurrent save/sign, archived enroll, student 403, dispatcher empty list, candidates `recordId`/rental empty, taskGrades omit vs wipe |
| `e2e/training/edges.spec.ts` | Closed enrollment cannot be signed/amended/certified; concurrent end+sign; concurrent graduate vs terminate; countersign after amend 409; countersign + amend authz; admin/renter/technician roles; requiresNotes; reservationId omit vs null; mixed sim+aircraft credits |
| `e2e/training/journeys.spec.ts` | Owner enroll + End enrollment modal (Grade/Add credit gone after terminate); student `/me/training` Back + countersign; student bounce from `/training`; instructor hub; dispatcher without a training grant bounced from `/training`; instructor My training does not list classmates; no Grade for student; archived course hides Enroll |
| `e2e/training/grade.spec.ts` | Instructor Save and sign from enrollment (date + sim hours); close-out Grade this lesson; extra dual Sign; take over a draft from another booking; close-out reuses the booking's unsigned draft; rental hides Training record |
| `e2e/onboarding/intent-logic.spec.ts` | Pure: landingPath→source, tracks, heard-from gate |
| `e2e/onboarding/checklist-tracks.spec.ts` | Dashboard `?track=` + `?checklist=fresh` Start here leads |
| `e2e/onboarding/wizard.spec.ts` | Unauth `/onboarding` → login; complete org AllSet; student no-code escape; school 3-step operation details, skip aircraft then billing Skip for now, Finish on updates, complete only after Finish; **API asserts** after a full save (club + KAPA + aircraft + heard-from + tips off) and after solo skip (type, source, tips stay on) |

Preview query params (display-only, safe on any org):

- `?track=maintenance|clubs|reports|...` - reorder as that campaign
- `?checklist=show` - show a retired checklist
- `?checklist=fresh` - show and treat every item as undone (best for comparing tracks)

Local wizard replay (`npm run dev` only; ignored in production builds):

- `/onboarding?restart=1` - persona picker again, even if the org already exists or
  setup is marked complete. **Owner/admin only**; members still see You're all set
  (Continue would 403). Continue/Create operation PATCHes the current school
  rather than minting a second one. To wipe the org and start truly fresh, re-run
  `server/prisma/seed-onboarding-preview.sql` and sign in as `preview-1@`…`preview-6@`.

Cleanup cancels only E2E-tagged reservations (same markers as Flutter). A spec that creates a
PERSON cleans up by ARCHIVING them, not deleting: the product has no hard delete for a member,
because a membership carries invoices and history.

## Screenshot capture (`e2e/capture/`)

Not tests. They write image files for a document, they build their own fixtures, and they are
excluded from the ordinary run. Opt in deliberately:

```bash
CAPTURE=1 VITE_API_PROXY=http://127.0.0.1:5011 PLAYWRIGHT_BASE_URL=http://localhost:5179 \
  PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test e2e/capture/maintenance-shop
```

| Spec | Writes |
|------|--------|
| `e2e/capture/ad-walkthrough.spec.ts` | Airworthiness Directive walkthrough shots |
| `e2e/capture/booking-phases.spec.ts` | Booking lifecycle shots |
| `e2e/capture/maintenance-shop.spec.ts` | Customer aircraft + owners, into `_local/maintenance-shop/shots/` |

They still assert at every step: a screenshot of the wrong screen is a picture of something
that does not exist.

## Next (high value)

- Per-role `storageState` (7 files) + full route matrix
- Reservation state x role render matrix
- Create booking + ramp/close-out journeys with API asserts
