# Clena

**Run your service business.** Clena is a multi-tenant SaaS operating system for service businesses: laundry, dry cleaning, car wash, home, shortlet and commercial cleaning, and more. D'WashGuy is the first tenant.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, RLS) · Zod · Recharts · Lucide · Vercel

## Project structure

```
src/
  app/
    (marketing)/        public site: /, /features, /industries, /pricing, /contact, /demo
    auth/               login, register, forgot/reset password, /auth/confirm, /auth/continue
    onboarding/         business creation wizard
    app/                business management app (dashboard, orders, customers, services, team, settings)
    customer/           customer portal
    staff/              task-first staff screen
    driver/             driver screen
    platform/           Clena platform administration
  components/           ui primitives, app shell, brand, marketing
  lib/
    supabase/           client.ts (browser) · server.ts (per-request, RLS) · admin.ts (server-only, bypasses RLS)
    auth/               session + tenant resolution, permissions
  proxy.ts              session refresh + optimistic route protection
supabase/
  migrations/           all schema, RLS, functions, storage policies
  seed.sql              D'WashGuy demo tenant (flagged is_demo)
tests/db/               RLS and tenant-isolation tests against real Postgres
docs/                   ENVIRONMENT.md · DEPLOYMENT.md · ARCHITECTURE.md
```

## Getting started

```bash
cp .env.example .env.local   # add Supabase URL + publishable key
npm install
npm run dev
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm run test:db` | Applies every migration to a throwaway Postgres and runs the RLS / isolation suite |
| `npm run db:push` | Apply migrations to the linked Supabase project (non-destructive) |

## Security model (short version)

- Each tenant-owned row has `tenant_id`. RLS policies call `app.has_permission(tenant_id, '<perm>')`, which checks the signed-in user's **database** membership and role.
- The active tenant cookie is only a preference. It is accepted only if the user is a member of that tenant.
- Child tables use **composite foreign keys** `(tenant_id, parent_id)`, so a row can never be attached to another tenant's parent.
- Order prices are computed in `create_order()` from the services table. Totals and payment status can't be edited by clients. Online payments can only be written by the verified server path.
- See `docs/ARCHITECTURE.md` for details.

## Status

See `docs/ARCHITECTURE.md` → *Delivery status* for what is live and what's next.
