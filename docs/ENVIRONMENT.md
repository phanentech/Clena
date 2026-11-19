# Environment configuration

Clena reads configuration from environment variables. `.env.example` lists every variable with placeholder values.

| Variable | Where | Required | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | public | yes | Canonical URL (`https://app.clena.app` or the Vercel URL). |
| `NEXT_PUBLIC_SUPABASE_URL` | public | yes | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | yes | Supabase publishable (anon) key. Safe in the browser; RLS protects data. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a fallback name. |
| `SUPABASE_SECRET_KEY` | **server only** | Phase 3 | Secret/service-role key. Bypasses RLS. Used only by webhooks and background jobs via `src/lib/supabase/admin.ts`. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | public | no | Shown on Contact and Demo pages. |
| `NEXT_PUBLIC_CONTACT_WHATSAPP` | public | no | WhatsApp number for the Contact page. |
| `PAYSTACK_*`, `FLUTTERWAVE_*` | server only | Phase 3 | Clena's own SaaS billing keys. Tenants connect their own provider keys inside the app. |
| `RESEND_API_KEY`, `EMAIL_FROM` | server only | Phase 3 | Transactional email. |
| `WHATSAPP_*`, `SMS_*` | server only | Phase 3 | Messaging providers. |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | public | Phase 3 | Maps for drivers (restrict the token by URL in Mapbox). |
| `AI_PROVIDER`, `ANTHROPIC_API_KEY` | server only | Phase 5 | Clena AI assistant. |

## Rules

- Anything without the `NEXT_PUBLIC_` prefix never reaches the browser. Server secrets are read only in `src/lib/env.server.ts`, which imports `server-only`, so importing it from client code fails the build.
- Never commit `.env.local` or any file containing real keys. `.gitignore` excludes `.env*` except `.env.example`.
- In production, set variables in **Vercel → Project → Settings → Environment Variables**. Use separate values for Production and Preview (point Preview at a staging Supabase project).

## Local development

```bash
cp .env.example .env.local      # fill in the Supabase URL + publishable key
npm install
npm run dev
```

With the Supabase CLI and Docker you can also run the whole backend locally:

```bash
supabase start                  # applies supabase/migrations and supabase/seed.sql
# use the printed API URL and publishable key in .env.local
```
