/**
 * Every link from inside the product to the public help documentation.
 *
 * One registry rather than URLs scattered through components, for three
 * reasons. The copy in these hints is user-facing writing and belongs
 * somewhere it can be read and edited as a set, not hunted for across forty
 * files. The docs site is a separate repo, so a renamed article would
 * otherwise rot silently into a 404 that nobody notices. And the website's
 * `scripts/check-docs.mjs` reads this file and fails its build if any `href`
 * here is not a real published article, which is only possible because they
 * are all in one place.
 *
 * Adding a hint: add an entry here, then drop `<DocsHint topic="the-key" />`
 * beside the control it explains.
 *
 * Writing one: two sentences at most. Say what the thing does and the one
 * thing people get wrong about it. The article covers the rest, which is what
 * the link is for. No em dashes.
 */

export const DOCS_BASE_URL = "https://www.aerscheduler.com/docs";

export type DocsTopic = {
  /** Title of the popover. Usually the label of the control it sits beside. */
  title: string;
  /** One or two plain sentences. */
  summary: string;
  /** Path under /docs, e.g. "billing/split-a-flight-between-two-pilots". */
  href: string;
  /** Link label. Defaults to "Read the guide". */
  linkLabel?: string;
};

/**
 * Ordered by module, in the order a school meets them. Keys are kebab-case and
 * name the CONTROL, not the article, because the control is what somebody has
 * on screen when they go looking for the entry.
 */
