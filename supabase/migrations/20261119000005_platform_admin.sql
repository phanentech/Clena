-- =============================================================================
-- Clena — Platform administration: roles, suspension, email outbox, pricing in
-- several currencies and billing periods, coupons, payment gateways, bank
-- accounts, SaaS invoices, AI models, help desk, partners, platform branding.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Platform roles and permissions (configurable). super_admin always has all.
-- ---------------------------------------------------------------------------
create table public.platform_roles (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null,
  description text,
  is_system boolean not null default false
);
insert into public.platform_roles (key, name, description, is_system) values
  ('super_admin', 'Super admin', 'Full access to everything on the platform', true),
  ('support', 'Support agent', 'Help desk and read-only access to businesses', true),
  ('finance', 'Finance', 'Billing, invoices, bank transfers and payment gateways', true),
  ('sales', 'Sales & marketing', 'Coupons, partners and plans', true),
  ('viewer', 'Viewer', 'Read-only access to the platform console', true);

alter table public.platform_admins alter column role type text using role::text;
alter table public.platform_admins add constraint platform_admins_role_fk foreign key (role) references public.platform_roles (key);

create table public.platform_permissions (
  key text primary key,
  description text not null
);
insert into public.platform_permissions (key, description) values
  ('tenants.view', 'View businesses and their subscription'),
  ('tenants.manage', 'Suspend, reactivate and change businesses'),
  ('plans.manage', 'Edit plans, prices and billing periods'),
  ('billing.view', 'View invoices and payments'),
  ('billing.manage', 'Confirm transfers, configure gateways and bank accounts'),
  ('marketing.manage', 'Create and edit coupons'),
  ('ai.manage', 'Configure AI models and providers'),
  ('platform.settings', 'Edit platform branding and settings'),
  ('helpdesk.manage', 'Answer and manage support tickets'),
  ('partners.manage', 'Manage partners and referrals'),
  ('users.manage', 'Grant and remove platform access');

create table public.platform_role_permissions (
  role_key text not null references public.platform_roles (key) on delete cascade,
  permission_key text not null references public.platform_permissions (key) on delete cascade,
  primary key (role_key, permission_key)
);
insert into public.platform_role_permissions (role_key, permission_key)
select 'support', unnest(array['tenants.view', 'helpdesk.manage', 'billing.view'])
union all select 'finance', unnest(array['tenants.view', 'billing.view', 'billing.manage', 'plans.manage'])
union all select 'sales', unnest(array['tenants.view', 'marketing.manage', 'partners.manage', 'plans.manage'])
union all select 'viewer', unnest(array['tenants.view', 'billing.view']);

create or replace function app.has_platform_permission(p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.platform_admins a
    where a.user_id = auth.uid()
      and (a.role = 'super_admin'
           or exists (select 1 from public.platform_role_permissions rp where rp.role_key = a.role and rp.permission_key = p_permission))
  );
$$;
grant execute on function app.has_platform_permission(text) to authenticated, anon, service_role;

alter table public.platform_roles enable row level security;
alter table public.platform_permissions enable row level security;
alter table public.platform_role_permissions enable row level security;
create policy platform_roles_read on public.platform_roles for select to authenticated using (app.is_platform_admin());
create policy platform_roles_write on public.platform_roles for all to authenticated
  using (app.is_platform_super_admin()) with check (app.is_platform_super_admin());
create policy platform_permissions_read on public.platform_permissions for select to authenticated using (app.is_platform_admin());
create policy platform_role_permissions_read on public.platform_role_permissions for select to authenticated using (app.is_platform_admin());
create policy platform_role_permissions_write on public.platform_role_permissions for all to authenticated
  using (app.is_platform_super_admin()) with check (app.is_platform_super_admin());

drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = auth.uid() or app.has_platform_permission('users.manage'));
create policy platform_admins_write on public.platform_admins for all to authenticated
  using (app.is_platform_super_admin()) with check (app.is_platform_super_admin());

create or replace function app.guard_platform_admin_self()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.user_id = auth.uid() then
    raise exception 'You cannot remove your own platform access' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.user_id = auth.uid() and new.role <> old.role then
    raise exception 'You cannot change your own platform role' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger platform_admins_guard before update or delete on public.platform_admins
  for each row execute function app.guard_platform_admin_self();

