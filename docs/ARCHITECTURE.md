# Architecture

## Tenancy

| Concept | Table | Notes |
|---|---|---|
| Platform admin | `platform_admins` | `super_admin` or `support`. Granted only via SQL (`app.grant_platform_role`). Platform admins do **not** get tenant data access through RLS. |
| Tenant (business) | `tenants` | Created only through `create_tenant()`. The caller becomes the owner. |
| Member | `tenant_members` | User ↔ tenant with one role. Optional branch restriction via `member_branches`. |
| Role / permission | `roles`, `role_permissions`, `permissions` | System roles are copied from `role_templates` per tenant. Owners can edit non-owner roles in Settings. |
| Customer login | `customers.user_id` | Customers are not members. They see only rows linked to their own customer record. |

### RLS helpers (schema `app`, SECURITY DEFINER, `search_path=''`)

`is_member(t)`, `has_permission(t, perm)`, `can_access_branch(t, branch)`, `member_role_key(t)`, `is_customer_self(t, customer)`, `is_platform_admin()`.

### Guards (triggers)

- Members can't change their own role, status or branch access.
- Only owners can grant the owner role, and the last active owner can't be removed.
- The owner role always keeps every permission. System role keys can't change.
- Order money and identity columns change only via trusted functions.
- Staff with only `orders.update_status` can change the stage, nothing else. Per-stage `allowed_roles` is enforced.
- Online payment methods can't be written by users. Offline payments mark `verified_at` and recalculate the order's paid amount and status.
- `order_status_history` is written by trigger on every stage change.

## Default roles

| Permission area | Owner | Manager | Supervisor | Accountant | Staff | Driver |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Customers view / manage | ✓/✓ | ✓/✓ | ✓/✓ | ✓/– | ✓/– | |
| Orders view / manage / status | ✓ | ✓ | ✓ | view | view + status | |
| Payments & invoices | ✓ | ✓ | | ✓ | | |
| Logistics | ✓ | ✓ | ✓ | | | view |
| Staff manage | ✓ | ✓ | | | | |
| Settings, roles, billing | ✓ | | | | | |

## Storage

Private buckets: `tenant-assets`, `order-media`, `proofs`, `documents`, `invoices`. Object paths **must** start with `<tenant_id>/`. Policies resolve the tenant from the first path segment and check membership and permission. Serve files with signed URLs.

## Delivery status

| Phase | Status |
|---|---|
| 1. Foundation: Next.js, Supabase clients, auth flows, migrations, RLS, roles, app shell, design system, isolation tests | **Done** (29 DB tests passing) |
| 2. Core operations: onboarding (steps 1–3), dashboard, customers, services, orders, staff list, settings and role matrix | **Partly done**. Still to do: full 13-step onboarding, workflow builder UI, bookings UI, staff invites, branch management, service editing |
| 3. Payments (Paystack/Flutterwave webhooks), invoices, subscriptions, pickup/delivery, driver app, notifications | Not started (schema for payments exists) |
| 4–6. Growth, AI, SaaS billing, white-label | Not started |
| 7. Production deployment | Blocked on Supabase project and GitHub repository access |
