# Console E2E (Playwright)

Local / CI only. Refuses production API hosts unless `ALLOW_PROD_E2E=1`.

## Prerequisites

```bash
cd server && npm run dev          # :5001 + AERTEST01 seeded
# Re-run if booking tests hit the subscribe paywall (trial lapsed):
PGPASSWORD=mysecretpassword psql -h 127.0.0.1 -U admin -d mydb -f server/prisma/seed-test-accounts.sql
cd web && VITE_API_PROXY=http://127.0.0.1:5001 npm run dev
```

## Run

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
| `e2e/schedule/api-lifecycle.spec.ts` | Create / patch / cancel reservation via API |
| `e2e/schedule/slot-offer-cancel-recovery.spec.ts` | API: Standby → cancel → offer → accept; desk withdraw; Pending offers opens |
| `e2e/schedule/slot-offer-cancel-recovery-ui.spec.ts` | UI clicks: stand by → cancel dialog → Pending offers → Accept on Offers tab; Withdraw |
| `e2e/billing/invoices.spec.ts` | Billing / invoices reachable |
| `e2e/billing/ledger.spec.ts` | Ledger GET/auth/write contracts; `/me` Add funds + desk credit/refund/adjustment when mode is on |
| `e2e/people/invite.spec.ts` | People + invite sheet |
| `e2e/operations/hide-announcement.spec.ts` | Got it hides a notice from Home; board still lists it |
| `e2e/access/route-matrix.spec.ts` | Owner can open first N `ROUTE_ACCESS` routes |
| `e2e/onboarding/intent-logic.spec.ts` | Pure: landingPath→source, tracks, heard-from gate |
| `e2e/onboarding/checklist-tracks.spec.ts` | Dashboard `?track=` + `?checklist=fresh` Start here leads |

Preview query params (display-only, safe on any org):

- `?track=maintenance|clubs|reports|...` - reorder as that campaign
- `?checklist=show` - show a retired checklist
- `?checklist=fresh` - show and treat every item as undone (best for comparing tracks)

Cleanup cancels only E2E-tagged reservations (same markers as Flutter).

## Next (high value)

- Per-role `storageState` (7 files) + full route matrix
- Reservation state x role render matrix
- Create booking + ramp/close-out journeys with API asserts