drop function if exists app.grant_platform_role(text, public.platform_role);
create or replace function app.grant_platform_role(p_email text, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.platform_admins (user_id, role)
  select id, p_role from auth.users where lower(email) = lower(p_email)
  on conflict (user_id) do update set role = excluded.role;
  if not found then raise exception 'No user with that email'; end if;
end $$;
revoke all on function app.grant_platform_role(text, text) from public, anon, authenticated;

-- Platform staff with tenants.view can read businesses (not their customers or orders).
drop policy if exists tenants_member_select on public.tenants;
create policy tenants_member_select on public.tenants for select to authenticated
  using (app.is_member(id) or app.has_platform_permission('tenants.view'));
drop policy if exists tenant_subscriptions_select on public.tenant_subscriptions;
create policy tenant_subscriptions_select on public.tenant_subscriptions for select to authenticated
  using (app.has_permission(tenant_id, 'billing.manage') or app.has_platform_permission('tenants.view'));

-- ---------------------------------------------------------------------------
-- Suspension with a reason, history, and an email to the business
-- ---------------------------------------------------------------------------
create table public.suspension_reasons (
  key text primary key,
  label text not null,
  customer_message text not null,
  sort_order int not null default 0
);
insert into public.suspension_reasons (key, label, customer_message, sort_order) values
  ('non_payment', 'Unpaid subscription', 'Your Clena subscription payment is overdue. Pay the outstanding invoice to restore access.', 1),
  ('payment_reversed', 'Payment reversed or charged back', 'A payment for your subscription was reversed or disputed. Please contact billing to settle the balance.', 2),
  ('trial_expired', 'Trial ended without a plan', 'Your free trial has ended. Choose a plan to continue using Clena.', 3),
  ('terms_violation', 'Breach of terms of service', 'Your account was found to breach the Clena terms of service.', 4),
  ('fraud_suspected', 'Suspected fraud', 'We detected activity on your account that we need to review for fraud.', 5),
  ('spam_abuse', 'Spam or abusive messaging', 'Messages sent from your account were reported as spam or abusive.', 6),
  ('illegal_activity', 'Illegal or prohibited business', 'Your business activity appears to be prohibited on Clena.', 7),
  ('security_risk', 'Security risk or compromised account', 'We suspended your account to protect it after signs that it may be compromised.', 8),
  ('data_privacy', 'Misuse of customer data', 'We received a report that customer data was used in breach of privacy rules.', 9),
  ('kyc_pending', 'Business verification needed', 'We need to verify your business details before your account can be used.', 10),
  ('owner_request', 'Requested by the business owner', 'Your account was paused at your request.', 11),
  ('duplicate_account', 'Duplicate account', 'This account duplicates another Clena account for the same business.', 12),
  ('inactivity', 'Long-term inactivity', 'Your account was paused after a long period without activity.', 13),
  ('legal_request', 'Legal or regulatory order', 'We were required to suspend your account by a legal or regulatory request.', 14),
  ('chargeback_risk', 'Unusual payment risk', 'Unusual payment activity requires review before your account can continue.', 15),
  ('other', 'Other', 'Your account has been suspended. See the note from our team below.', 99);
alter table public.suspension_reasons enable row level security;
create policy suspension_reasons_read on public.suspension_reasons for select to authenticated using (true);

alter table public.tenants
  add column suspended_at timestamptz,
  add column suspension_reason text references public.suspension_reasons (key),
  add column suspension_note text,
  add column partner_id uuid,
  add column preferred_language text not null default 'en' check (preferred_language in ('en', 'fr', 'pt', 'es', 'ar', 'sw'));

create table public.tenant_status_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  from_status public.tenant_status not null,
  to_status public.tenant_status not null,
  reason text references public.suspension_reasons (key),
  note text,
  notified boolean not null default false,
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index tenant_status_events_tenant_idx on public.tenant_status_events (tenant_id, created_at desc);
alter table public.tenant_status_events enable row level security;
create policy tenant_status_events_read on public.tenant_status_events for select to authenticated
  using (app.has_platform_permission('tenants.view'));

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete set null,
  to_email text not null,
  subject text not null,
  body_text text not null,
  template text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  provider text,
  provider_message_id text,
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_outbox_status_idx on public.email_outbox (status, created_at);
alter table public.email_outbox enable row level security;
create policy email_outbox_read on public.email_outbox for select to authenticated
  using (app.has_platform_permission('tenants.view'));

-- Emails of the people who own a business, plus the business email.
create or replace function app.tenant_owner_emails(p_tenant uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select array(select distinct e from (
    select lower(u.email) e from public.tenant_members m
      join public.roles r on r.id = m.role_id and r.key = 'owner'
      join auth.users u on u.id = m.user_id
      where m.tenant_id = p_tenant and m.status = 'active' and u.email is not null
    union select lower(t.email) from public.tenants t where t.id = p_tenant and t.email is not null) x);
$$;

create or replace function public.platform_set_tenant_status(
  p_tenant uuid, p_status public.tenant_status, p_reason text default null, p_note text default null, p_notify boolean default true
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_t record; v_msg text; v_label text; v_email text; v_count int := 0; v_platform text;
begin
  if not app.has_platform_permission('tenants.manage') then
    raise exception 'You do not have permission to change business status' using errcode = '42501';
  end if;
  select * into v_t from public.tenants where id = p_tenant for update;
  if v_t.id is null then raise exception 'Business not found' using errcode = 'P0002'; end if;
  if p_status = 'suspended' and p_reason is null then
    raise exception 'Choose a reason for the suspension' using errcode = '22023';
  end if;
  if p_status = 'suspended' and p_reason = 'other' and coalesce(trim(p_note), '') = '' then
    raise exception 'Add a note explaining the suspension' using errcode = '22023';
  end if;
  select coalesce(value ->> 'product_name', 'Clena') into v_platform from public.platform_settings where key = 'branding';
  v_platform := coalesce(v_platform, 'Clena');

  update public.tenants set
    status = p_status,
    suspended_at = case when p_status = 'suspended' then now() else null end,
    suspension_reason = case when p_status = 'suspended' then p_reason else null end,
    suspension_note = case when p_status = 'suspended' then nullif(trim(p_note), '') else null end
  where id = p_tenant;

  if p_notify and p_status in ('suspended', 'active') and v_t.status is distinct from p_status then
    select label, customer_message into v_label, v_msg from public.suspension_reasons where key = p_reason;
    foreach v_email in array app.tenant_owner_emails(p_tenant) loop
      insert into public.email_outbox (tenant_id, to_email, subject, body_text, template)
      values (p_tenant, v_email,
        case when p_status = 'suspended' then v_t.name || ' has been suspended on ' || v_platform
             else v_t.name || ' is active again on ' || v_platform end,
        case when p_status = 'suspended' then
          'Hello,' || E'\n\n' || 'Your business account "' || v_t.name || '" on ' || v_platform || ' has been suspended.' || E'\n\n' ||
          'Reason: ' || v_label || E'\n' || v_msg ||
          coalesce(E'\n\nNote from our team: ' || nullif(trim(p_note), ''), '') || E'\n\n' ||
          'While suspended, you and your team cannot sign in to the business. Your data is kept safe.' || E'\n' ||
          'Reply to this email or contact support if you believe this is a mistake.' || E'\n\n' || 'The ' || v_platform || ' team'
        else
          'Hello,' || E'\n\n' || 'Your business account "' || v_t.name || '" on ' || v_platform || ' has been reactivated. You and your team can sign in again.' ||
          E'\n\n' || 'The ' || v_platform || ' team'
        end,
        case when p_status = 'suspended' then 'tenant_suspended' else 'tenant_reactivated' end);
      v_count := v_count + 1;
    end loop;
  end if;

  insert into public.tenant_status_events (tenant_id, from_status, to_status, reason, note, notified, actor_id)
  values (p_tenant, v_t.status, p_status, case when p_status = 'suspended' then p_reason end, nullif(trim(p_note), ''), v_count > 0, auth.uid());
  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, data)
  values (p_tenant, auth.uid(), 'tenant.status_changed', 'tenant', p_tenant,
          jsonb_build_object('from', v_t.status, 'to', p_status, 'reason', p_reason));
  return jsonb_build_object('emails_queued', v_count);
end $$;
revoke execute on function public.platform_set_tenant_status(uuid, public.tenant_status, text, text, boolean) from public, anon;
grant execute on function public.platform_set_tenant_status(uuid, public.tenant_status, text, text, boolean) to authenticated;

-- What a member of a suspended business sees instead of the app.
create or replace function public.my_suspended_tenants()
returns table (tenant_id uuid, tenant_name text, reason_label text, customer_message text, note text, suspended_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name, r.label, r.customer_message, t.suspension_note, t.suspended_at
  from public.tenant_members m join public.tenants t on t.id = m.tenant_id
  left join public.suspension_reasons r on r.key = t.suspension_reason
  where m.user_id = auth.uid() and m.status = 'active' and t.status = 'suspended';
$$;
revoke execute on function public.my_suspended_tenants() from public, anon;
grant execute on function public.my_suspended_tenants() to authenticated;

-- ---------------------------------------------------------------------------
-- Pricing: currencies, billing periods, plan prices
-- ---------------------------------------------------------------------------
create table public.billing_periods (
  key text primary key,
  label text not null,
  months int not null check (months between 1 and 120),
  discount_percent numeric(5, 2) not null default 0 check (discount_percent between 0 and 90),
  is_active boolean not null default true,
  sort_order int not null default 0
);
insert into public.billing_periods (key, label, months, discount_percent, sort_order) values
  ('monthly', 'Monthly', 1, 0, 1),
  ('quarterly', 'Every 3 months', 3, 5, 2),
  ('semiannual', 'Every 6 months', 6, 8, 3),
  ('annual', 'Yearly', 12, 15, 4),
  ('biennial', '2 years', 24, 20, 5),
  ('triennial', '3 years', 36, 25, 6),
  ('quinquennial', '5 years', 60, 30, 7);

create table public.plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  monthly_price numeric(12, 2) not null check (monthly_price >= 0),
  is_active boolean not null default true,
  unique (plan_id, currency)
);
insert into public.plan_prices (plan_id, currency, monthly_price)
select id, 'NGN', price_monthly from public.plans
union all select id, 'USD', case code when 'starter' then 15 when 'growth' then 35 when 'business' then 79 else 0 end from public.plans;

alter table public.billing_periods enable row level security;
alter table public.plan_prices enable row level security;
create policy billing_periods_read on public.billing_periods for select to anon, authenticated using (is_active or app.is_platform_admin());
create policy billing_periods_write on public.billing_periods for all to authenticated
  using (app.has_platform_permission('plans.manage')) with check (app.has_platform_permission('plans.manage'));
create policy plan_prices_read on public.plan_prices for select to anon, authenticated using (is_active or app.is_platform_admin());
create policy plan_prices_write on public.plan_prices for all to authenticated
  using (app.has_platform_permission('plans.manage')) with check (app.has_platform_permission('plans.manage'));
drop policy if exists plans_admin_write on public.plans;
create policy plans_admin_write on public.plans for all to authenticated
  using (app.has_platform_permission('plans.manage')) with check (app.has_platform_permission('plans.manage'));

-- ---------------------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------------------
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,40}$'),
  name text not null,
  description text,
  kind text not null check (kind in ('percent', 'fixed', 'free_months', 'trial_extension')),
  value numeric(12, 2) not null check (value > 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  max_redemptions int check (max_redemptions is null or max_redemptions > 0),
  per_tenant_limit int not null default 1 check (per_tenant_limit > 0),
  redeemed_count int not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  plan_ids uuid[],
  period_keys text[],
  currencies text[],
  tenant_ids uuid[],
  partner_id uuid,
  new_businesses_only boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100),
  check (kind <> 'fixed' or currency is not null)
);
create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  invoice_id uuid,
  amount_off numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);
