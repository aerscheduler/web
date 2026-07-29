# AerScheduler — Web Console

The web admin console for AerScheduler flight schools. A clean, modern React
app for the people who evaluate and run the product on a desktop — the school
owners, admins, and dispatchers — talking to the existing REST API at
`api.aerscheduler.com`.

> This replaces the old Flutter-web admin view. The Flutter app (`aerscheduler/app`)
> stays as the mobile app for renters/students/instructors; this is the web
> experience for the front desk.

## Stack

- **React 19** + **Vite 8** + **TypeScript**
- **TanStack Router** — type-safe, file-based routing (`src/routes`)
- **TanStack Query** — server state / caching (`src/features/queries.ts`)
- **TanStack Table** — sortable data grids (`src/components/data-table.tsx`)
- **TanStack Form** — forms (as screens grow)
- **Tailwind CSS v4** — design tokens in `src/styles.css`
- Auth: JWT bearer against the existing API (`src/lib/auth.tsx`, `src/lib/api.ts`)

## Getting started

Requires Node 20+ (Node 22 recommended).

```bash
npm install
npm run dev        # http://localhost:5173
```

In dev, requests to `/api/*` are proxied to `https://api.aerscheduler.com` (see
`vite.config.ts`), so sign in with a real AerScheduler account.

```bash
npm run build      # typecheck + production bundle -> dist/
npm run preview    # serve the built app
```

## How it's organized

```
src/
  routes/              file-based routes (TanStack Router)
    login.tsx          public sign-in
    _authed.tsx        auth guard + app shell (everything below needs a token)
    _authed/*.tsx      dashboard, schedule, people, aircraft, billing, settings
  components/          app-shell, page-header, data-table, states, ui/*
  features/queries.ts  all TanStack Query hooks (one place to see the API surface)
  lib/                 api client, auth store, theme, utils
  types/api.ts         entity types mirrored from the server Prisma schema
  styles.css           design system (light + dark tokens)
```

The full API surface this client is built against is documented in
`../_local/insights/api-contract.md`.

## Key facts about the API (so you don't get surprised)

- **Auth is a JWT bearer token**, returned as `auth.accessToken` from `POST /auth`.
  There's no refresh — re-login on 401.
- **The active organization is baked into the token.** To manage a different org,
  `POST /organizations/switch/:orgId` and swap the token (the org switcher does this).
- **Money is integer cents; dates are ISO strings.**
- Two id spaces: `User.id` (person) vs `OrganizationUser.id` (membership).

## Deploy

Hosted on **Vercel** (same place as the marketing site). Connect this repo in
Vercel and set one environment variable:

```
VITE_API_URL=https://api.aerscheduler.com
```

`vercel.json` sets the Vite framework preset and the SPA fallback rewrite so
client-side routes resolve on refresh. Every push to `main` auto-deploys.