export const DOCS_TOPICS = {
  /* ── Training and curriculum ──────────────────────────────────────────── */

  "course-regulatory-part": {
    title: "Part 61 or Part 141",
    summary:
      "This decides every gate on the course, and it can never be changed afterwards. Part 141 needs a published syllabus before anyone can enroll, and blocks graduation until every FAA requirement is met.",
    href: "training/part-61-vs-part-141",
  },
  "syllabus-version": {
    title: "Syllabus version",
    summary:
      "This picks which revision of the syllabus everything below describes, and only a draft can be edited. Each student is pinned to the version they enrolled on, whatever you do to the course later.",
    href: "training/publish-a-syllabus-version",
  },
  "publish-syllabus": {
    title: "Publishing is permanent",
    summary:
      "Publishing locks this version forever: its lessons, tasks and requirements can never be edited again. To change it later you create a new version and publish that, and anyone already enrolled finishes on the old one.",
    href: "training/publish-a-syllabus-version",
  },
  "credits-toward": {
    title: "Credits toward",
    summary:
      "Tick the requirements this lesson should feed, and signing it posts the lesson's hours to every one of them at once. A lesson with nothing ticked credits no hours anywhere.",
    href: "training/build-a-syllabus",
  },
  "requirement-source": {
    title: "Comes from",
    summary:
      "Only a Part 61 or Part 141 requirement can block a Part 141 graduation. Choose Our own for a bar your school sets above the regulation: it is shown to the student but never stops them graduating.",
    href: "training/add-hour-requirements",
  },
  "grading-scale": {
    title: "Grading scale",
    summary:
      "The marks this course uses, and which of them count a lesson as complete. Grading from a flight close-out only ever offers S, U and I, so a custom scale has to be graded from the training record or the iOS app.",
    href: "training/set-the-grading-scale",
  },
  "enrollment-fee": {
    title: "Enrollment fee",
    summary:
      "Each student records this amount as owed on the day they enroll, and it is billed in one click from their record. Changing it later never re-prices anyone already training.",
    href: "training/course-enrollment-fee",
  },
  "grade-at-close-out": {
    title: "Training record",
    summary:
      "This appears when the booking is dual, ground, sim or solo and a student on it is enrolled on a course with a matching lesson. Signing here freezes the record and credits the hours.",
    href: "training/grade-a-lesson-at-close-out",
  },
  "lessons-vs-hours": {
    title: "Lessons and hours",
    summary:
      "Two different measures: lessons say how far through the syllabus a student is, requirements say whether they have the flight time to test. One flight can credit several requirements at once, so the two move independently.",
    href: "training/read-a-training-record",
  },
  "amend-signed-lesson": {
    title: "Amending a signed record",
    summary:
      "A signed record can never be edited, so amending strikes the original through and creates a correction beside it. The hours the original credited come back only when you sign the correction.",
    href: "training/correct-a-signed-lesson",
  },
  "prior-training-credit": {
    title: "When it was flown",
    summary:
      "Enter the date from the logbook, not today. Some requirements only count training from the last few calendar months, and this date is what decides whether these hours count.",
    href: "training/credit-prior-training",
  },
  "endorsement-blanks": {
    title: "Blanks to fill in",
    summary:
      "Anything in braces is yours to complete before you sign. The text is stored exactly as you sign it and is never regenerated, so a blank left in stays on the endorsement.",
    href: "training/sign-an-endorsement",
  },
  "what-a-course-is": {
    title: "Courses",
    summary:
      "A course is a syllabus and the students on it: stages, lessons, graded tasks, and the hours a student has to build up before they can test. Starting from a built-in syllabus saves you writing the hour requirements yourself.",
    href: "training/create-a-course",
    linkLabel: "What a course is",
  },
  "enrolling-a-student": {
    title: "Enrollments",
    summary:
      "Enrolling puts a student on one exact version of a syllabus and opens their training record. Hours credit themselves from then on, as each lesson is graded and signed.",
    href: "training/enroll-a-student",
    linkLabel: "How enrolling works",
  },

  /* ── Billing and payments ─────────────────────────────────────────────── */

  "service-fee": {
    title: "Service fee",
    summary:
      "Your own surcharge, not AerScheduler's and not Stripe's, added as a line on every invoice you raise. A booking split between three people carries it three times, once on each person's invoice.",
    href: "billing/turn-on-invoicing-and-card-payments",
  },
  "how-members-pay": {
    title: "How members pay",
    summary:
      "Invoice each booking (flights, sims, ground, and fees) or use an account ledger balance. Guests always get a pay-this-visit invoice. Only the organization owner can change this.",
    href: "billing/choose-invoice-or-account-ledger",
  },
  "ledger-topup-card-fee": {
    title: "Card fee on account top-ups",
    summary:
      "Optional percent and/or flat fee when members add funds by card. They pay a little more and still get the credit they asked for. Desk cash and check stay dollar-for-dollar.",
    href: "billing/set-a-card-fee-on-account-top-ups",
  },
  "post-to-ledger": {
    title: "Post to ledger",
    summary:
      "With Account ledger on, a member flight posts a balance charge instead of a Stripe invoice. Guests still get a pay-this-visit invoice. Retrying after a live charge does nothing.",
    href: "billing/charge-a-flight-to-the-account-ledger",
  },
  "ledger-accounts": {
    title: "Account balances",
    summary:
      "Who has credit and who owes, for the whole school. Click a row to open that member's ledger. Guest invoices stay on the Invoices tab. Age and export live under Reports → Accounts receivable.",
    href: "billing/review-account-balances-and-who-owes",
  },
  "account-ledger": {
    title: "Account ledger",
    summary:
      "Running balance for this member. Posted by is who put the row on; click a row to open the detail panel.",
    href: "billing/manage-a-member-account-ledger",
  },
  "ledger-receipt": {
    title: "Receipt",
    summary:
      "Printable line items for a live flight charge, fee, or desk charge. Reversed charges and top-ups have no receipt here.",
    href: "billing/manage-a-member-account-ledger#receipts",
  },
  "reassign-flight-charge": {
    title: "Reassign flight charge",
    summary:
      "Moves a live flight charge to another member by reversing the original and posting a new one. Admins only. Fees and desk charges cannot be reassigned.",
    href: "billing/manage-a-member-account-ledger#reassign-a-flight-charge",
  },
  "ledger-statement": {
    title: "Account statement",
    summary:
      "Pick a date range to see opening balance, every entry with a running total, and closing. Print or email it. This is not a Stripe invoice and does not go to QuickBooks.",
    href: "billing/manage-a-member-account-ledger#statements",
  },
  "ledger-booking-gates": {
    title: "Minimum credit and max owing",
    summary:
      "When the school uses an account ledger, you can require prepaid credit before self-book, or stop members who already owe more than a cap. A shared flight checks every billed seat. Owners, admins, and dispatchers still book on someone's behalf. Invoice-mode schools ignore these.",
    href: "scheduling/booking-rules-and-settings#account-ledger-booking-gates",
  },
  "ledger-dispatch-gates": {
    title: "Minimum credit and max owing at dispatch",
    summary:
      "Same idea as the self-book gates, checked when someone ramps out. Leave them blank and booking rules are not re-applied at dispatch. Owners, admins, and dispatchers still override. Invoice-mode schools ignore these.",
    href: "scheduling/booking-rules-and-settings#account-ledger-dispatch-gates",
  },
  "ledger-auto-refill": {
    title: "Auto-refill",
    summary:
      "Charges the default card on a schedule: when the balance drops under a floor, to pay what they owe, or a fixed amount even at zero. Daily or monthly. Three failed charges pause it; the card is not deleted.",
    href: "billing/manage-a-member-account-ledger#auto-refill",
  },
  "ledger-late-fees": {
    title: "Late fees",
    summary:
      "Once a month, members who have stayed owing past the grace period get a fee posted to the ledger. Percent of the amount owing, plus an optional flat amount. Ledger mode only.",
    href: "billing/manage-a-member-account-ledger#late-fees",
  },
  "ledger-refund": {
    title: "Refund",
    summary:
      "Original card can only return what is still unused on the charge you pick, even if the account is higher; refund each charge separately, or use check/cash for the full balance. Card fees stay charged.",
    href: "billing/manage-a-member-account-ledger#refund",
  },
  "overnight-minimum": {
    title: "Overnight minimum",
    summary:
      "Counted in nights away, not days, so a booking back the same day is never affected. It applies to the whole booking, so two people sharing a trip owe one minimum between them.",
    href: "billing/charge-a-minimum-for-overnight-trips",
  },
  "unpaid-invoice-grounding": {
    title: "Grounding for unpaid invoices",
    summary:
      "A count of unpaid invoices, not days late and not dollars owed. A member at or over this number cannot book an aircraft until they pay, and ground school, simulators and rooms are never blocked.",
    href: "billing/chase-unpaid-invoices",
  },
  "cost-splitting": {
    title: "Cost splitting",
    summary:
      "One rule per booking type decides how the aircraft time and the instruction divide between the people on board, and each of them then gets their own invoice. Each pays in full is not a split: everybody is charged the whole amount.",
    href: "billing/set-up-cost-splitting",
  },
  "who-pays-what": {
    title: "Who pays what",
    summary:
      "Fill in whichever fields your school's splitting rule uses: a Hobbs reading each when everyone pays their own time, shares when the split is set, nothing at all for an even split. Anything else is kept as a record of the flight but is not billed.",
    href: "billing/who-pays-what-at-close-out",
  },
  "rate-basis": {
    title: "Wet and dry rates",
    summary:
      "Wet includes fuel and dry does not, and AerScheduler never adds fuel to an invoice either way. On a dry rate, bill the fuel separately on a manual invoice.",
    href: "billing/set-aircraft-and-instruction-rates",
  },
  "void-an-invoice": {
    title: "Voiding an invoice",
    summary:
      "Voiding is not a refund, and an invoice that has already been paid cannot be voided. Refunds are done in your own Stripe dashboard, and they do not change anything here.",
    href: "billing/mark-an-invoice-paid-void-or-refund-it",
  },
  autopay: {
    title: "Autopay",
    summary:
      "Autopay charges invoices raised from your flights to your default card. Invoices your school types up by hand are always sent for you to pay, and autopay switches off if your default card is removed.",
    href: "billing/pay-an-invoice-and-save-a-card",
  },
  "membership-dues": {
    title: "Plans and dues",
    summary:
      "A plan is what belonging costs: a join fee, recurring dues, and what the tier gets in return. Prices only apply to people who join after you change them, so existing members keep the price they joined at.",
    href: "billing/set-up-membership-dues",
  },

  /* ── Scheduling and dispatch ──────────────────────────────────────────── */

  "reservation-type": {
    title: "Reservation type",
    summary:
      "The type decides what resource is booked, who may be on it, how many, and who gets the invoice. Dual is an instructor with a student, solo is one pilot alone, and a shared flight is two or more pilots with no instructor.",
    href: "scheduling/reservation-types",
  },
  "available-times": {
    title: "Available times",
    summary:
      "Only times when the resource and everyone assigned are all free are offered. Adding another person shortens the list, so removing somebody or trying another aircraft or date usually opens more slots.",
    href: "scheduling/book-a-reservation",
  },
  "repeat-booking": {
    title: "Repeating bookings",
    summary:
      "A repeat creates a real, separate booking for every date, so each one is ramped, reviewed and invoiced on its own. If any single date conflicts, none of them are booked.",
    href: "scheduling/set-up-a-repeating-booking",
  },
  "airworthiness-notice": {
    title: "Airworthiness",
    summary:
      "This is what the aircraft's record says right now, and it does not block the booking. Open squawks are a warning, and only a grounded aircraft is refused.",
    href: "scheduling/why-was-my-booking-refused",
  },
  "confirmation-pin": {
    title: "Confirmation PIN",
    summary:
      "Your four character PIN is your signature on the flight record, and it cannot be undone. Every pilot on the booking has to enter theirs before the invoice is raised.",
    href: "scheduling/sign-off-with-your-pin",
  },
  "instruction-time": {
    title: "Instruction time",
    summary:
      "Ground instruction time in hours, billed at the instructor rate. On a lesson with no aircraft it is the only figure recorded, so it is required there.",
    href: "scheduling/close-out-a-ground-lesson",
  },
  "cancellation-reason": {
    title: "Reason type",
    summary:
      "Pick the closest one, because the cancellation report counts these and consistent answers are what make it useful. A no-show is recorded by cancelling with the No-show reason after the start time.",
    href: "scheduling/cancel-a-reservation",
  },
  "standby-for-booking": {
    title: "Stand by",
    summary:
      "Join standby on this booking if you want it when it opens. You get a time-limited offer to accept, not an automatic rebook. Standing preferences for days and types live under Profile → Standby.",
    href: "scheduling/standby-and-slot-offers",
  },
  "standing-preferences": {
    title: "Standing preferences",
    summary:
      "Days, reservation types, local hours, aircraft, and instructors you want. Leave a field blank to mean any, and pick at least one constraint. When the school requires checkouts, aircraft are limited to what you are approved on. Matching openings become time-limited offers.",
    href: "scheduling/standby-and-slot-offers",
  },
  "slot-offers": {
    title: "Offers",
    summary:
      "Accept before the offer ends to book the time, or decline so the next eligible member can be offered. Dual recoveries ask the instructor to confirm first. Schools set offer window length, quiet hours, pending caps, and decline cooldown under Booking preferences. Turn on Offers & standby notifications so you do not miss the window.",
    href: "scheduling/standby-and-slot-offers",
  },
  "slot-offer-quiet-hours": {
    title: "Quiet hours",
    summary:
      "During this local window, cancel recovery waits before creating a new offer so a late-night cancel does not reserve the aircraft overnight. Uses the airport time zone, then the school zone. Desk offers still go out immediately.",
    href: "scheduling/standby-and-slot-offers#quiet-hours",
  },
  "slot-offer-decline-cooldown": {
    title: "Decline cooldown",
    summary:
      "After someone declines or lets an offer expire, they are not offered another overlapping window on that same aircraft for this long. It is not limited to one cancelled booking.",
    href: "scheduling/standby-and-slot-offers#decline-cooldown",
  },
  "slot-offer-max-pending": {
    title: "Max pending offers",
    summary:
      "A pending offer reserves the aircraft for the offered window. This school-wide cap limits how many can be open at once, so the board does not fill with locked time.",
    href: "scheduling/standby-and-slot-offers#max-pending-offers",
  },
  "slot-offer-max-pending-per-member": {
    title: "Max pending offers per person",
    summary:
      "Limits how many pending offers one member can hold at once (default 2). Stops a broad standby preference from filling one inbox and soft-holding that person across many windows.",
    href: "scheduling/standby-and-slot-offers#max-pending-offers-per-person",
  },
  "slot-offer-hold-urgent": {
    title: "Offer window when the slot is soon",
    summary:
      "When the slot starts within 24 hours, the offer reserves the aircraft for this long. Keep it short so a last-minute recovery does not lock the plane for hours.",
    href: "scheduling/standby-and-slot-offers#offer-window-when-slot-is-within-24-hours",
  },
  "slot-offer-ai-scanner": {
    title: "Fill idle time automatically",
    summary:
      "AerScheduler AI watches flying-day open aircraft time that matches standing preferences and sends timed offers. Off by default. Respects gap cooldown and a daily offer budget. Nobody is booked until they accept.",
    href: "scheduling/standby-and-slot-offers#fill-idle-time-automatically",
  },
  "slot-offer-hold-normal": {
    title: "Offer window when the slot is further out",
    summary:
      "When the slot starts more than 24 hours from now, the offer reserves the aircraft for this long so the member has time to see the notification and respond.",
    href: "scheduling/standby-and-slot-offers#offer-window-when-slot-is-further-out",
  },
  "slot-offer-scanner-min-gap": {
    title: "Minimum idle gap",
    summary:
      "AerScheduler AI ignores free scraps shorter than this. Shorter windows stay open for walk-up bookings.",
    href: "scheduling/standby-and-slot-offers#minimum-idle-gap--look-ahead", // em-dash-ok: MDX heading anchor
  },
  "slot-offer-scanner-horizon": {
    title: "Look-ahead window",
    summary:
      "How many days ahead AerScheduler AI looks for matching idle aircraft time.",
    href: "scheduling/standby-and-slot-offers#minimum-idle-gap--look-ahead", // em-dash-ok: MDX heading anchor
  },
  "slot-offer-scanner-max-day": {
    title: "Max AI offers per day",
    summary:
      "Caps how many new AerScheduler AI offers the school can create in a local day, so reserved windows and notifications stay bounded.",
    href: "scheduling/standby-and-slot-offers#max-ai-offers-per-day",
  },
  "pending-slot-offers": {
    title: "Pending offers",
    summary:
      "Offers currently open after a cancel, desk send, or AerScheduler AI. They also appear as dashed pending offers on the day and week boards. Instructor confirms appear first on duals. Withdraw frees the window and stops the chain so the desk can book by hand.",
    href: "scheduling/standby-and-slot-offers",
  },
  "aircraft-category-class": {
    title: "Category and class",
    summary:
      "What the aircraft is, in the same words a certificate uses. Pick the category first and the class narrows to the ones that belong to it. A glider or a powered lift has no class rating, so that field switches off.",
    href: "getting-started/aircraft-categories-and-meters",
  },
  "aircraft-meters": {
    title: "Meters",
    summary:
      "Which meters this aircraft has. Hours for billing come from the difference between two readings, so an aircraft set to None is not invoiced automatically and you raise those invoices by hand. Booking, ramp-out and ramp-in all work normally.",
    href: "getting-started/aircraft-categories-and-meters#meters",
  },
  "flying-day-hours": {
    title: "Flying day",
    summary:
      "The local hours when aircraft can be booked on a normal day. Same-day bookings must start and finish inside this window. Multi-day trips skip it. An aircraft can override the school default on its edit screen.",
    href: "scheduling/booking-rules-and-settings#flying-day",
  },
  "multi-day-bookings": {
    title: "Multi-day bookings",
    summary:
      "A trip's bill depends on how many nights it spans, and nights can only be counted in the airport's own time zone. Set a time zone first, or two people booking the same trip would be billed differently.",
    href: "scheduling/overnight-and-multi-day-trips",
  },
  "approved-resources": {
    title: "Approved resources",
    summary:
      "With this on, a student or renter booking themselves is refused any aircraft or simulator they aren't checked out on. Instructors, admins and dispatchers are never held to the list. Approve people from the aircraft or from their profile. This is not people groups.",
    href: "scheduling/booking-rules-and-settings",
  },
  "approve-members": {
    title: "Approve someone on an aircraft",
    summary:
      "Flip the switch on the aircraft (Approve members) or on their profile under Compliance, Approved aircraft. Students and renters both appear. Instructors are never held to the list. People groups are for currency rules, not checkouts.",
    href: "getting-started/approve-a-member-on-an-aircraft",
  },
  "booking-policy-rules": {
    title: "Booking and cancellation rules",
    summary:
      "Opt-in rules for cancel/edit lock, late-cancel fee, max upcoming bookings, max reservation length, and (ledger mode) minimum credit or max owing to self-book. Off by default. Members see a clear reason when a rule refuses them. Currency checks at book stay always on under Compliance.",
    href: "scheduling/booking-rules-and-settings#booking-and-cancellation-rules",
  },
  "what-you-can-book": {
    title: "What you can book",
    summary:
      "You only see the kinds of booking your roles allow, so an account with no flying role has nothing to offer. Ask an admin to add student, renter, instructor or technician to you under People.",
    href: "scheduling/who-can-do-what-on-the-schedule",
    linkLabel: "Who can book what",
  },

  /* ── Organization ─────────────────────────────────────────────────────── */

  "hide-announcement": {
    title: "Got it",
    summary:
      "Hides this notice from your Home. It stays on this page until an admin deletes it or it expires. Other members still see it until they tap Got it themselves.",
    href: "getting-started/post-an-announcement",
  },
  "delete-organization": {
    title: "Delete this school",
    summary:
      "This schedules permanent deletion in 30 days. The school keeps working until then, and any admin or owner can cancel from this page. Every admin and owner is emailed when the countdown starts.",
    href: "getting-started/delete-your-school",
  },

  /* ── Maintenance ──────────────────────────────────────────────────────── */

  "squawk-grounding": {
    title: "Grounding on a squawk",
    summary:
      "This records the reporter's judgement that the aircraft should not fly, and it does not take the tail off the line. To stop it being booked, an admin has to ground the aircraft from its own page.",
    href: "maintenance/report-a-squawk",
  },
  "squawk-notes": {
    title: "Notes on a squawk",
    summary:
      "Record what is happening without closing the squawk: part ordered, waiting on a hangar slot, ran it again and it did not repeat. Nobody can edit or delete a note afterwards, so correct a mistake by adding another.",
    href: "maintenance/add-a-note-to-a-squawk",
  },
  "inspection-last-done": {
    title: "When was it last done?",
    summary:
      "Leave this blank only if the work was just done, because the countdown otherwise starts today at the current meter. On an aircraft already partway through its interval, fill it in or the first reminder lands late.",
    href: "maintenance/set-when-an-inspection-was-last-done",
  },
  "inspection-grounds": {
    title: "Grounds the aircraft",
    summary:
      "When this inspection comes due the aircraft is grounded automatically and can only be booked for maintenance. Signing it off puts the aircraft back on the line by itself.",
    href: "maintenance/when-aerscheduler-grounds-an-aircraft",
  },
  "track-inspections": {
    title: "Inspections",
    summary:
      "An inspection is what an aircraft owes on a schedule: the annual, the 100 hour, the transponder check, an oil change. AerScheduler counts each one down on hours or days and warns you before it is due.",
    href: "maintenance/add-the-standard-airworthiness-inspections",
    linkLabel: "How inspection tracking works",
  },

  /* ── Airworthiness Directives ─────────────────────────────────────────── */

  "ad-tracking-mode": {
    title: "How much we do about ADs",
    summary:
      "Nothing here is on by default. Choose whether AerScheduler ignores Airworthiness Directives, keeps the records for the ones you enter, or stays out of the way because you track them in ADlog or AVTRAK. Nothing here watches for newly published directives yet.",
    href: "maintenance/choose-how-we-handle-airworthiness-directives",
  },
  "ad-match-quality": {
    title: "What we could match",
    summary:
      "An AD names the aircraft it applies to by make, model and usually a serial number range. This is how well we could narrow one, for when matching exists. Nothing proposes directives today, so a serial number is worth adding rather than urgent.",
    href: "maintenance/choose-how-we-handle-airworthiness-directives",
    linkLabel: "What a serial number buys you",
  },
  "inspection-source": {
    title: "Where this comes from",
    summary:
      "An Airworthiness Directive is binding under 14 CFR Part 39; a Service Bulletin is the manufacturer's advice. Saying which one this is puts a badge on the inspection and makes the sign-off keep a permanent compliance record.",
    href: "maintenance/track-airworthiness-directives",
  },
  "ad-revision-date": {
    title: "Revision date",
    summary:
      "The effective date of the AD version you complied with, which is the field 14 CFR 91.417(a)(2)(v) actually asks for. The amendment number beside it is the one a mechanic reads off the document.",
    href: "maintenance/track-airworthiness-directives",
  },
  "compliance-record": {
    title: "Keep a compliance record",
    summary:
      "A permanent entry saying what was done, the meter readings and who certified it. It cannot be edited or deleted by anyone once signed, including us, and a correction is a later record. It does not replace your 14 CFR 43.9 logbook entry.",
    href: "maintenance/sign-off-an-inspection",
  },
  "compliance-meters": {
    title: "Meter readings at compliance",
    summary:
      "Both meters are captured whatever the inspection counted, so the record still reads correctly to somebody working off the other clock. Neither is time in service as 14 CFR 1.1 defines it, which is wheels-off to touchdown.",
    href: "maintenance/sign-off-an-inspection",
  },
  "calendar-interval-unit": {
    title: "Days, weeks or calendar months",
    summary:
      "A calendar month runs to the END of the month, so 14 CFR 91.409(a)'s 12 calendar months makes an annual signed in February good through the end of February the following year. Setting it as 365 days brings it due up to a month early. Weeks are simply seven days each.",
    href: "maintenance/add-your-own-inspection",
    linkLabel: "Days, weeks, or calendar months",
  },
  "one-off-at-hours": {
    title: "Due at an hour reading",
    summary:
      "A deadline on the meter rather than the calendar, for an AD that says to comply within the next so many hours. Enter the reading it comes due AT, not how many hours from now, and it does not come back once signed off.",
    href: "maintenance/track-airworthiness-directives",
  },
  "compliance-log-scope": {
    title: "The compliance log",
    summary:
      "Every inspection signed off here, newest first. It records the ADs you entered; it does not tell you which ADs apply to your aircraft, so it is evidence of what was done rather than a complete AD status.",
    href: "maintenance/track-airworthiness-directives",
  },
  "aircraft-serial-number": {
    title: "Serial number",
    summary:
      "The manufacturer's serial number from the data plate, not the tail number. An AD's applicability is usually written against a serial number range, so without this we can only match by make and model.",
    href: "maintenance/choose-how-we-handle-airworthiness-directives",
  },

  /* ── Reports ──────────────────────────────────────────────────────────── */

  "report-date-basis": {
    title: "Which date the range applies to",
    summary:
      "Every report states the date its window is measured on. Revenue counts an invoice on the day it was raised and Payments received counts it on the day it was paid, so the same window gives two different totals and both are right.",
    href: "reports/date-ranges-and-time-zones",
  },
  "saved-view-dates": {
    title: "Saved views",
    summary:
      "A saved view remembers the filters, grouping, columns and sort that were on screen, plus the exact dates it was saved over rather than the words Last 30 days. Reset the date range if you want this month's numbers.",
    href: "reports/save-a-report-view",
  },
  "audit-who": {
    title: "Who",
    summary:
      "AerScheduler in this column means the system did it: a scheduled job, a payment webhook, or an invoice raised by a close-out. It is not a missing name.",
    href: "reports/audit-log",
  },

  /* ── Profile / calendars ──────────────────────────────────────────────── */

  "notification-preferences": {
    title: "Notification channels",
    summary:
      "Email, push, and SMS share the same categories, and each channel has its own master switch. SMS needs a verified US mobile first and is included in your plan. Reply STOP on any AerScheduler text to opt out.",
    href: "getting-started/notifications-and-emails",
  },
  "personal-calendar-sync": {
    title: "Personal calendars",
    summary:
      "Google gets a live push to your primary calendar. Apple Calendar and Outlook subscribe with a private link. Both are one-way from AerScheduler; regenerate the link if it ever leaks.",
    href: "scheduling/sync-your-personal-calendar",
  },
} satisfies Record<string, DocsTopic>;

export type DocsTopicKey = keyof typeof DOCS_TOPICS;

export function docsUrl(href: string): string {
  return `${DOCS_BASE_URL}/${href.replace(/^\//, "")}`;
}