create index coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id);
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
create policy coupons_admin on public.coupons for all to authenticated
  using (app.has_platform_permission('marketing.manage')) with check (app.has_platform_permission('marketing.manage'));
create policy coupon_redemptions_admin on public.coupon_redemptions for select to authenticated
  using (app.has_platform_permission('marketing.manage') or app.has_platform_permission('billing.view'));

-- ---------------------------------------------------------------------------
-- Payment gateways and bank accounts (for businesses paying Clena)
-- ---------------------------------------------------------------------------
create table public.payment_gateways (
  key text primary key,
  display_name text not null,
  description text,
  is_enabled boolean not null default false,
  mode text not null default 'test' check (mode in ('test', 'live')),
  public_key text,
  supported_currencies text[] not null default '{}',
  countries text[] not null default '{}',
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.payment_gateways (key, display_name, description, supported_currencies, countries, sort_order) values
  ('paystack', 'Paystack', 'Cards, bank transfer, USSD and mobile money across Nigeria, Ghana, Kenya and South Africa.', '{NGN,GHS,KES,ZAR,USD}', '{NG,GH,KE,ZA}', 1),
  ('flutterwave', 'Flutterwave', 'Cards, mobile money and bank payments across Africa.', '{NGN,GHS,KES,ZAR,UGX,TZS,XOF,XAF,USD,EUR,GBP}', '{NG,GH,KE,ZA,UG,TZ,SN,CI,CM}', 2),
  ('stripe', 'Stripe', 'International cards and wallets in USD, EUR and GBP.', '{USD,EUR,GBP}', '{US,GB,FR,DE,ES,PT}', 3),
  ('monnify', 'Monnify', 'Nigerian bank transfers with dedicated virtual accounts.', '{NGN}', '{NG}', 4),
  ('opay', 'OPay', 'OPay wallet and cards in Nigeria.', '{NGN}', '{NG}', 5),
  ('paypal', 'PayPal', 'PayPal balance and cards for international customers.', '{USD,EUR,GBP}', '{US,GB,FR,DE,ES,PT}', 6),
  ('mpesa', 'M-Pesa', 'Mobile money in Kenya and Tanzania.', '{KES,TZS}', '{KE,TZ}', 7),
  ('bank_transfer', 'Bank transfer', 'Customers pay into your bank account and you confirm the payment.', '{NGN,USD,GHS,KES,EUR,GBP}', '{}', 0);
update public.payment_gateways set is_enabled = true, mode = 'live' where key = 'bank_transfer';

-- Secrets are only reachable with the server's service role (no policies).
create table public.payment_gateway_secrets (
  gateway_key text primary key references public.payment_gateways (key) on delete cascade,
  secret_key text,
  webhook_secret text,
  updated_at timestamptz not null default now()
);
alter table public.payment_gateways enable row level security;
alter table public.payment_gateway_secrets enable row level security;
create policy payment_gateways_read on public.payment_gateways for select to authenticated
  using (is_enabled or app.has_platform_permission('billing.manage'));
create policy payment_gateways_write on public.payment_gateways for update to authenticated
  using (app.has_platform_permission('billing.manage')) with check (app.has_platform_permission('billing.manage'));

create table public.platform_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  account_name text not null,
  account_number text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  country text,
  swift_code text,
  iban text,
  routing_number text,
  sort_code text,
  instructions text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.platform_bank_accounts enable row level security;
create policy platform_bank_accounts_read on public.platform_bank_accounts for select to authenticated
  using (is_active or app.has_platform_permission('billing.manage'));
create policy platform_bank_accounts_write on public.platform_bank_accounts for all to authenticated
  using (app.has_platform_permission('billing.manage')) with check (app.has_platform_permission('billing.manage'));

-- ---------------------------------------------------------------------------
-- SaaS invoices, quotes and checkout
-- ---------------------------------------------------------------------------
create table public.saas_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  number text not null unique,
  plan_id uuid not null references public.plans (id),
  period_key text not null references public.billing_periods (key),
  months int not null,
  currency text not null,
  subtotal numeric(12, 2) not null,
  period_discount numeric(12, 2) not null default 0,
  coupon_id uuid references public.coupons (id) on delete set null,
  coupon_code text,
  coupon_discount numeric(12, 2) not null default 0,
  bonus_months int not null default 0,
  total numeric(12, 2) not null check (total >= 0),
  status text not null default 'pending' check (status in ('pending', 'awaiting_confirmation', 'paid', 'failed', 'cancelled')),
  gateway text references public.payment_gateways (key),
  provider_reference text unique,
  transfer_reference text,
  transfer_note text,
  paid_at timestamptz,
  confirmed_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index saas_invoices_tenant_idx on public.saas_invoices (tenant_id, created_at desc);
create index saas_invoices_status_idx on public.saas_invoices (status);
alter table public.saas_invoices enable row level security;
create policy saas_invoices_read on public.saas_invoices for select to authenticated
  using (app.has_permission(tenant_id, 'billing.manage') or app.has_platform_permission('billing.view'));

create or replace function app.coupon_check(p_code text, p_tenant uuid, p_plan uuid, p_period text, p_currency text)
returns public.coupons language plpgsql stable security definer set search_path = '' as $$
declare v public.coupons; v_used int;
begin
  select * into v from public.coupons where code = upper(trim(p_code));
  if v.id is null or not v.is_active then raise exception 'That coupon code is not valid' using errcode = '22023'; end if;
  if v.starts_at is not null and now() < v.starts_at then raise exception 'That coupon is not active yet' using errcode = '22023'; end if;
  if v.expires_at is not null and now() > v.expires_at then raise exception 'That coupon has expired' using errcode = '22023'; end if;
  if v.max_redemptions is not null and v.redeemed_count >= v.max_redemptions then raise exception 'That coupon has been fully used' using errcode = '22023'; end if;
  if v.tenant_ids is not null and not (p_tenant = any (v.tenant_ids)) then raise exception 'That coupon is not available for this business' using errcode = '22023'; end if;
  if v.plan_ids is not null and not (p_plan = any (v.plan_ids)) then raise exception 'That coupon does not apply to this plan' using errcode = '22023'; end if;
  if v.period_keys is not null and not (p_period = any (v.period_keys)) then raise exception 'That coupon does not apply to this billing period' using errcode = '22023'; end if;
  if v.currencies is not null and not (p_currency = any (v.currencies)) then raise exception 'That coupon does not apply to this currency' using errcode = '22023'; end if;
  if v.kind = 'fixed' and v.currency <> p_currency then raise exception 'That coupon is for payments in %', v.currency using errcode = '22023'; end if;
  select count(*) into v_used from public.coupon_redemptions where coupon_id = v.id and tenant_id = p_tenant;
  if v_used >= v.per_tenant_limit then raise exception 'This business has already used that coupon' using errcode = '22023'; end if;
  if v.new_businesses_only and exists (select 1 from public.saas_invoices where tenant_id = p_tenant and status = 'paid') then
    raise exception 'That coupon is only for a first subscription' using errcode = '22023';
  end if;
  return v;
end $$;

create or replace function public.quote_subscription(p_tenant uuid, p_plan uuid, p_period text, p_currency text, p_coupon text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_price numeric; v_months int; v_disc numeric; v_sub numeric; v_pd numeric; v_cd numeric := 0; v_bonus int := 0; v_c public.coupons; v_after numeric;
begin
  if not (app.has_permission(p_tenant, 'billing.manage') or app.has_platform_permission('billing.view')) then
    raise exception 'You do not have permission to manage billing' using errcode = '42501';
  end if;
  select monthly_price into v_price from public.plan_prices pp join public.plans p on p.id = pp.plan_id
    where pp.plan_id = p_plan and pp.currency = p_currency and pp.is_active and p.is_active;
  if v_price is null then raise exception 'This plan is not available in %', p_currency using errcode = '22023'; end if;
  select months, discount_percent into v_months, v_disc from public.billing_periods where key = p_period and is_active;
  if v_months is null then raise exception 'Billing period not available' using errcode = '22023'; end if;
  v_sub := round(v_price * v_months, 2);
  v_pd := round(v_sub * v_disc / 100, 2);
  v_after := v_sub - v_pd;
  if nullif(trim(coalesce(p_coupon, '')), '') is not null then
    v_c := app.coupon_check(p_coupon, p_tenant, p_plan, p_period, p_currency);
    if v_c.kind = 'percent' then v_cd := round(v_after * v_c.value / 100, 2);
    elsif v_c.kind = 'fixed' then v_cd := least(v_after, v_c.value);
    elsif v_c.kind = 'free_months' then v_bonus := v_c.value::int;
    end if;
  end if;
  return jsonb_build_object(
    'monthly_price', v_price, 'months', v_months, 'subtotal', v_sub, 'period_discount_percent', v_disc,
    'period_discount', v_pd, 'coupon_code', v_c.code, 'coupon_name', v_c.name, 'coupon_kind', v_c.kind,
    'coupon_discount', v_cd, 'bonus_months', v_bonus, 'total', greatest(0, v_after - v_cd), 'currency', p_currency,
    'trial_extension_days', case when v_c.kind = 'trial_extension' then v_c.value::int end);
end $$;

create or replace function public.start_saas_checkout(p_tenant uuid, p_plan uuid, p_period text, p_currency text, p_gateway text, p_coupon text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_q jsonb; v_id uuid; v_c uuid;
begin
  if not app.has_permission(p_tenant, 'billing.manage') then
    raise exception 'Only the business owner can pay for a plan' using errcode = '42501';
  end if;
  if not exists (select 1 from public.payment_gateways where key = p_gateway and is_enabled and p_currency = any (supported_currencies)) then
    raise exception 'That payment method is not available for %', p_currency using errcode = '22023';
  end if;
  v_q := public.quote_subscription(p_tenant, p_plan, p_period, p_currency, p_coupon);
  if v_q ->> 'coupon_kind' = 'trial_extension' then
    raise exception 'Trial coupons are applied without payment. Use "Apply to trial".' using errcode = '22023';
  end if;
  select id into v_c from public.coupons where code = v_q ->> 'coupon_code';
  insert into public.saas_invoices (tenant_id, number, plan_id, period_key, months, currency, subtotal, period_discount,
                                    coupon_id, coupon_code, coupon_discount, bonus_months, total, gateway, created_by)
  values (p_tenant, 'CLN-' || to_char(now(), 'YYMM') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
          p_plan, p_period, (v_q ->> 'months')::int, p_currency, (v_q ->> 'subtotal')::numeric, (v_q ->> 'period_discount')::numeric,
          v_c, v_q ->> 'coupon_code', (v_q ->> 'coupon_discount')::numeric, (v_q ->> 'bonus_months')::int,
          (v_q ->> 'total')::numeric, p_gateway, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Extend the subscription once an invoice is paid (from a verified gateway or a confirmed transfer).
create or replace function app.apply_paid_invoice(p_invoice uuid, p_reference text, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.saas_invoices; v_sub record; v_start timestamptz; v_end timestamptz;
begin
  select * into v from public.saas_invoices where id = p_invoice for update;
  if v.id is null then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  if v.status = 'paid' then return; end if;  -- idempotent: webhooks may repeat
  update public.saas_invoices set status = 'paid', paid_at = now(), confirmed_by = p_actor,
    provider_reference = coalesce(provider_reference, nullif(p_reference, ''))
  where id = v.id;
  select * into v_sub from public.tenant_subscriptions where tenant_id = v.tenant_id order by created_at desc limit 1;
  v_start := greatest(now(), coalesce(case when v_sub.status = 'active' then v_sub.current_period_end end, now()));
  v_end := v_start + make_interval(months => v.months + v.bonus_months);
  insert into public.tenant_subscriptions (tenant_id, plan_id, status, billing_interval, current_period_start, current_period_end, provider, provider_reference)
  values (v.tenant_id, v.plan_id, 'active', case when v.months >= 12 then 'annual' else 'monthly' end::public.billing_interval,
          v_start, v_end, v.gateway, coalesce(p_reference, v.number));
  update public.tenants set plan_id = v.plan_id,
    status = case when status in ('trial', 'past_due') or (status = 'suspended' and suspension_reason in ('non_payment', 'trial_expired')) then 'active'::public.tenant_status else status end,
    suspended_at = case when status = 'suspended' and suspension_reason in ('non_payment', 'trial_expired') then null else suspended_at end,
    suspension_reason = case when status = 'suspended' and suspension_reason in ('non_payment', 'trial_expired') then null else suspension_reason end
  where id = v.tenant_id;
  if v.coupon_id is not null then
    insert into public.coupon_redemptions (coupon_id, tenant_id, invoice_id, amount_off) values (v.coupon_id, v.tenant_id, v.id, v.coupon_discount);
    update public.coupons set redeemed_count = redeemed_count + 1 where id = v.coupon_id;
  end if;
end $$;

create or replace function public.submit_bank_transfer(p_invoice uuid, p_reference text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.saas_invoices where id = p_invoice and gateway = 'bank_transfer' and status in ('pending', 'awaiting_confirmation');
  if v_tenant is null or not app.has_permission(v_tenant, 'billing.manage') then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if length(trim(coalesce(p_reference, ''))) < 4 then raise exception 'Enter the transfer reference from your bank' using errcode = '22023'; end if;
  update public.saas_invoices set status = 'awaiting_confirmation', transfer_reference = trim(p_reference), transfer_note = nullif(trim(p_note), '')
  where id = p_invoice;
end $$;

create or replace function public.platform_confirm_invoice(p_invoice uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app.has_platform_permission('billing.manage') then
    raise exception 'You do not have permission to confirm payments' using errcode = '42501';
  end if;
  if p_approve then
    perform app.apply_paid_invoice(p_invoice, null, auth.uid());
  else
    update public.saas_invoices set status = 'failed', transfer_note = coalesce(transfer_note || E'\n', '') || 'Rejected: ' || coalesce(p_note, '')
    where id = p_invoice and status <> 'paid';
  end if;
end $$;

-- Called by the server after verifying a gateway payment with the provider (service role only).
create or replace function public.gateway_confirm_invoice(p_invoice uuid, p_reference text, p_amount numeric, p_currency text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.saas_invoices;
begin
  select * into v from public.saas_invoices where id = p_invoice;
  if v.id is null then raise exception 'Invoice not found'; end if;
  if v.currency <> p_currency or p_amount + 0.01 < v.total then
    update public.saas_invoices set status = 'failed', transfer_note = 'Amount or currency mismatch from gateway' where id = p_invoice and status <> 'paid';
    raise exception 'Paid amount does not match the invoice';
  end if;
  perform app.apply_paid_invoice(p_invoice, p_reference, null);
end $$;

create or replace function public.redeem_trial_coupon(p_tenant uuid, p_code text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v public.coupons; v_sub record; v_end timestamptz;
begin
  if not app.has_permission(p_tenant, 'billing.manage') then raise exception 'Only the business owner can apply coupons' using errcode = '42501'; end if;
  select * into v_sub from public.tenant_subscriptions where tenant_id = p_tenant order by created_at desc limit 1;
  v := app.coupon_check(p_code, p_tenant, v_sub.plan_id, 'monthly', (select currency from public.tenants where id = p_tenant));
  if v.kind <> 'trial_extension' then raise exception 'That coupon is applied at checkout' using errcode = '22023'; end if;
  if v_sub.status <> 'trial' then raise exception 'Trial coupons only apply during a free trial' using errcode = '22023'; end if;
  v_end := greatest(v_sub.current_period_end, now()) + make_interval(days => v.value::int);
  update public.tenant_subscriptions set current_period_end = v_end where id = v_sub.id;
  insert into public.coupon_redemptions (coupon_id, tenant_id) values (v.id, p_tenant);
  update public.coupons set redeemed_count = redeemed_count + 1 where id = v.id;
  return v_end;
end $$;

revoke execute on function public.quote_subscription(uuid, uuid, text, text, text) from public, anon;
revoke execute on function public.start_saas_checkout(uuid, uuid, text, text, text, text) from public, anon;
revoke execute on function public.submit_bank_transfer(uuid, text, text) from public, anon;
revoke execute on function public.platform_confirm_invoice(uuid, boolean, text) from public, anon;
revoke execute on function public.redeem_trial_coupon(uuid, text) from public, anon;
revoke execute on function public.gateway_confirm_invoice(uuid, text, numeric, text) from public, anon, authenticated;
grant execute on function public.quote_subscription(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.start_saas_checkout(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.submit_bank_transfer(uuid, text, text) to authenticated;
grant execute on function public.platform_confirm_invoice(uuid, boolean, text) to authenticated;
grant execute on function public.redeem_trial_coupon(uuid, text) to authenticated;
grant execute on function public.gateway_confirm_invoice(uuid, text, numeric, text) to service_role;

-- ---------------------------------------------------------------------------
-- AI models catalogue (prices are set by platform admins from provider pages)
-- ---------------------------------------------------------------------------
create table public.ai_models (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model_id text not null,
  display_name text not null,
  description text,
  capabilities text[] not null default '{}',
  context_window int,
  input_price_per_mtok numeric(10, 4),
  output_price_per_mtok numeric(10, 4),
  is_enabled boolean not null default false,
  is_default boolean not null default false,
  min_plan_code text references public.plans (code),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (provider, model_id)
);
create unique index ai_models_one_default on public.ai_models (is_default) where is_default;
create table public.ai_provider_secrets (
  provider text primary key,
  api_key text,
  base_url text,
  updated_at timestamptz not null default now()
);
alter table public.ai_models enable row level security;
alter table public.ai_provider_secrets enable row level security;
create policy ai_models_read on public.ai_models for select to authenticated using (is_enabled or app.has_platform_permission('ai.manage'));
create policy ai_models_write on public.ai_models for all to authenticated
  using (app.has_platform_permission('ai.manage')) with check (app.has_platform_permission('ai.manage'));

insert into public.ai_models (provider, model_id, display_name, description, capabilities, min_plan_code, sort_order, is_enabled, is_default) values
  ('anthropic', 'claude-opus-5-5', 'Claude Opus 5.5', 'Most capable Claude model for complex analysis and reasoning.', '{chat,analysis,tools,vision}', 'business', 1, true, false),
  ('anthropic', 'claude-sonnet-5-5', 'Claude Sonnet 5.5', 'Balanced speed and quality for everyday business questions.', '{chat,analysis,tools,vision}', 'growth', 2, true, true),
  ('anthropic', 'claude-haiku-5-5', 'Claude Haiku 5.5', 'Fast, low-cost model for summaries and quick answers.', '{chat,tools,vision}', 'growth', 3, true, false),
  ('openai', 'gpt-5', 'GPT-5', 'OpenAI flagship model.', '{chat,analysis,tools,vision}', 'business', 10, false, false),
  ('openai', 'gpt-5-mini', 'GPT-5 mini', 'Smaller, cheaper GPT-5 model.', '{chat,tools,vision}', 'growth', 11, false, false),
  ('openai', 'gpt-4.1', 'GPT-4.1', 'Long-context OpenAI model.', '{chat,tools,vision}', 'growth', 12, false, false),
  ('openai', 'o4-mini', 'o4-mini', 'OpenAI reasoning model.', '{chat,analysis}', 'business', 13, false, false),
  ('google', 'gemini-2.5-pro', 'Gemini 2.5 Pro', 'Google''s most capable Gemini model.', '{chat,analysis,tools,vision}', 'business', 20, false, false),
  ('google', 'gemini-2.5-flash', 'Gemini 2.5 Flash', 'Fast Gemini model with long context.', '{chat,tools,vision}', 'growth', 21, false, false),
  ('google', 'gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite', 'Lowest-cost Gemini model.', '{chat}', 'growth', 22, false, false),
  ('mistral', 'mistral-large-latest', 'Mistral Large', 'Mistral''s top model, strong in French and other European languages.', '{chat,tools}', 'growth', 30, false, false),
  ('mistral', 'mistral-small-latest', 'Mistral Small', 'Efficient multilingual model.', '{chat,tools}', 'growth', 31, false, false),
  ('meta', 'llama-3.3-70b-instruct', 'Llama 3.3 70B', 'Open-weight Meta model, served through Groq, Together or Bedrock.', '{chat}', 'growth', 40, false, false),
  ('meta', 'llama-4-maverick', 'Llama 4 Maverick', 'Open-weight multimodal Meta model.', '{chat,vision}', 'growth', 41, false, false),
  ('deepseek', 'deepseek-chat', 'DeepSeek V3', 'Low-cost general model.', '{chat,tools}', 'growth', 50, false, false),
  ('deepseek', 'deepseek-reasoner', 'DeepSeek R1', 'Open reasoning model.', '{chat,analysis}', 'business', 51, false, false),
  ('xai', 'grok-4', 'Grok 4', 'xAI flagship model.', '{chat,analysis,tools}', 'business', 60, false, false),
  ('cohere', 'command-a', 'Command A', 'Cohere enterprise model for retrieval and tools.', '{chat,tools}', 'business', 70, false, false),
  ('qwen', 'qwen-max', 'Qwen Max', 'Alibaba''s multilingual flagship model.', '{chat,tools}', 'growth', 80, false, false);

-- ---------------------------------------------------------------------------
-- Help desk
-- ---------------------------------------------------------------------------
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  number text not null unique default ('T-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7))),
  subject text not null check (char_length(subject) between 3 and 160),
  category text not null default 'question' check (category in ('question', 'billing', 'bug', 'feature', 'account', 'other')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'pending', 'resolved', 'closed')),
  assigned_to uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  from_platform boolean not null default false,
  is_internal boolean not null default false,
  body text not null check (char_length(body) between 1 and 8000),
  created_at timestamptz not null default now()
);
create index support_tickets_status_idx on public.support_tickets (status, updated_at desc);
create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);
create trigger support_tickets_touch before update on public.support_tickets for each row execute function app.touch_updated_at();
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
create policy support_tickets_tenant on public.support_tickets for select to authenticated
  using (app.is_member(tenant_id) or app.has_platform_permission('helpdesk.manage'));
create policy support_tickets_insert on public.support_tickets for insert to authenticated
  with check (app.is_member(tenant_id) and created_by = auth.uid());
create policy support_tickets_platform on public.support_tickets for update to authenticated
  using (app.has_platform_permission('helpdesk.manage')) with check (app.has_platform_permission('helpdesk.manage'));
create policy support_messages_read on public.support_messages for select to authenticated
  using (exists (select 1 from public.support_tickets t where t.id = ticket_id
                 and (app.has_platform_permission('helpdesk.manage') or (app.is_member(t.tenant_id) and not is_internal))));
create policy support_messages_insert on public.support_messages for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.support_tickets t where t.id = ticket_id
    and ((app.has_platform_permission('helpdesk.manage') and from_platform) or (app.is_member(t.tenant_id) and not from_platform and not is_internal))));

-- ---------------------------------------------------------------------------
-- Partners (resellers / referrers)
-- ---------------------------------------------------------------------------
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  email text not null,
  phone text,
  country text,
  referral_code text not null unique check (referral_code ~ '^[A-Z0-9_-]{3,30}$'),
  commission_percent numeric(5, 2) not null default 10 check (commission_percent between 0 and 100),
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  notes text,
  created_at timestamptz not null default now()
);
alter table public.tenants add foreign key (partner_id) references public.partners (id) on delete set null;
alter table public.coupons add foreign key (partner_id) references public.partners (id) on delete set null;
alter table public.partners enable row level security;
create policy partners_admin on public.partners for all to authenticated
  using (app.has_platform_permission('partners.manage')) with check (app.has_platform_permission('partners.manage'));

-- ---------------------------------------------------------------------------
-- Platform settings defaults
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value) values
  ('branding', '{"product_name":"Clena","tagline":"Run your service business.","primary_color":"#0B1B33","accent_color":"#12C08A","support_email":"support@clena.app","support_phone":null,"website":"https://clena.app"}'),
  ('defaults', '{"trial_days":14,"default_currency":"NGN","default_language":"en","currencies":["NGN","USD","GHS","KES","ZAR","EUR","GBP","XOF"],"languages":["en","fr","pt","es","ar","sw"],"grace_period_days":7}')
on conflict (key) do nothing;
drop policy if exists platform_settings_admin on public.platform_settings;
create policy platform_settings_read on public.platform_settings for select to anon, authenticated using (key in ('branding', 'defaults') or app.is_platform_admin());
create policy platform_settings_write on public.platform_settings for all to authenticated
  using (app.has_platform_permission('platform.settings')) with check (app.has_platform_permission('platform.settings'));

-- ---------------------------------------------------------------------------
-- Platform overview and user directory
-- ---------------------------------------------------------------------------
create or replace function public.platform_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.has_platform_permission('tenants.view') then raise exception 'Not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'tenants', (select count(*) from public.tenants where not is_demo),
    'active', (select count(*) from public.tenants where status = 'active' and not is_demo),
    'trial', (select count(*) from public.tenants where status = 'trial' and not is_demo),
    'suspended', (select count(*) from public.tenants where status = 'suspended'),
    'new_30d', (select count(*) from public.tenants where created_at > now() - interval '30 days' and not is_demo),
    'awaiting_transfers', (select count(*) from public.saas_invoices where status = 'awaiting_confirmation'),
    'open_tickets', (select count(*) from public.support_tickets where status in ('open', 'pending')),
    'mrr', (select coalesce(jsonb_object_agg(currency, mrr), '{}'::jsonb) from (
        select i.currency, round(sum(i.total / nullif(i.months + i.bonus_months, 0)), 2) as mrr
        from public.saas_invoices i
        where i.status = 'paid' and i.paid_at + make_interval(months => i.months + i.bonus_months) > now()
        group by i.currency) m),
    'revenue_30d', (select coalesce(jsonb_object_agg(currency, amt), '{}'::jsonb) from (
        select currency, sum(total) amt from public.saas_invoices where status = 'paid' and paid_at > now() - interval '30 days' group by currency) r)
  );
end $$;

create or replace function public.platform_list_tenants(p_search text default null, p_status text default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, name text, slug text, industry text, country text, currency text, status public.tenant_status, is_demo boolean,
               plan_name text, owner_email text, members bigint, orders_30d bigint, created_at timestamptz, trial_ends timestamptz,
               suspension_reason text, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.has_platform_permission('tenants.view') then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
  select t.id, t.name, t.slug, t.industry, t.country, t.currency, t.status, t.is_demo, p.name,
         (app.tenant_owner_emails(t.id))[1],
         (select count(*) from public.tenant_members m where m.tenant_id = t.id and m.status = 'active'),
         (select count(*) from public.orders o where o.tenant_id = t.id and o.created_at > now() - interval '30 days'),
         t.created_at,
         (select s.current_period_end from public.tenant_subscriptions s where s.tenant_id = t.id order by s.created_at desc limit 1),
         t.suspension_reason,
         count(*) over ()
  from public.tenants t left join public.plans p on p.id = t.plan_id
  where (p_search is null or t.name ilike '%' || p_search || '%' or t.slug ilike '%' || p_search || '%')
    and (p_status is null or t.status::text = p_status)
  order by t.created_at desc
  limit least(p_limit, 200) offset p_offset;
end $$;

create or replace function public.platform_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, full_name text, created_at timestamptz, last_sign_in_at timestamptz, platform_role text, businesses bigint, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.has_platform_permission('users.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
  select u.id, u.email::text, pr.full_name, u.created_at, u.last_sign_in_at, pa.role,
         (select count(*) from public.tenant_members m where m.user_id = u.id),
         count(*) over ()
  from auth.users u left join public.profiles pr on pr.id = u.id left join public.platform_admins pa on pa.user_id = u.id
  where p_search is null or u.email ilike '%' || p_search || '%' or pr.full_name ilike '%' || p_search || '%'
  order by pa.role nulls last, u.created_at desc
  limit least(p_limit, 200) offset p_offset;
end $$;

create or replace function public.platform_set_user_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_super_admin() then raise exception 'Only a super admin can change platform access' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own platform access' using errcode = '42501'; end if;
  if p_role is null then
    delete from public.platform_admins where user_id = p_user;
  else
    insert into public.platform_admins (user_id, role) values (p_user, p_role)
    on conflict (user_id) do update set role = excluded.role;
  end if;
end $$;

revoke execute on function public.platform_overview() from public, anon;
revoke execute on function public.platform_list_tenants(text, text, int, int) from public, anon;
revoke execute on function public.platform_list_users(text, int, int) from public, anon;
revoke execute on function public.platform_set_user_role(uuid, text) from public, anon;
grant execute on function public.platform_overview() to authenticated;
grant execute on function public.platform_list_tenants(text, text, int, int) to authenticated;
grant execute on function public.platform_list_users(text, int, int) to authenticated;
grant execute on function public.platform_set_user_role(uuid, text) to authenticated;

revoke all on function app.tenant_owner_emails(uuid) from public, anon, authenticated;
revoke all on function app.apply_paid_invoice(uuid, text, uuid) from public, anon, authenticated;
revoke all on function app.coupon_check(text, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function app.tenant_owner_emails(uuid), app.apply_paid_invoice(uuid, text, uuid), app.coupon_check(text, uuid, uuid, text, text) to service_role;
