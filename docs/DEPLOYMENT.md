# Deployment

Clena runs on **Vercel** (app), **Supabase** (Postgres, Auth, Storage) and **GitHub** (source). Every push to `main` deploys to production. Every pull request gets a preview deployment.

## 1. Supabase

1. Create a project (region close to your users; for Nigeria, `eu-west-2` London or `af-south-1` Cape Town).
2. Link it and apply the migrations:
   ```bash
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push            # applies supabase/migrations/* (non-destructive)
   ```
   Do **not** run `supabase db reset` against production. It drops data.
3. Optional demo tenant (D'WashGuy): run `supabase/seed.sql` in the SQL editor. Then, after signing up:
   ```sql
   select app.attach_owner('dwashguy', 'you@example.com');
   ```
4. Make yourself a platform super admin (SQL editor):
   ```sql
   select app.grant_platform_role('you@example.com', 'super_admin');
   ```
5. **Authentication → URL configuration**
   - Site URL: `https://<your-domain>`
   - Redirect URLs: `https://<your-domain>/auth/confirm`, `https://*-<vercel-team>.vercel.app/auth/confirm` (previews)
6. **Authentication → Email templates.** To use the token-hash flow, set these links:
   - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset-password`

   The default PKCE `?code=` links also work, because `/auth/confirm` handles both.
7. Configure custom SMTP (Resend) under **Authentication → SMTP**. The built-in sender is rate-limited.

## 2. GitHub

The repository is `clena` (private). Branch protection on `main` is recommended: require PR review and passing checks.

## 3. Vercel

1. Import the GitHub repository (framework preset: Next.js; no build overrides needed).
2. Add the environment variables from `docs/ENVIRONMENT.md` for **Production** and **Preview**.
3. Production branch: `main`. Preview deployments are created for every PR automatically.
4. Domains: start with the Vercel URL. When the domain is ready, add `clena.app` (marketing) and `app.clena.app`, then update `NEXT_PUBLIC_APP_URL` and the Supabase auth URLs.

## 4. Verify

- `/` loads, `/pricing` shows plans from the database.
- Register, confirm your email, create a business, add a branch, then a customer, an order and a status change.
- Sign in as a second user and confirm you cannot see the first business's data.
- Record a cash payment and check the order changes to Paid.
