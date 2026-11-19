-- =============================================================================
-- Clena: Laundry Operations module (enabled for D'WashGuy).
-- Adds the full laundry lifecycle on top of the existing order workflow:
-- pickup/delivery jobs with proof, bags and garment tags, weights and counts,
-- quality control, incidents and exceptions, adjustments needing customer
-- approval, refunds, zones and slots, express, subscriptions, loyalty and
-- referrals, notifications, feedback, processing partners, the service
-- reminder engine, the daily checklist, KPIs and audit history.
-- Other businesses are unaffected unless the module is switched on for them.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Modules (switched on by the Clena team, per business)
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_modules (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  module_key text not null check (module_key in ('laundry_ops')),
  enabled_by uuid references auth.users (id) on delete set null default auth.uid(),
  enabled_at timestamptz not null default now(),
  primary key (tenant_id, module_key)
);
alter table public.tenant_modules enable row level security;
drop policy if exists tenant_modules_select on public.tenant_modules;
create policy tenant_modules_select on public.tenant_modules for select to authenticated
  using (app.is_member(tenant_id) or app.is_platform_admin()
         or exists (select 1 from public.customers c where c.tenant_id = tenant_modules.tenant_id and c.user_id = auth.uid()));

create or replace function app.has_module(p_tenant uuid, p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tenant_modules where tenant_id = p_tenant and module_key = p_key)
$$;

-- ---------------------------------------------------------------------------
-- 2. Permissions for laundry operations
-- ---------------------------------------------------------------------------
insert into public.permissions (key, module, description) values
  ('ops.receive',      'operations', 'Receive orders, register items and bags'),
  ('ops.sort',         'operations', 'Sort, count and weigh items'),
  ('ops.process',      'operations', 'Process, dry, iron and fold'),
  ('ops.qc',           'operations', 'Run quality control and release orders'),
  ('incidents.manage', 'operations', 'Record and resolve incidents and exceptions'),
  ('support.manage',   'customers',  'Handle complaints, messages and customer support')
on conflict (key) do nothing;

-- Owners hold every permission; managers everything except owner settings.
insert into public.role_permissions (tenant_id, role_id, permission_key)
select r.tenant_id, r.id, p.key from public.roles r
cross join (values ('ops.receive'), ('ops.sort'), ('ops.process'), ('ops.qc'), ('incidents.manage'), ('support.manage')) p(key)
where r.key in ('owner', 'manager')
on conflict do nothing;
insert into public.role_templates (role_key, role_name, permission_key)
select t.role_key, t.role_name, p.key from (values ('owner', 'Business Owner'), ('manager', 'Business Manager')) t(role_key, role_name)
cross join (values ('ops.receive'), ('ops.sort'), ('ops.process'), ('ops.qc'), ('incidents.manage'), ('support.manage')) p(key)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Order columns used by operations
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists received_item_count int check (received_item_count is null or received_item_count >= 0),
  add column if not exists received_weight_kg numeric(8, 2) check (received_weight_kg is null or received_weight_kg >= 0),
  add column if not exists is_express boolean not null default false,
  add column if not exists express_fee numeric(12, 2) not null default 0 check (express_fee >= 0),
  add column if not exists adjustments_total numeric(12, 2) not null default 0,
  add column if not exists points_redeemed int not null default 0,
  add column if not exists subscription_id uuid,
  add column if not exists subscription_kg numeric(8, 2) not null default 0,
  add column if not exists zone_id uuid,
  add column if not exists on_hold boolean not null default false,
  add column if not exists delivered_at timestamptz,
  add column if not exists processing_partner_id uuid;

alter table public.customers
  add column if not exists referral_code text,
  add column if not exists referred_by uuid;
create unique index if not exists customers_referral_code_uq on public.customers (tenant_id, referral_code) where referral_code is not null;

-- ---------------------------------------------------------------------------
-- 4. Zones (serviceable areas) — fees per zone
-- ---------------------------------------------------------------------------
create table if not exists public.service_zones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  areas text,
  delivery_fee numeric(12, 2) not null default 0 check (delivery_fee >= 0),
  min_order numeric(12, 2) not null default 0 check (min_order >= 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);
alter table public.service_zones enable row level security;
drop policy if exists service_zones_select on public.service_zones;
create policy service_zones_select on public.service_zones for select to authenticated
  using (app.is_member(tenant_id) or exists (select 1 from public.customers c where c.tenant_id = service_zones.tenant_id and c.user_id = auth.uid()));
drop policy if exists service_zones_write on public.service_zones;
create policy service_zones_write on public.service_zones for all to authenticated
  using (app.has_permission(tenant_id, 'settings.manage')) with check (app.has_permission(tenant_id, 'settings.manage'));
alter table public.customer_addresses add column if not exists zone_id uuid;
do $$ begin
  alter table public.customer_addresses add constraint customer_addresses_zone_fk
    foreign key (tenant_id, zone_id) references public.service_zones (tenant_id, id) on delete set null (zone_id);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 5. Media (photos, signatures) stored compressed with the record
-- ---------------------------------------------------------------------------
create table if not exists public.ops_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  order_id uuid,
  job_id uuid,
  incident_id uuid,
  kind text not null check (kind in ('photo', 'signature', 'customer_photo', 'proof_photo', 'evidence')),
  data_url text not null check (data_url ~ '^data:image/(png|jpeg|webp);base64,' and length(data_url) <= 700000),
  caption text check (caption is null or char_length(caption) <= 200),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade
);
create index if not exists ops_media_order_idx on public.ops_media (order_id);
alter table public.ops_media enable row level security;
drop policy if exists ops_media_select on public.ops_media;
create policy ops_media_select on public.ops_media for select to authenticated
  using (app.has_permission(tenant_id, 'orders.view')
         or (kind in ('customer_photo', 'proof_photo', 'photo') and order_id is not null and exists (
               select 1 from public.orders o where o.id = ops_media.order_id and app.is_customer_self(o.tenant_id, o.customer_id))));
drop policy if exists ops_media_insert on public.ops_media;
create policy ops_media_insert on public.ops_media for insert to authenticated
  with check (created_by = auth.uid() and (
    (kind <> 'customer_photo' and (app.has_permission(tenant_id, 'orders.update_status') or app.has_permission(tenant_id, 'orders.manage')))
    or (kind = 'customer_photo' and order_id is not null and exists (
          select 1 from public.orders o where o.id = ops_media.order_id and app.is_customer_self(o.tenant_id, o.customer_id)))));

-- ---------------------------------------------------------------------------
-- 6. Bags and garment tags
-- ---------------------------------------------------------------------------
create table if not exists public.bags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$'),
  status text not null default 'available' check (status in ('available', 'in_use', 'retired')),
  current_order_id uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, id)
);
create table if not exists public.order_bags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  bag_id uuid not null,
  attached_by uuid references auth.users (id) on delete set null default auth.uid(),
  attached_at timestamptz not null default now(),
  released_at timestamptz,
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade,
  foreign key (tenant_id, bag_id) references public.bags (tenant_id, id) on delete cascade
);
create index if not exists order_bags_order_idx on public.order_bags (order_id);
create table if not exists public.order_garments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  bag_id uuid,
  tag_code text check (tag_code is null or tag_code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$'),
  description text not null check (char_length(description) between 1 and 80),
  color text,
  brand text,
  condition_note text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade,
  foreign key (tenant_id, bag_id) references public.bags (tenant_id, id) on delete set null (bag_id)
);
create unique index if not exists order_garments_tag_uq on public.order_garments (tenant_id, tag_code) where tag_code is not null;
create index if not exists order_garments_order_idx on public.order_garments (order_id);
alter table public.bags enable row level security;
alter table public.order_bags enable row level security;
alter table public.order_garments enable row level security;
drop policy if exists bags_select on public.bags;
create policy bags_select on public.bags for select to authenticated using (app.has_permission(tenant_id, 'orders.view'));
drop policy if exists order_bags_select on public.order_bags;
create policy order_bags_select on public.order_bags for select to authenticated
  using (app.has_permission(tenant_id, 'orders.view') or exists (select 1 from public.orders o where o.id = order_bags.order_id and app.is_customer_self(o.tenant_id, o.customer_id)));
drop policy if exists order_garments_select on public.order_garments;
create policy order_garments_select on public.order_garments for select to authenticated
  using (app.has_permission(tenant_id, 'orders.view') or exists (select 1 from public.orders o where o.id = order_garments.order_id and app.is_customer_self(o.tenant_id, o.customer_id)));
-- writes go through functions below

-- ---------------------------------------------------------------------------
-- 7. Pickup and delivery jobs
-- ---------------------------------------------------------------------------
create table if not exists public.delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  order_id uuid not null,
  kind text not null check (kind in ('pickup', 'delivery')),
  status text not null default 'unassigned' check (status in ('unassigned', 'assigned', 'en_route', 'completed', 'failed', 'cancelled')),
  attempt int not null default 1,
  driver_member_id uuid,
  route_seq int,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  order_number text not null,
  customer_name text not null,
  customer_phone text,
  address text,
  landmark text,
  zone_name text,
  instructions text,
  items_summary text,
  amount_due numeric(12, 2),
  collected_item_count int,
  collected_bag_codes text[],
  proof_type text check (proof_type in ('otp', 'signature', 'photo')),
  recipient_name text,
  failed_reason text check (failed_reason in ('customer_unavailable', 'wrong_address', 'no_access', 'customer_rescheduled',
                                              'refused', 'unsafe_location', 'vehicle_issue', 'payment_issue', 'other')),
  failed_note text,
  assigned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade,
  foreign key (tenant_id, driver_member_id) references public.tenant_members (tenant_id, id) on delete set null (driver_member_id)
);
create index if not exists delivery_jobs_tenant_status_idx on public.delivery_jobs (tenant_id, status, scheduled_start);
create index if not exists delivery_jobs_driver_idx on public.delivery_jobs (driver_member_id, status);
create index if not exists delivery_jobs_order_idx on public.delivery_jobs (order_id);
alter table public.delivery_jobs enable row level security;
drop policy if exists delivery_jobs_select on public.delivery_jobs;
create policy delivery_jobs_select on public.delivery_jobs for select to authenticated
  using (app.has_permission(tenant_id, 'logistics.manage') or app.has_permission(tenant_id, 'orders.view')
         or (app.has_permission(tenant_id, 'logistics.view') and driver_member_id = app.current_member_id(tenant_id))
         or exists (select 1 from public.orders o where o.id = delivery_jobs.order_id and app.is_customer_self(o.tenant_id, o.customer_id)));
drop policy if exists delivery_jobs_update on public.delivery_jobs;
create policy delivery_jobs_update on public.delivery_jobs for update to authenticated
  using (app.has_permission(tenant_id, 'logistics.manage')) with check (app.has_permission(tenant_id, 'logistics.manage'));
do $$ begin
  alter table public.ops_media add constraint ops_media_job_fk foreign key (tenant_id, job_id) references public.delivery_jobs (tenant_id, id) on delete set null (job_id);
exception when duplicate_object then null; end $$;

-- Delivery OTPs are kept apart so drivers can't read them; customers see theirs via my_delivery_otp().
create table if not exists public.job_secrets (
  job_id uuid primary key references public.delivery_jobs (id) on delete cascade,
  otp text not null check (otp ~ '^[0-9]{4}$')
);
alter table public.job_secrets enable row level security;

create table if not exists public.driver_status (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  member_id uuid not null,
  is_available boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, member_id),
  foreign key (tenant_id, member_id) references public.tenant_members (tenant_id, id) on delete cascade
);
alter table public.driver_status enable row level security;
drop policy if exists driver_status_select on public.driver_status;
create policy driver_status_select on public.driver_status for select to authenticated
  using (app.has_permission(tenant_id, 'logistics.manage') or member_id = app.current_member_id(tenant_id));

-- ---------------------------------------------------------------------------
-- 8. Incidents / exceptions
-- ---------------------------------------------------------------------------
create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  order_id uuid,
  job_id uuid,
  kind text not null check (kind in ('missing_item', 'damaged_item', 'stain_not_removable', 'extra_charge', 'wrong_item',
                                     'delayed', 'failed_pickup', 'failed_delivery', 'payment_failure', 'quality_complaint', 'other')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved')),
  freezes_order boolean not null default false,
  source text not null default 'staff' check (source in ('staff', 'customer', 'system')),
  description text not null check (char_length(btrim(description)) between 3 and 2000),
  resolution text,
  reported_by uuid references auth.users (id) on delete set null default auth.uid(),
  assigned_member_id uuid,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade
);
create index if not exists incidents_tenant_status_idx on public.incidents (tenant_id, status, created_at desc);
create index if not exists incidents_order_idx on public.incidents (order_id);
alter table public.incidents enable row level security;
drop policy if exists incidents_select on public.incidents;
create policy incidents_select on public.incidents for select to authenticated
  using (app.has_permission(tenant_id, 'orders.view') or app.has_permission(tenant_id, 'incidents.manage')
         or (order_id is not null and kind in ('quality_complaint', 'missing_item', 'damaged_item', 'stain_not_removable', 'extra_charge', 'delayed')
             and exists (select 1 from public.orders o where o.id = incidents.order_id and app.is_customer_self(o.tenant_id, o.customer_id))));
do $$ begin
  alter table public.ops_media add constraint ops_media_incident_fk foreign key (tenant_id, incident_id) references public.incidents (tenant_id, id) on delete set null (incident_id);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 9. Quality control (8-point SOP)
-- ---------------------------------------------------------------------------
create table if not exists public.quality_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  checklist jsonb not null,
  passed boolean not null,
  notes text,
  inspector uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade
);
create index if not exists quality_checks_order_idx on public.quality_checks (order_id, created_at desc);
alter table public.quality_checks enable row level security;
drop policy if exists quality_checks_select on public.quality_checks;
create policy quality_checks_select on public.quality_checks for select to authenticated using (app.has_permission(tenant_id, 'orders.view'));

-- ---------------------------------------------------------------------------
-- 10. Adjustments (price changes after confirmation, extra charges)
-- ---------------------------------------------------------------------------
create table if not exists public.order_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  kind text not null check (kind in ('weight_change', 'extra_charge', 'discount', 'credit')),
  amount numeric(12, 2) not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  details jsonb not null default '{}'::jsonb,
  status text not null default 'pending_approval' check (status in ('pending_approval', 'applied', 'declined', 'cancelled')),
  requested_by uuid references auth.users (id) on delete set null default auth.uid(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_via text check (decided_via in ('customer_app', 'staff_on_behalf', 'automatic')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade
);
create index if not exists order_adjustments_order_idx on public.order_adjustments (order_id);
alter table public.order_adjustments enable row level security;
drop policy if exists order_adjustments_select on public.order_adjustments;
create policy order_adjustments_select on public.order_adjustments for select to authenticated
  using (app.has_permission(tenant_id, 'orders.view')
         or exists (select 1 from public.orders o where o.id = order_adjustments.order_id and app.is_customer_self(o.tenant_id, o.customer_id)));

-- ---------------------------------------------------------------------------
-- 11. Refunds (always linked to the original payment)
-- ---------------------------------------------------------------------------
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  payment_id uuid not null,
  order_id uuid,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'bank_transfer', 'pos', 'original_method')),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  reference text,
  processed_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, payment_id) references public.payments (tenant_id, id) on delete restrict
);
create index if not exists refunds_payment_idx on public.refunds (payment_id);
alter table public.refunds enable row level security;
drop policy if exists refunds_select on public.refunds;
create policy refunds_select on public.refunds for select to authenticated
  using (app.has_permission(tenant_id, 'payments.view')
         or exists (select 1 from public.orders o where o.id = refunds.order_id and app.is_customer_self(o.tenant_id, o.customer_id)));

-- ---------------------------------------------------------------------------
-- 12. Notifications, feedback
-- ---------------------------------------------------------------------------
create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  order_id uuid,
  trigger text not null,
  title text not null,
  body text not null,
  link text,
  channels jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete cascade
);
create index if not exists customer_notifications_customer_idx on public.customer_notifications (customer_id, created_at desc);
alter table public.customer_notifications enable row level security;
drop policy if exists customer_notifications_select on public.customer_notifications;
create policy customer_notifications_select on public.customer_notifications for select to authenticated
  using (app.is_customer_self(tenant_id, customer_id) or app.has_permission(tenant_id, 'customers.view'));

create table if not exists public.order_feedback (
  order_id uuid primary key,
  tenant_id uuid not null,
  customer_id uuid not null,
  rating int not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade
);
alter table public.order_feedback enable row level security;
drop policy if exists order_feedback_select on public.order_feedback;
create policy order_feedback_select on public.order_feedback for select to authenticated
  using (app.has_permission(tenant_id, 'orders.view') or app.is_customer_self(tenant_id, customer_id));

-- ---------------------------------------------------------------------------
-- 13. Loyalty ledger
-- ---------------------------------------------------------------------------
create table if not exists public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid not null,
  points int not null check (points <> 0),
  reason text not null check (reason in ('order_completed', 'referral_reward', 'referral_welcome', 'milestone', 'redemption', 'adjustment', 'reversal')),
  order_id uuid,
  note text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete cascade
);
create index if not exists loyalty_ledger_customer_idx on public.loyalty_ledger (customer_id, created_at desc);
alter table public.loyalty_ledger enable row level security;
drop policy if exists loyalty_ledger_select on public.loyalty_ledger;
create policy loyalty_ledger_select on public.loyalty_ledger for select to authenticated
  using (app.is_customer_self(tenant_id, customer_id) or app.has_permission(tenant_id, 'customers.view'));

-- ---------------------------------------------------------------------------
-- 14. Subscriptions (customer plans)
-- ---------------------------------------------------------------------------
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  description text,
  price numeric(12, 2) not null check (price >= 0),
  period_days int not null default 30 check (period_days between 7 and 366),
  included_kg numeric(8, 2) not null default 0 check (included_kg >= 0),
  free_delivery boolean not null default true,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create table if not exists public.customer_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid not null,
  plan_id uuid not null,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'active', 'paused', 'cancelled', 'expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  auto_renew boolean not null default true,
  payment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete cascade,
  foreign key (tenant_id, plan_id) references public.subscription_plans (tenant_id, id)
);
create unique index if not exists customer_subscriptions_one_live on public.customer_subscriptions (customer_id) where status in ('pending_payment', 'active', 'paused');
alter table public.subscription_plans enable row level security;
alter table public.customer_subscriptions enable row level security;
drop policy if exists subscription_plans_select on public.subscription_plans;
create policy subscription_plans_select on public.subscription_plans for select to authenticated
  using (app.is_member(tenant_id) or (is_active and exists (select 1 from public.customers c where c.tenant_id = subscription_plans.tenant_id and c.user_id = auth.uid())));
drop policy if exists subscription_plans_write on public.subscription_plans;
create policy subscription_plans_write on public.subscription_plans for all to authenticated
  using (app.has_permission(tenant_id, 'subscriptions.manage')) with check (app.has_permission(tenant_id, 'subscriptions.manage'));
drop policy if exists customer_subscriptions_select on public.customer_subscriptions;
create policy customer_subscriptions_select on public.customer_subscriptions for select to authenticated
  using (app.is_customer_self(tenant_id, customer_id) or app.has_permission(tenant_id, 'customers.view'));

-- ---------------------------------------------------------------------------
-- 15. Processing partners (outsourced model)
-- ---------------------------------------------------------------------------
create table if not exists public.processing_partners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  contact_name text,
  phone text,
  address text,
  services text,
  cost_per_kg numeric(12, 2),
  turnaround_hours int not null default 48,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create table if not exists public.partner_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  partner_id uuid not null,
  reference text not null,
  status text not null default 'sent' check (status in ('sent', 'returned')),
  bag_count int,
  weight_kg numeric(8, 2),
  sent_at timestamptz not null default now(),
  expected_back_at timestamptz,
  returned_at timestamptz,
  notes text,
  sent_by uuid references auth.users (id) on delete set null default auth.uid(),
  unique (tenant_id, id),
  unique (tenant_id, reference),
  foreign key (tenant_id, partner_id) references public.processing_partners (tenant_id, id)
);
create table if not exists public.partner_batch_orders (
  batch_id uuid not null references public.partner_batches (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  primary key (batch_id, order_id)
);
alter table public.processing_partners enable row level security;
alter table public.partner_batches enable row level security;
alter table public.partner_batch_orders enable row level security;
drop policy if exists processing_partners_select on public.processing_partners;
create policy processing_partners_select on public.processing_partners for select to authenticated using (app.has_permission(tenant_id, 'orders.view'));
drop policy if exists processing_partners_write on public.processing_partners;
create policy processing_partners_write on public.processing_partners for all to authenticated
  using (app.has_permission(tenant_id, 'settings.manage')) with check (app.has_permission(tenant_id, 'settings.manage'));
drop policy if exists partner_batches_select on public.partner_batches;
create policy partner_batches_select on public.partner_batches for select to authenticated using (app.has_permission(tenant_id, 'orders.view'));
drop policy if exists partner_batch_orders_select on public.partner_batch_orders;
create policy partner_batch_orders_select on public.partner_batch_orders for select to authenticated
  using (exists (select 1 from public.partner_batches b where b.id = partner_batch_orders.batch_id and app.has_permission(b.tenant_id, 'orders.view')));

-- ---------------------------------------------------------------------------
-- 16. Daily operational checklist
-- ---------------------------------------------------------------------------
create table if not exists public.ops_checklist_marks (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  day date not null,
  item_key text not null,
  done_by uuid references auth.users (id) on delete set null default auth.uid(),
  done_at timestamptz not null default now(),
  note text,
  primary key (tenant_id, day, item_key)
);
alter table public.ops_checklist_marks enable row level security;
drop policy if exists ops_checklist_select on public.ops_checklist_marks;
create policy ops_checklist_select on public.ops_checklist_marks for select to authenticated using (app.has_permission(tenant_id, 'orders.view'));
drop policy if exists ops_checklist_write on public.ops_checklist_marks;
create policy ops_checklist_write on public.ops_checklist_marks for all to authenticated
  using (app.has_permission(tenant_id, 'orders.manage') or app.has_permission(tenant_id, 'logistics.manage'))
  with check (app.has_permission(tenant_id, 'orders.manage') or app.has_permission(tenant_id, 'logistics.manage'));

-- ---------------------------------------------------------------------------
-- 17. Helpers
-- ---------------------------------------------------------------------------
create or replace function app.audit(p_tenant uuid, p_action text, p_entity text, p_id uuid, p_data jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, data)
  values (p_tenant, auth.uid(), p_action, p_entity, p_id, coalesce(p_data, '{}'::jsonb))
$$;

create or replace function app.stage_key(p_stage uuid)
returns text language sql stable security definer set search_path = '' as $$
  select key from public.workflow_stages where id = p_stage
$$;

create or replace function app.stage_id(p_workflow uuid, p_key text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.workflow_stages where workflow_id = p_workflow and key = p_key
$$;

create or replace function app.stage_pos(p_workflow uuid, p_key text)
returns int language sql stable security definer set search_path = '' as $$
  select position from public.workflow_stages where workflow_id = p_workflow and key = p_key
$$;

-- System stage move (driver app, dispatch, automation). Skips role gates; records history.
create or replace function app.system_move(p_order uuid, p_key text, p_note text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_wf uuid; v_cur uuid; v_target uuid; v_prev text := coalesce(current_setting('clena.trusted_write', true), 'off');
begin
  select workflow_id, current_stage_id into v_wf, v_cur from public.orders where id = p_order;
  v_target := app.stage_id(v_wf, p_key);
  if v_target is null or v_target = v_cur then return false; end if;
  perform set_config('clena.trusted_write', 'on', true);
  perform set_config('clena.stage_note', coalesce(p_note, ''), true);
  update public.orders set current_stage_id = v_target where id = p_order;
  perform set_config('clena.stage_note', '', true);
  perform set_config('clena.trusted_write', v_prev, true);
  return true;
end $$;

create or replace function app.laundry_settings(p_tenant uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'qc_required', coalesce((t.settings -> 'ops' ->> 'qc_required')::boolean, true),
    'weigh_before_processing', coalesce((t.settings -> 'ops' ->> 'weigh_before_processing')::boolean, true),
    'auto_complete_when_paid', coalesce((t.settings -> 'ops' ->> 'auto_complete_when_paid')::boolean, true),
    'proof_required', coalesce(t.settings -> 'ops' ->> 'proof_required', 'any'),
    'reminder_default_days', coalesce((t.settings -> 'ops' ->> 'reminder_default_days')::int, 14),
    'processing_cost_per_kg', (t.settings -> 'ops' ->> 'processing_cost_per_kg')::numeric,
    'delivery_cost_per_job', (t.settings -> 'ops' ->> 'delivery_cost_per_job')::numeric,
    'marketing_spend_month', (t.settings -> 'ops' ->> 'marketing_spend_month')::numeric,
    'loyalty_enabled', coalesce((t.settings -> 'loyalty' ->> 'enabled')::boolean, false),
    'points_per_100', coalesce((t.settings -> 'loyalty' ->> 'points_per_100')::numeric, 1),
    'point_value', coalesce((t.settings -> 'loyalty' ->> 'point_value')::numeric, 1),
    'min_redeem', coalesce((t.settings -> 'loyalty' ->> 'min_redeem')::int, 100),
    'referral_points', coalesce((t.settings -> 'loyalty' ->> 'referral_points')::int, 0),
    'referee_points', coalesce((t.settings -> 'loyalty' ->> 'referee_points')::int, 0),
    'milestone_every', coalesce((t.settings -> 'loyalty' ->> 'milestone_every')::int, 0),
    'milestone_points', coalesce((t.settings -> 'loyalty' ->> 'milestone_points')::int, 0)
  ) from public.tenants t where t.id = p_tenant
$$;

-- ---------------------------------------------------------------------------
-- 18. Customer notifications (in-app always; email when opted in; WhatsApp/SMS
--     are recorded as "not_configured" until a messaging provider is connected)
-- ---------------------------------------------------------------------------
create or replace function app.notify_customer(p_tenant uuid, p_customer uuid, p_order uuid, p_trigger text,
                                               p_title text, p_body text, p_link text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_c record; v_t record; v_id uuid; v_ch jsonb := jsonb_build_object('in_app', 'sent');
        v_wants_sms boolean := p_trigger in ('booking_confirmed', 'pickup_assigned', 'order_delayed', 'order_ready', 'failed_attempt');
begin
  if p_customer is null then return null; end if;
  select name, slug, settings into v_t from public.tenants where id = p_tenant;
  if coalesce((v_t.settings -> 'notifications' -> p_trigger ->> 'enabled')::boolean, true) = false then return null; end if;
  select full_name, email, email_opt_in, whatsapp_opt_in, sms_opt_in, user_id into v_c from public.customers where id = p_customer;
  if v_c.email is not null and v_c.email_opt_in then
    insert into public.email_outbox (tenant_id, to_email, subject, body_text, template)
    values (p_tenant, v_c.email, p_title || ' · ' || v_t.name,
            'Hi ' || split_part(v_c.full_name, ' ', 1) || E',\n\n' || p_body ||
            case when p_link is not null then E'\n\nOpen it here: {{APP_URL}}' || p_link else '' end ||
            E'\n\n' || v_t.name, 'customer_' || p_trigger);
    v_ch := v_ch || jsonb_build_object('email', 'queued');
  end if;
  if v_c.whatsapp_opt_in then v_ch := v_ch || jsonb_build_object('whatsapp', 'not_configured'); end if;
  if v_c.sms_opt_in and v_wants_sms then v_ch := v_ch || jsonb_build_object('sms', 'not_configured'); end if;
  insert into public.customer_notifications (tenant_id, customer_id, order_id, trigger, title, body, link, channels)
  values (p_tenant, p_customer, p_order, p_trigger, p_title, p_body, p_link, v_ch) returning id into v_id;
  return v_id;
end $$;

create or replace function app.notify_order(p_order uuid, p_trigger text, p_extra text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; v_title text; v_body text;
begin
  select ord.id, ord.tenant_id, ord.customer_id, ord.order_number, ord.delivery_required, t.slug
    into r from public.orders ord join public.tenants t on t.id = ord.tenant_id where ord.id = p_order;
  if r.id is null then return; end if;
  case p_trigger
    when 'booking_confirmed' then v_title := 'Booking confirmed'; v_body := 'We have your order ' || r.order_number || '. We''ll let you know when a driver is assigned.';
    when 'pickup_assigned' then v_title := 'Driver assigned'; v_body := 'A driver has been assigned to collect order ' || r.order_number || coalesce('. ' || p_extra, '.');
    when 'driver_arriving' then v_title := 'Driver on the way'; v_body := 'Your driver is on the way for order ' || r.order_number || '.';
    when 'picked_up' then v_title := 'Picked up'; v_body := 'We''ve collected order ' || r.order_number || ' and are taking it to our facility.';
    when 'order_received' then v_title := 'Order received'; v_body := 'Order ' || r.order_number || ' has arrived and is being checked in.';
    when 'order_delayed' then v_title := 'Your order is running late'; v_body := 'Sorry, order ' || r.order_number || ' is taking longer than planned. We''re on it' || coalesce(' — ' || p_extra, '') || '.';
    when 'order_ready' then v_title := 'Your order is ready';
      v_body := case when r.delivery_required then 'Order ' || r.order_number || ' passed quality control and will be out for delivery soon.'
                     else 'Order ' || r.order_number || ' passed quality control and is ready for collection.' end;
    when 'out_for_delivery' then v_title := 'Out for delivery'; v_body := 'Order ' || r.order_number || ' is on its way. Have your delivery code ready.';
    when 'delivered' then v_title := 'Delivered'; v_body := 'Order ' || r.order_number || ' has been delivered. Thank you!';
    when 'payment_receipt' then v_title := 'Payment received'; v_body := 'We received ' || coalesce(p_extra, 'your payment') || ' for order ' || r.order_number || '.';
    when 'feedback_request' then v_title := 'How did we do?'; v_body := 'Rate order ' || r.order_number || ' — it takes 10 seconds and helps us improve.';
    when 'adjustment_request' then v_title := 'Please approve a price change'; v_body := coalesce(p_extra, 'There is a change to your order total.') || ' Open order ' || r.order_number || ' to approve or decline.';
    when 'failed_attempt' then v_title := 'We missed you'; v_body := 'We couldn''t complete the ' || coalesce(p_extra, 'visit') || ' for order ' || r.order_number || '. We''ll contact you to reschedule.';
    when 'incident_update' then v_title := 'Update on your order'; v_body := coalesce(p_extra, 'There is an update on order ' || r.order_number || '.');
    else v_title := 'Order update'; v_body := coalesce(p_extra, 'There is an update on order ' || r.order_number || '.');
  end case;
  perform app.notify_customer(r.tenant_id, r.customer_id, r.id, p_trigger, v_title, v_body, '/b/' || r.slug || '/orders/' || r.id);
end $$;

-- ---------------------------------------------------------------------------
-- 19. Lifecycle rules (only for businesses with the module)
-- ---------------------------------------------------------------------------
-- Walk-in orders created at the counter start at "Received".
create or replace function app.laundry_order_defaults()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_recv uuid;
begin
  if not app.has_module(new.tenant_id, 'laundry_ops') then return new; end if;
  if coalesce(current_setting('clena.demo_load', true), 'off') = 'on' then return new; end if;
  if new.source <> 'portal' and not new.pickup_required then
    v_recv := app.stage_id(new.workflow_id, 'received');
    if v_recv is not null then new.current_stage_id := v_recv; end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_laundry_defaults on public.orders;
create trigger orders_laundry_defaults before insert on public.orders for each row execute function app.laundry_order_defaults();

create or replace function app.laundry_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_c record; v_addr record; v_zone text;
begin
  if not app.has_module(new.tenant_id, 'laundry_ops') or coalesce(current_setting('clena.demo_load', true), 'off') = 'on' then return null; end if;
  select full_name, phone into v_c from public.customers where id = new.customer_id;
  if new.pickup_required then
    select z.name into v_zone from public.service_zones z where z.id = new.zone_id;
    insert into public.delivery_jobs (tenant_id, order_id, kind, scheduled_start, scheduled_end, order_number, customer_name,
                                      customer_phone, address, zone_name, instructions, items_summary)
    values (new.tenant_id, new.id, 'pickup', new.pickup_at, new.pickup_at + interval '2 hours', new.order_number, v_c.full_name,
            v_c.phone, new.pickup_address, v_zone, new.notes,
            (select string_agg(description || ' ×' || trim(to_char(quantity, 'FM999990.##')), ', ') from public.order_items where order_id = new.id));
  end if;
  perform app.notify_order(new.id, 'booking_confirmed');
  return null;
end $$;
drop trigger if exists orders_laundry_after_insert on public.orders;
create trigger orders_laundry_after_insert after insert on public.orders for each row execute function app.laundry_after_insert();

-- Gates on moving an order (people; system moves are trusted and checked in their own functions).
create or replace function app.laundry_stage_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_to text; v_from text; v_to_pos int; v_from_pos int; v_s jsonb; v_qc boolean;
begin
  if new.current_stage_id is not distinct from old.current_stage_id then return new; end if;
  if not app.has_module(new.tenant_id, 'laundry_ops') then return new; end if;
  select key, position into v_to, v_to_pos from public.workflow_stages where id = new.current_stage_id;
  select key, position into v_from, v_from_pos from public.workflow_stages where id = old.current_stage_id;
  if v_to = 'delivered' and new.delivered_at is null then new.delivered_at := now(); end if;
  if auth.uid() is null or current_setting('clena.trusted_write', true) = 'on' then return new; end if;
  v_s := app.laundry_settings(new.tenant_id);
  if old.on_hold then
    raise exception 'This order is frozen by an open incident. Resolve the incident first.' using errcode = '42501';
  end if;
  if v_to = 'picked_up' and exists (select 1 from public.delivery_jobs j where j.order_id = new.id and j.kind = 'pickup' and j.status not in ('completed', 'cancelled')) then
    raise exception 'Confirm the collection from the driver app (proof of collection is required).' using errcode = '42501';
  end if;
  if v_to = 'delivered' and exists (select 1 from public.delivery_jobs j where j.order_id = new.id and j.kind = 'delivery' and j.status not in ('completed', 'cancelled')) then
    raise exception 'Confirm delivery from the driver app (proof of delivery is required).' using errcode = '42501';
  end if;
  if (v_s ->> 'weigh_before_processing')::boolean and v_to_pos > coalesce(app.stage_pos(new.workflow_id, 'sorting'), 999)
     and v_from_pos <= coalesce(app.stage_pos(new.workflow_id, 'sorting'), 999)
     and new.received_item_count is null and new.received_weight_kg is null then
    raise exception 'Record the item count or weight before processing.' using errcode = '22023';
  end if;
  if (v_s ->> 'qc_required')::boolean and v_to_pos >= coalesce(app.stage_pos(new.workflow_id, 'ready'), 999)
     and v_from_pos < coalesce(app.stage_pos(new.workflow_id, 'ready'), 999) then
    select passed into v_qc from public.quality_checks where order_id = new.id order by created_at desc limit 1;
    if not coalesce(v_qc, false) then
      raise exception 'This order needs a passed quality check before it can be released.' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_laundry_stage_guard on public.orders;
create trigger orders_laundry_stage_guard before update of current_stage_id on public.orders
  for each row execute function app.laundry_stage_guard();

create or replace function app.laundry_after_stage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_to text; v_s jsonb; v_c record;
begin
  if new.current_stage_id is not distinct from old.current_stage_id then return null; end if;
  if not app.has_module(new.tenant_id, 'laundry_ops') or coalesce(current_setting('clena.demo_load', true), 'off') = 'on' then return null; end if;
  v_to := app.stage_key(new.current_stage_id);
  v_s := app.laundry_settings(new.tenant_id);
  case v_to
    when 'picked_up' then perform app.notify_order(new.id, 'picked_up');
    when 'received' then perform app.notify_order(new.id, 'order_received');
    when 'ready' then
      perform app.notify_order(new.id, 'order_ready');
      if new.delivery_required and not exists (select 1 from public.delivery_jobs j where j.order_id = new.id and j.kind = 'delivery' and j.status not in ('failed', 'cancelled')) then
        select full_name, phone into v_c from public.customers where id = new.customer_id;
        insert into public.delivery_jobs (tenant_id, order_id, kind, scheduled_start, scheduled_end, order_number, customer_name, customer_phone,
                                          address, zone_name, instructions, items_summary, amount_due)
        values (new.tenant_id, new.id, 'delivery', greatest(coalesce(new.expected_at, now()), now()), greatest(coalesce(new.expected_at, now()), now()) + interval '2 hours',
                new.order_number, v_c.full_name, v_c.phone, coalesce(new.delivery_address, new.pickup_address),
                (select z.name from public.service_zones z where z.id = new.zone_id), new.notes,
                (select count(*)::text || ' bag(s)' from public.order_bags b where b.order_id = new.id and b.released_at is null),
                greatest(new.total - new.amount_paid, 0));
      end if;
    when 'out_for_delivery' then perform app.notify_order(new.id, 'out_for_delivery');
    when 'delivered' then
      perform app.notify_order(new.id, 'delivered');
      if (v_s ->> 'auto_complete_when_paid')::boolean and new.payment_status = 'paid' then
        perform app.system_move(new.id, 'completed', 'Closed automatically: delivered and paid');
      end if;
    when 'completed' then
      update public.order_bags set released_at = now() where order_id = new.id and released_at is null;
      update public.bags set status = 'available', current_order_id = null where current_order_id = new.id;
      perform app.award_completion(new.id);
      perform app.notify_order(new.id, 'feedback_request');
    else null;
  end case;
  return null;
end $$;

-- When payment arrives after delivery, close the order.
create or replace function app.laundry_after_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.payment_status is not distinct from old.payment_status then return null; end if;
  if not app.has_module(new.tenant_id, 'laundry_ops') or coalesce(current_setting('clena.demo_load', true), 'off') = 'on' then return null; end if;
  if new.payment_status = 'paid' and app.stage_key(new.current_stage_id) = 'delivered'
     and (app.laundry_settings(new.tenant_id) ->> 'auto_complete_when_paid')::boolean then
    perform app.system_move(new.id, 'completed', 'Closed automatically: delivered and paid');
  end if;
  return null;
end $$;

-- Delivered orders cannot be deleted (sample data excepted).
create or replace function app.guard_order_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.is_demo or auth.uid() is null then return old; end if;
  if old.delivered_at is not null or app.stage_key(old.current_stage_id) in ('delivered', 'completed') then
    raise exception 'Delivered orders cannot be deleted. Cancel or adjust them instead.' using errcode = '42501';
  end if;
  return old;
end $$;
drop trigger if exists orders_guard_delete on public.orders;
create trigger orders_guard_delete before delete on public.orders for each row execute function app.guard_order_delete();

-- Delivery OTP for each delivery job.
create or replace function app.job_make_secret()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'delivery' then
    insert into public.job_secrets (job_id, otp) values (new.id, lpad((floor(random() * 10000))::int::text, 4, '0'))
    on conflict (job_id) do nothing;
  end if;
  return null;
end $$;
drop trigger if exists delivery_jobs_secret on public.delivery_jobs;
create trigger delivery_jobs_secret after insert on public.delivery_jobs for each row execute function app.job_make_secret();

-- ---------------------------------------------------------------------------
-- 20. Operations functions (staff)
-- ---------------------------------------------------------------------------
create or replace function app.can_ops(p_tenant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.has_permission(p_tenant, 'orders.manage') or app.has_permission(p_tenant, 'orders.update_status')
      or app.has_permission(p_tenant, 'ops.receive') or app.has_permission(p_tenant, 'ops.sort')
      or app.has_permission(p_tenant, 'ops.process') or app.has_permission(p_tenant, 'ops.qc')
$$;

create or replace function app.order_tenant(p_order uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select tenant_id from public.orders where id = p_order
$$;

-- Find an order from a scanned or typed reference: order number, bag code or garment tag.
create or replace function public.find_by_reference(p_tenant uuid, p_ref text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_ref text := upper(btrim(coalesce(p_ref, ''))); v_id uuid; v_via text;
begin
  if not app.has_permission(p_tenant, 'orders.view') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if v_ref = '' then return null; end if;
  select id into v_id from public.orders where tenant_id = p_tenant and upper(order_number) = v_ref;
  v_via := 'order';
  if v_id is null and v_ref ~ '^[0-9]+$' then
    select id into v_id from public.orders where tenant_id = p_tenant and order_number = 'ORD-' || lpad(v_ref, 5, '0');
  end if;
  if v_id is null then
    select current_order_id into v_id from public.bags where tenant_id = p_tenant and code = v_ref and status = 'in_use';
    v_via := 'bag';
  end if;
  if v_id is null then
    select order_id into v_id from public.order_garments where tenant_id = p_tenant and tag_code = v_ref;
    v_via := 'tag';
  end if;
  if v_id is null then return null; end if;
  return jsonb_build_object('order_id', v_id, 'via', v_via);
end $$;

create or replace function public.attach_bag(p_order uuid, p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_t uuid := app.order_tenant(p_order); v_code text := upper(btrim(coalesce(p_code, ''))); v_bag record; v_other text;
begin
  if v_t is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if not (app.can_ops(v_t) or app.has_permission(v_t, 'logistics.view')) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if v_code !~ '^[A-Z0-9][A-Z0-9-]{1,31}$' then raise exception 'Bag codes use letters, numbers and dashes' using errcode = '22023'; end if;
  insert into public.bags (tenant_id, code) values (v_t, v_code) on conflict (tenant_id, code) do nothing;
  select * into v_bag from public.bags where tenant_id = v_t and code = v_code;
  if v_bag.status = 'retired' then raise exception 'Bag % is retired', v_code using errcode = '22023'; end if;
  if v_bag.status = 'in_use' and v_bag.current_order_id is distinct from p_order then
    select order_number into v_other from public.orders where id = v_bag.current_order_id;
    raise exception 'Bag % is already on order %', v_code, v_other using errcode = '23505';
  end if;
  if v_bag.current_order_id = p_order then return v_bag.id; end if;
  update public.bags set status = 'in_use', current_order_id = p_order where id = v_bag.id;
  insert into public.order_bags (tenant_id, order_id, bag_id) values (v_t, p_order, v_bag.id);
  perform app.audit(v_t, 'bag.attached', 'order', p_order, jsonb_build_object('bag', v_code));
  return v_bag.id;
end $$;

create or replace function public.release_bag(p_order uuid, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_t uuid := app.order_tenant(p_order); v_bag uuid;
begin
  if not app.can_ops(v_t) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select id into v_bag from public.bags where tenant_id = v_t and code = upper(btrim(p_code)) and current_order_id = p_order;
  if v_bag is null then return; end if;
  update public.bags set status = 'available', current_order_id = null where id = v_bag;
  update public.order_bags set released_at = now() where order_id = p_order and bag_id = v_bag and released_at is null;
  perform app.audit(v_t, 'bag.released', 'order', p_order, jsonb_build_object('bag', upper(p_code)));
end $$;

-- Recompute money on an order from its lines and fees (trusted).
create or replace function app.recompute_order(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare o record; v_sub numeric; v_tax numeric; v_pct numeric; v_express_pct numeric; v_prev text := coalesce(current_setting('clena.trusted_write', true), 'off');
begin
  select * into o from public.orders where id = p_order;
  select coalesce(sum(line_total), 0), coalesce(sum(round(line_total * tax_rate / 100, 2)), 0) into v_sub, v_tax from public.order_items where order_id = p_order;
  v_pct := coalesce((select (settings -> 'portal' ->> 'service_charge_pct')::numeric from public.tenants where id = o.tenant_id), 0);
  v_express_pct := coalesce((select (settings -> 'portal' ->> 'express_surcharge_pct')::numeric from public.tenants where id = o.tenant_id), 0);
  perform set_config('clena.trusted_write', 'on', true);
  update public.orders set
    subtotal = v_sub, tax_total = v_tax,
    service_fee = case when o.service_fee > 0 then round(v_sub * v_pct / 100, 2) else 0 end,
    express_fee = case when o.is_express then round(v_sub * v_express_pct / 100, 2) else 0 end
  where id = p_order;
  update public.orders set total = greatest(subtotal + tax_total + delivery_fee + service_fee + express_fee + adjustments_total - discount_total, 0)
  where id = p_order;
  perform app.refresh_order_payment(p_order);
  perform set_config('clena.trusted_write', v_prev, true);
end $$;

create or replace function app.apply_adjustment(p_adj uuid, p_via text)
returns void language plpgsql security definer set search_path = '' as $$
declare a record; v_line jsonb; v_prev text := coalesce(current_setting('clena.trusted_write', true), 'off');
begin
  select * into a from public.order_adjustments where id = p_adj for update;
  if a.status <> 'pending_approval' and p_via <> 'automatic' then return; end if;
  perform set_config('clena.trusted_write', 'on', true);
  if a.kind = 'weight_change' then
    for v_line in select * from jsonb_array_elements(a.details -> 'lines') loop
      update public.order_items set quantity = (v_line ->> 'new_quantity')::numeric,
        line_total = round((v_line ->> 'new_quantity')::numeric * unit_price, 2)
        where id = (v_line ->> 'item_id')::uuid and order_id = a.order_id;
    end loop;
  else
    update public.orders set adjustments_total = adjustments_total + a.amount where id = a.order_id;
  end if;
  update public.order_adjustments set status = 'applied', decided_by = auth.uid(), decided_via = p_via, decided_at = now() where id = p_adj;
  perform app.recompute_order(a.order_id);
  perform app.audit(a.tenant_id, 'adjustment.applied', 'order', a.order_id, jsonb_build_object('adjustment', p_adj, 'kind', a.kind, 'amount', a.amount, 'via', p_via));
  perform set_config('clena.trusted_write', v_prev, true);
end $$;

-- Record count and weight at sorting; weighed lines create an auditable adjustment.
-- p_lines: [{"item_id": "...", "quantity": 6.5}] for per-kg (or per-item) lines.
create or replace function public.record_count_weight(p_order uuid, p_item_count int, p_weight_kg numeric, p_lines jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_t uuid := app.order_tenant(p_order); v_line jsonb; v_item record; v_delta numeric := 0; v_changes jsonb := '[]'::jsonb;
        v_adj uuid; v_old_total numeric; v_new_total numeric; v_cur text;
begin
  if v_t is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if not (app.has_permission(v_t, 'ops.sort') or app.has_permission(v_t, 'ops.receive') or app.has_permission(v_t, 'orders.manage')) then
    raise exception 'Your role cannot record counts and weights' using errcode = '42501';
  end if;
  if p_item_count is not null and (p_item_count < 0 or p_item_count > 5000) then raise exception 'Check the item count' using errcode = '22023'; end if;
  if p_weight_kg is not null and (p_weight_kg < 0 or p_weight_kg > 1000) then raise exception 'Check the weight' using errcode = '22023'; end if;
  perform set_config('clena.trusted_write', 'on', true);
  update public.orders set received_item_count = coalesce(p_item_count, received_item_count),
                           received_weight_kg = coalesce(p_weight_kg, received_weight_kg) where id = p_order;
  perform set_config('clena.trusted_write', 'off', true);
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    select id, description, quantity, unit_price, tax_rate into v_item from public.order_items where id = (v_line ->> 'item_id')::uuid and order_id = p_order;
    if v_item.id is null then raise exception 'Line not found on this order' using errcode = '22023'; end if;
    if (v_line ->> 'quantity')::numeric <= 0 then raise exception 'Weighed quantity must be above zero' using errcode = '22023'; end if;
    if round((v_line ->> 'quantity')::numeric, 2) <> v_item.quantity then
      v_delta := v_delta + round(((v_line ->> 'quantity')::numeric - v_item.quantity) * v_item.unit_price * (1 + v_item.tax_rate / 100), 2);
      v_changes := v_changes || jsonb_build_object('item_id', v_item.id, 'description', v_item.description,
                     'old_quantity', v_item.quantity, 'new_quantity', round((v_line ->> 'quantity')::numeric, 2));
    end if;
  end loop;
  perform app.audit(v_t, 'order.weighed', 'order', p_order, jsonb_build_object('items', p_item_count, 'kg', p_weight_kg, 'changes', v_changes));
  if jsonb_array_length(v_changes) = 0 then return jsonb_build_object('adjustment', null); end if;
  update public.order_adjustments set status = 'cancelled' where order_id = p_order and kind = 'weight_change' and status = 'pending_approval';
  insert into public.order_adjustments (tenant_id, order_id, kind, amount, reason, details)
  values (v_t, p_order, 'weight_change', v_delta, 'Final weight and count after inspection', jsonb_build_object('lines', v_changes))
  returning id into v_adj;
  select total into v_old_total from public.orders where id = p_order;
  if v_delta <= 0 then
    perform app.apply_adjustment(v_adj, 'automatic');
  else
    select currency into v_cur from public.orders where id = p_order;
    perform app.notify_order(p_order, 'adjustment_request', 'After weighing, your order is ' || v_cur || ' ' || to_char(v_delta, 'FM999,999,990.00') || ' more than the estimate.');
  end if;
  select total into v_new_total from public.orders where id = p_order;
  return jsonb_build_object('adjustment', v_adj, 'amount', v_delta, 'status', case when v_delta <= 0 then 'applied' else 'pending_approval' end);
end $$;

create or replace function public.request_adjustment(p_order uuid, p_kind text, p_amount numeric, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_t uuid := app.order_tenant(p_order); v_id uuid; v_amt numeric; v_cur text;
begin
  if v_t is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if not (app.has_permission(v_t, 'orders.manage') or app.has_permission(v_t, 'incidents.manage')) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_kind not in ('extra_charge', 'discount', 'credit') then raise exception 'Choose extra charge, discount or credit' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above zero' using errcode = '22023'; end if;
  v_amt := case when p_kind = 'extra_charge' then round(p_amount, 2) else -round(p_amount, 2) end;
  insert into public.order_adjustments (tenant_id, order_id, kind, amount, reason) values (v_t, p_order, p_kind, v_amt, btrim(p_reason)) returning id into v_id;
  if v_amt < 0 then
    perform app.apply_adjustment(v_id, 'automatic');
  else
    select currency into v_cur from public.orders where id = p_order;
    perform app.notify_order(p_order, 'adjustment_request', 'An extra charge of ' || v_cur || ' ' || to_char(v_amt, 'FM999,999,990.00') || ' is proposed: ' || btrim(p_reason) || '.');
  end if;
  return v_id;
end $$;

-- Customer (in the app) or staff on the customer's behalf approves or declines.
create or replace function public.decide_adjustment(p_adj uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a record; v_customer boolean; v_staff boolean;
begin
  select adj.*, ord.customer_id into a from public.order_adjustments adj join public.orders ord on ord.id = adj.order_id where adj.id = p_adj;
  if a.id is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  v_customer := app.is_customer_self(a.tenant_id, a.customer_id);
  v_staff := app.has_permission(a.tenant_id, 'orders.manage');
  if not (v_customer or v_staff) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if a.status <> 'pending_approval' then raise exception 'This change has already been decided' using errcode = '22023'; end if;
  if not v_customer and char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'Note how the customer agreed (e.g. "Approved by phone")' using errcode = '22023';
  end if;
  if p_approve then
    perform app.apply_adjustment(p_adj, case when v_customer then 'customer_app' else 'staff_on_behalf' end);
  else
    update public.order_adjustments set status = 'declined', decided_by = auth.uid(), decided_at = now(),
      decided_via = case when v_customer then 'customer_app' else 'staff_on_behalf' end where id = p_adj;
  end if;
  perform app.audit(a.tenant_id, case when p_approve then 'adjustment.approved' else 'adjustment.declined' end, 'order', a.order_id,
                    jsonb_build_object('adjustment', p_adj, 'note', p_note));
end $$;

create or replace function public.add_garment(p_order uuid, p_description text, p_tag text default null, p_bag_code text default null,
                                             p_color text default null, p_brand text default null, p_condition text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_t uuid := app.order_tenant(p_order); v_bag uuid; v_id uuid;
begin
  if not (app.has_permission(v_t, 'ops.receive') or app.has_permission(v_t, 'ops.sort') or app.has_permission(v_t, 'orders.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_bag_code, '')), '') is not null then
    select id into v_bag from public.bags where tenant_id = v_t and code = upper(btrim(p_bag_code)) and current_order_id = p_order;
  end if;
  insert into public.order_garments (tenant_id, order_id, bag_id, tag_code, description, color, brand, condition_note)
  values (v_t, p_order, v_bag, nullif(upper(btrim(coalesce(p_tag, ''))), ''), btrim(p_description), nullif(btrim(coalesce(p_color, '')), ''),
          nullif(btrim(coalesce(p_brand, '')), ''), nullif(btrim(coalesce(p_condition, '')), ''))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Tag % is already used on another item', upper(p_tag) using errcode = '23505';
end $$;

create or replace function public.remove_garment(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_t uuid;
begin
  select tenant_id into v_t from public.order_garments where id = p_id;
  if not (app.has_permission(v_t, 'ops.receive') or app.has_permission(v_t, 'ops.sort') or app.has_permission(v_t, 'orders.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  delete from public.order_garments where id = p_id;
end $$;

-- Quality control: the 8-point SOP. Passing releases the order to Ready.
create or replace function public.submit_quality_check(p_order uuid, p_checklist jsonb, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_t uuid := app.order_tenant(p_order); v_keys text[] := array['identity', 'count_weight', 'stains_damage', 'process_complete',
          'cleanliness', 'finishing', 'tags_present', 'exceptions_recorded'];
        k text; v_pass boolean := true; v_id uuid; v_stage text;
begin
  if v_t is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if not (app.has_permission(v_t, 'ops.qc') or app.has_permission(v_t, 'orders.manage')) then raise exception 'Only quality control can do this' using errcode = '42501'; end if;
  if (select on_hold from public.orders where id = p_order) then raise exception 'This order is frozen by an open incident.' using errcode = '42501'; end if;
  foreach k in array v_keys loop
    if not (p_checklist ? k) then raise exception 'Answer every checklist item' using errcode = '22023'; end if;
    if not coalesce((p_checklist ->> k)::boolean, false) then v_pass := false; end if;
  end loop;
  if not v_pass and char_length(btrim(coalesce(p_notes, ''))) < 3 then raise exception 'Note what failed' using errcode = '22023'; end if;
  insert into public.quality_checks (tenant_id, order_id, checklist, passed, notes) values (v_t, p_order, p_checklist, v_pass, nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_id;
  perform app.audit(v_t, case when v_pass then 'qc.passed' else 'qc.failed' end, 'order', p_order, jsonb_build_object('check', v_id, 'notes', p_notes));
  v_stage := app.stage_key((select current_stage_id from public.orders where id = p_order));
  if v_pass and v_stage = 'quality_check' then
    perform app.system_move(p_order, 'ready', 'Passed quality control');
  elsif not v_pass and v_stage = 'quality_check' then
    perform app.system_move(p_order, 'processing', 'Returned for rework after quality control: ' || btrim(p_notes));
  end if;
  return jsonb_build_object('id', v_id, 'passed', v_pass);
end $$;

-- Incidents and exceptions. Missing or wrong items freeze the order.
create or replace function public.create_incident(p_tenant uuid, p_order uuid, p_kind text, p_description text,
                                                 p_severity text default 'medium', p_freeze boolean default false, p_photos text[] default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_freeze boolean := coalesce(p_freeze, false) or p_kind in ('missing_item', 'wrong_item'); v_photo text;
begin
  if not (app.can_ops(p_tenant) or app.has_permission(p_tenant, 'incidents.manage') or app.has_permission(p_tenant, 'logistics.view')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_order is not null and app.order_tenant(p_order) is distinct from p_tenant then raise exception 'Order not found' using errcode = 'P0002'; end if;
  insert into public.incidents (tenant_id, order_id, kind, severity, freezes_order, description)
  values (p_tenant, p_order, p_kind, coalesce(p_severity, 'medium'), v_freeze and p_order is not null, btrim(p_description)) returning id into v_id;
  foreach v_photo in array coalesce(p_photos, '{}') loop
    insert into public.ops_media (tenant_id, order_id, incident_id, kind, data_url) values (p_tenant, p_order, v_id, 'evidence', v_photo);
  end loop;
  if v_freeze and p_order is not null then
    perform set_config('clena.trusted_write', 'on', true);
    update public.orders set on_hold = true where id = p_order;
    perform set_config('clena.trusted_write', 'off', true);
  end if;
  if p_kind = 'delayed' and p_order is not null then perform app.notify_order(p_order, 'order_delayed', btrim(p_description)); end if;
  perform app.audit(p_tenant, 'incident.opened', 'incident', v_id, jsonb_build_object('order', p_order, 'kind', p_kind, 'freeze', v_freeze));
  return v_id;
end $$;

create or replace function public.update_incident(p_id uuid, p_status text, p_resolution text default null, p_assign uuid default null, p_notify boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare i record;
begin
  select * into i from public.incidents where id = p_id;
  if i.id is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  if not app.has_permission(i.tenant_id, 'incidents.manage') then raise exception 'Only managers can update incidents' using errcode = '42501'; end if;
  if p_status = 'resolved' and char_length(btrim(coalesce(p_resolution, ''))) < 3 then raise exception 'Describe how it was resolved' using errcode = '22023'; end if;
  update public.incidents set status = p_status, resolution = coalesce(nullif(btrim(coalesce(p_resolution, '')), ''), resolution),
    assigned_member_id = coalesce(p_assign, assigned_member_id), updated_at = now(),
    resolved_by = case when p_status = 'resolved' then auth.uid() else resolved_by end,
    resolved_at = case when p_status = 'resolved' then now() else resolved_at end
  where id = p_id;
  if i.order_id is not null and not exists (select 1 from public.incidents x where x.order_id = i.order_id and x.freezes_order and x.status <> 'resolved') then
    perform set_config('clena.trusted_write', 'on', true);
    update public.orders set on_hold = false where id = i.order_id;
    perform set_config('clena.trusted_write', 'off', true);
  end if;
  if p_notify and i.order_id is not null and p_resolution is not null then perform app.notify_order(i.order_id, 'incident_update', btrim(p_resolution)); end if;
  perform app.audit(i.tenant_id, 'incident.' || p_status, 'incident', p_id, jsonb_build_object('resolution', p_resolution));
end $$;

-- Customer reports a problem from the app (complaint).
create or replace function public.report_my_issue(p_order uuid, p_kind text, p_description text, p_photos text[] default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare o record; v_id uuid; v_photo text;
begin
  select id, tenant_id, customer_id into o from public.orders where id = p_order;
  if o.id is null or not app.is_customer_self(o.tenant_id, o.customer_id) then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if p_kind not in ('missing_item', 'damaged_item', 'quality_complaint', 'delayed', 'other') then raise exception 'Choose what went wrong' using errcode = '22023'; end if;
  if coalesce(array_length(p_photos, 1), 0) > 4 then raise exception 'Attach up to 4 photos' using errcode = '22023'; end if;
  insert into public.incidents (tenant_id, order_id, kind, severity, source, description)
  values (o.tenant_id, p_order, p_kind, case when p_kind in ('missing_item', 'damaged_item') then 'high' else 'medium' end, 'customer', btrim(p_description))
  returning id into v_id;
  foreach v_photo in array coalesce(p_photos, '{}') loop
    insert into public.ops_media (tenant_id, order_id, incident_id, kind, data_url) values (o.tenant_id, p_order, v_id, 'customer_photo', v_photo);
  end loop;
  perform app.audit(o.tenant_id, 'complaint.opened', 'incident', v_id, jsonb_build_object('order', p_order, 'kind', p_kind));
  return v_id;
end $$;

-- Refunds are always tied to the original payment and can't exceed it.
create or replace function public.refund_payment(p_payment uuid, p_amount numeric, p_method text, p_reason text, p_reference text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p record; v_done numeric; v_id uuid;
begin
  select * into p from public.payments where id = p_payment;
  if p.id is null then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if not app.has_permission(p.tenant_id, 'payments.record') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p.status <> 'successful' then raise exception 'Only successful payments can be refunded' using errcode = '22023'; end if;
  select coalesce(sum(amount), 0) into v_done from public.refunds where payment_id = p_payment;
  if p_amount is null or p_amount <= 0 or round(p_amount, 2) > p.amount - v_done then
    raise exception 'Refund must be between 0 and %', to_char(p.amount - v_done, 'FM999,999,990.00') using errcode = '22023';
  end if;
  insert into public.refunds (tenant_id, payment_id, order_id, amount, method, reason, reference)
  values (p.tenant_id, p_payment, p.order_id, round(p_amount, 2), p_method, btrim(p_reason), p_reference) returning id into v_id;
  if p.order_id is not null then perform app.refresh_order_payment(p.order_id); end if;
  perform app.audit(p.tenant_id, 'payment.refunded', 'payment', p_payment, jsonb_build_object('refund', v_id, 'amount', p_amount, 'reason', p_reason));
  return v_id;
end $$;

-- Order payment state now nets off refunds.
create or replace function app.refresh_order_payment(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_paid numeric(12, 2); v_refunds numeric(12, 2); v_total numeric(12, 2); v_refunded boolean;
        v_prev text := coalesce(current_setting('clena.trusted_write', true), 'off');
begin
  if p_order is null then return; end if;
  select coalesce(sum(amount) filter (where status = 'successful'), 0), bool_or(status = 'refunded')
    into v_paid, v_refunded from public.payments where order_id = p_order;
  select coalesce(sum(amount), 0) into v_refunds from public.refunds where order_id = p_order;
  v_paid := greatest(v_paid - v_refunds, 0);
  select total into v_total from public.orders where id = p_order;
  perform set_config('clena.trusted_write', 'on', true);
  update public.orders set
    amount_paid = v_paid,
    payment_status = case
      when v_paid = 0 and (coalesce(v_refunded, false) or v_refunds > 0) then 'refunded'::public.payment_status
      when v_paid = 0 then 'unpaid'::public.payment_status
      when v_paid < v_total then 'partially_paid'::public.payment_status
      else 'paid'::public.payment_status end
  where id = p_order;
  perform set_config('clena.trusted_write', v_prev, true);
end $$;

-- ---------------------------------------------------------------------------
-- 21. Dispatch and driver functions
-- ---------------------------------------------------------------------------
create or replace function public.assign_job(p_job uuid, p_member uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare j record; v_ok boolean; v_name text;
begin
  select * into j from public.delivery_jobs where id = p_job;
  if j.id is null then raise exception 'Job not found' using errcode = 'P0002'; end if;
  if not app.has_permission(j.tenant_id, 'logistics.manage') then raise exception 'Only dispatch can assign jobs' using errcode = '42501'; end if;
  if j.status in ('completed', 'cancelled') then raise exception 'This job is closed' using errcode = '22023'; end if;
  select exists (select 1 from public.tenant_members m join public.role_permissions rp on rp.role_id = m.role_id
                 where m.id = p_member and m.tenant_id = j.tenant_id and m.status = 'active' and rp.permission_key = 'logistics.view') into v_ok;
  if not v_ok then raise exception 'Choose an active driver' using errcode = '22023'; end if;
  update public.delivery_jobs set driver_member_id = p_member, status = case when status = 'en_route' then status else 'assigned' end, assigned_at = now() where id = p_job;
  if j.kind = 'pickup' then
    perform app.system_move(j.order_id, 'pickup_assigned', 'Driver assigned');
    select split_part(coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)), ' ', 1) into v_name
      from public.tenant_members m join auth.users u on u.id = m.user_id where m.id = p_member;
    perform app.notify_order(j.order_id, 'pickup_assigned', case when v_name is not null then 'Your driver is ' || v_name else null end);
  end if;
  perform app.audit(j.tenant_id, 'job.assigned', 'delivery_job', p_job, jsonb_build_object('member', p_member));
end $$;

create or replace function public.reschedule_job(p_job uuid, p_start timestamptz, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare j record; v_new uuid;
begin
  select * into j from public.delivery_jobs where id = p_job;
  if j.id is null then raise exception 'Job not found' using errcode = 'P0002'; end if;
  if not app.has_permission(j.tenant_id, 'logistics.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_start is null or p_start < now() - interval '1 hour' then raise exception 'Choose a time in the future' using errcode = '22023'; end if;
  if j.status = 'failed' then
    insert into public.delivery_jobs (tenant_id, order_id, kind, attempt, scheduled_start, scheduled_end, order_number, customer_name, customer_phone,
                                      address, landmark, zone_name, instructions, items_summary, amount_due)
    values (j.tenant_id, j.order_id, j.kind, j.attempt + 1, p_start, p_start + interval '2 hours', j.order_number, j.customer_name, j.customer_phone,
            j.address, j.landmark, j.zone_name, coalesce(p_note, j.instructions), j.items_summary, j.amount_due)
    returning id into v_new;
  elsif j.status in ('unassigned', 'assigned') then
    update public.delivery_jobs set scheduled_start = p_start, scheduled_end = p_start + interval '2 hours' where id = p_job;
    v_new := p_job;
  else
    raise exception 'This job can''t be rescheduled now' using errcode = '22023';
  end if;
  perform app.audit(j.tenant_id, 'job.rescheduled', 'delivery_job', p_job, jsonb_build_object('new_job', v_new, 'start', p_start));
  return v_new;
end $$;

create or replace function public.set_my_availability(p_tenant uuid, p_available boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_m uuid := app.current_member_id(p_tenant);
begin
  if v_m is null or not app.has_permission(p_tenant, 'logistics.view') then raise exception 'Not a driver of this business' using errcode = '42501'; end if;
  insert into public.driver_status (tenant_id, member_id, is_available, updated_at) values (p_tenant, v_m, p_available, now())
  on conflict (tenant_id, member_id) do update set is_available = excluded.is_available, updated_at = now();
end $$;

create or replace function app.my_job(p_job uuid)
returns public.delivery_jobs language plpgsql security definer set search_path = '' as $$
declare j public.delivery_jobs;
begin
  select * into j from public.delivery_jobs where id = p_job;
  if j.id is null or j.driver_member_id is distinct from app.current_member_id(j.tenant_id) then
    raise exception 'This job is not assigned to you' using errcode = '42501';
  end if;
  return j;
end $$;

create or replace function public.driver_start_job(p_job uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.delivery_jobs := app.my_job(p_job);
begin
  if j.status not in ('assigned', 'en_route') then raise exception 'This job can''t be started' using errcode = '22023'; end if;
  if j.kind = 'delivery' and app.stage_key((select current_stage_id from public.orders where id = j.order_id)) not in ('ready', 'out_for_delivery') then
    raise exception 'This order isn''t released for delivery yet' using errcode = '22023';
  end if;
  update public.delivery_jobs set status = 'en_route', started_at = coalesce(started_at, now()) where id = p_job;
  if j.kind = 'delivery' then perform app.system_move(j.order_id, 'out_for_delivery', 'Driver left with the order'); end if;
  perform app.notify_order(j.order_id, 'driver_arriving');
end $$;

create or replace function public.driver_complete_pickup(p_job uuid, p_bag_codes text[], p_item_count int, p_photo text default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.delivery_jobs := app.my_job(p_job); v_code text;
begin
  if j.kind <> 'pickup' or j.status not in ('assigned', 'en_route') then raise exception 'This pickup can''t be completed' using errcode = '22023'; end if;
  if coalesce(array_length(p_bag_codes, 1), 0) = 0 then raise exception 'Scan or enter at least one bag code' using errcode = '22023'; end if;
  if p_item_count is null or p_item_count < 1 then raise exception 'Enter how many items or bags you collected' using errcode = '22023'; end if;
  foreach v_code in array p_bag_codes loop perform public.attach_bag(j.order_id, v_code); end loop;
  if p_photo is not null then
    insert into public.ops_media (tenant_id, order_id, job_id, kind, data_url, caption) values (j.tenant_id, j.order_id, p_job, 'proof_photo', p_photo, 'Collection');
  end if;
  update public.delivery_jobs set status = 'completed', completed_at = now(), collected_item_count = p_item_count,
    collected_bag_codes = (select array_agg(upper(btrim(x))) from unnest(p_bag_codes) x), proof_type = case when p_photo is not null then 'photo' end,
    failed_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_job;
  perform app.system_move(j.order_id, 'picked_up', 'Collected by driver: ' || p_item_count || ' item(s), bags ' || array_to_string(p_bag_codes, ', '));
  perform app.audit(j.tenant_id, 'job.completed', 'delivery_job', p_job, jsonb_build_object('kind', 'pickup', 'bags', p_bag_codes, 'items', p_item_count));
end $$;

create or replace function public.driver_complete_delivery(p_job uuid, p_proof text, p_otp text default null, p_signature text default null,
                                                          p_photo text default null, p_recipient text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.delivery_jobs := app.my_job(p_job); v_otp text;
begin
  if j.kind <> 'delivery' or j.status not in ('assigned', 'en_route') then raise exception 'This delivery can''t be completed' using errcode = '22023'; end if;
  if p_proof = 'otp' then
    select otp into v_otp from public.job_secrets where job_id = p_job;
    if v_otp is null or btrim(coalesce(p_otp, '')) <> v_otp then raise exception 'That delivery code is not correct' using errcode = '22023'; end if;
  elsif p_proof = 'signature' then
    if p_signature is null then raise exception 'Ask the customer to sign' using errcode = '22023'; end if;
    insert into public.ops_media (tenant_id, order_id, job_id, kind, data_url, caption) values (j.tenant_id, j.order_id, p_job, 'signature', p_signature, p_recipient);
  elsif p_proof = 'photo' then
    if p_photo is null then raise exception 'Take a photo of the handover' using errcode = '22023'; end if;
    insert into public.ops_media (tenant_id, order_id, job_id, kind, data_url, caption) values (j.tenant_id, j.order_id, p_job, 'proof_photo', p_photo, 'Delivery');
  else
    raise exception 'Choose a proof of delivery' using errcode = '22023';
  end if;
  update public.delivery_jobs set status = 'completed', completed_at = now(), proof_type = p_proof,
    recipient_name = nullif(btrim(coalesce(p_recipient, '')), '') where id = p_job;
  perform app.system_move(j.order_id, 'delivered', 'Delivered with ' || p_proof || ' proof' || coalesce(' to ' || nullif(btrim(p_recipient), ''), ''));
  perform app.audit(j.tenant_id, 'job.completed', 'delivery_job', p_job, jsonb_build_object('kind', 'delivery', 'proof', p_proof));
end $$;

create or replace function public.driver_fail_job(p_job uuid, p_reason text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.delivery_jobs := app.my_job(p_job); v_inc uuid;
begin
  if j.status not in ('assigned', 'en_route') then raise exception 'This job is closed' using errcode = '22023'; end if;
  if p_reason = 'other' and char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Describe what happened' using errcode = '22023'; end if;
  update public.delivery_jobs set status = 'failed', failed_reason = p_reason, failed_note = nullif(btrim(coalesce(p_note, '')), ''), completed_at = now() where id = p_job;
  insert into public.incidents (tenant_id, order_id, job_id, kind, severity, source, description)
  values (j.tenant_id, j.order_id, p_job, case when j.kind = 'pickup' then 'failed_pickup' else 'failed_delivery' end, 'medium', 'staff',
          initcap(replace(p_reason, '_', ' ')) || coalesce(': ' || nullif(btrim(p_note), ''), ''))
  returning id into v_inc;
  if j.kind = 'delivery' then perform app.system_move(j.order_id, 'ready', 'Delivery attempt failed: ' || replace(p_reason, '_', ' ')); end if;
  perform app.notify_order(j.order_id, 'failed_attempt', j.kind);
  perform app.audit(j.tenant_id, 'job.failed', 'delivery_job', p_job, jsonb_build_object('reason', p_reason, 'incident', v_inc));
end $$;

create or replace function public.my_delivery_otp(p_order uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare o record;
begin
  select id, tenant_id, customer_id into o from public.orders where id = p_order;
  if o.id is null or not app.is_customer_self(o.tenant_id, o.customer_id) then return null; end if;
  return (select s.otp from public.delivery_jobs j join public.job_secrets s on s.job_id = j.id
          where j.order_id = p_order and j.kind = 'delivery' and j.status in ('unassigned', 'assigned', 'en_route') order by j.created_at desc limit 1);
end $$;

-- ---------------------------------------------------------------------------
-- 22. Processing partners
-- ---------------------------------------------------------------------------
create or replace function public.send_to_partner(p_partner uuid, p_orders uuid[], p_expected timestamptz default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_p record; v_id uuid; v_ref text; v_o uuid; v_bags int; v_kg numeric;
begin
  select * into v_p from public.processing_partners where id = p_partner;
  if v_p.id is null or not v_p.is_active then raise exception 'Choose an active partner' using errcode = '22023'; end if;
  if not (app.has_permission(v_p.tenant_id, 'ops.process') or app.has_permission(v_p.tenant_id, 'orders.manage')) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if coalesce(array_length(p_orders, 1), 0) = 0 then raise exception 'Choose at least one order' using errcode = '22023'; end if;
  if exists (select 1 from public.orders where id = any (p_orders) and (tenant_id <> v_p.tenant_id or on_hold)) then
    raise exception 'One of these orders is frozen or not yours' using errcode = '22023';
  end if;
  v_ref := 'PB-' || lpad(app.next_counter(v_p.tenant_id, 'partner_batch')::text, 4, '0');
  select count(*), null into v_bags, v_kg from public.order_bags where order_id = any (p_orders) and released_at is null;
  select sum(received_weight_kg) into v_kg from public.orders where id = any (p_orders);
  insert into public.partner_batches (tenant_id, partner_id, reference, bag_count, weight_kg, expected_back_at, notes)
  values (v_p.tenant_id, p_partner, v_ref, v_bags, v_kg, coalesce(p_expected, now() + make_interval(hours => v_p.turnaround_hours)), p_notes)
  returning id into v_id;
  foreach v_o in array p_orders loop
    insert into public.partner_batch_orders (batch_id, order_id) values (v_id, v_o);
    perform set_config('clena.trusted_write', 'on', true);
    update public.orders set processing_partner_id = p_partner where id = v_o;
    perform set_config('clena.trusted_write', 'off', true);
    if app.stage_key((select current_stage_id from public.orders where id = v_o)) in ('received', 'sorting') then
      perform app.system_move(v_o, 'processing', 'Sent to ' || v_p.name || ' in batch ' || v_ref);
    end if;
  end loop;
  perform app.audit(v_p.tenant_id, 'partner.batch_sent', 'partner_batch', v_id, jsonb_build_object('orders', p_orders));
  return v_id;
end $$;

create or replace function public.receive_partner_batch(p_batch uuid, p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare b record; v_o uuid;
begin
  select * into b from public.partner_batches where id = p_batch;
  if b.id is null then raise exception 'Batch not found' using errcode = 'P0002'; end if;
  if not (app.has_permission(b.tenant_id, 'ops.process') or app.has_permission(b.tenant_id, 'orders.manage')) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if b.status = 'returned' then return; end if;
  update public.partner_batches set status = 'returned', returned_at = now(), notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes) where id = p_batch;
  for v_o in select order_id from public.partner_batch_orders where batch_id = p_batch loop
    if app.stage_key((select current_stage_id from public.orders where id = v_o)) in ('processing', 'drying', 'finishing') then
      perform app.system_move(v_o, 'quality_check', 'Returned from partner batch ' || b.reference);
    end if;
  end loop;
  perform app.audit(b.tenant_id, 'partner.batch_returned', 'partner_batch', p_batch, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- 23. Loyalty, referrals, feedback, subscriptions (customer side)
-- ---------------------------------------------------------------------------
create or replace function app.add_points(p_tenant uuid, p_customer uuid, p_points int, p_reason text, p_order uuid default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_prev text := coalesce(current_setting('clena.trusted_write', true), 'off');
begin
  if coalesce(p_points, 0) = 0 then return; end if;
  insert into public.loyalty_ledger (tenant_id, customer_id, points, reason, order_id, note) values (p_tenant, p_customer, p_points, p_reason, p_order, p_note);
  perform set_config('clena.trusted_write', 'on', true);
  update public.customers set loyalty_points = greatest(loyalty_points + p_points, 0) where id = p_customer;
  perform set_config('clena.trusted_write', v_prev, true);
end $$;

create or replace function app.award_completion(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare o record; s jsonb; v_n int; v_ref record;
begin
  select * into o from public.orders where id = p_order;
  s := app.laundry_settings(o.tenant_id);
  if not (s ->> 'loyalty_enabled')::boolean or o.customer_id is null then return; end if;
  if exists (select 1 from public.loyalty_ledger where order_id = p_order and reason = 'order_completed') then return; end if;
  perform app.add_points(o.tenant_id, o.customer_id, floor(o.amount_paid / 100 * (s ->> 'points_per_100')::numeric)::int, 'order_completed', p_order);
  select count(*) into v_n from public.orders x where x.customer_id = o.customer_id and x.cancelled_at is null
    and app.stage_key(x.current_stage_id) = 'completed';
  if (s ->> 'milestone_every')::int > 0 and v_n % (s ->> 'milestone_every')::int = 0 then
    perform app.add_points(o.tenant_id, o.customer_id, (s ->> 'milestone_points')::int, 'milestone', p_order, v_n || ' completed orders');
  end if;
  if v_n = 1 then
    select c.referred_by into v_ref from public.customers c where c.id = o.customer_id;
    if v_ref.referred_by is not null then
      perform app.add_points(o.tenant_id, v_ref.referred_by, (s ->> 'referral_points')::int, 'referral_reward', p_order, 'Referred a friend');
      perform app.add_points(o.tenant_id, o.customer_id, (s ->> 'referee_points')::int, 'referral_welcome', p_order, 'Joined with a referral');
    end if;
  end if;
end $$;

create or replace function public.adjust_points(p_customer uuid, p_points int, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_t uuid;
begin
  select tenant_id into v_t from public.customers where id = p_customer;
  if not app.has_permission(v_t, 'marketing.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Add a reason' using errcode = '22023'; end if;
  perform app.add_points(v_t, p_customer, p_points, 'adjustment', null, p_note);
  perform app.audit(v_t, 'loyalty.adjusted', 'customer', p_customer, jsonb_build_object('points', p_points, 'note', p_note));
end $$;

create or replace function public.submit_feedback(p_order uuid, p_rating int, p_comment text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare o record;
begin
  select id, tenant_id, customer_id, current_stage_id into o from public.orders where id = p_order;
  if o.id is null or not app.is_customer_self(o.tenant_id, o.customer_id) then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if app.stage_key(o.current_stage_id) not in ('delivered', 'completed') then raise exception 'You can rate once the order is delivered' using errcode = '22023'; end if;
  insert into public.order_feedback (order_id, tenant_id, customer_id, rating, comment) values (p_order, o.tenant_id, o.customer_id, p_rating, nullif(btrim(coalesce(p_comment, '')), ''))
  on conflict (order_id) do update set rating = excluded.rating, comment = excluded.comment, created_at = now();
  if p_rating <= 2 then
    insert into public.incidents (tenant_id, order_id, kind, severity, source, description)
    values (o.tenant_id, p_order, 'quality_complaint', 'medium', 'customer', 'Low rating (' || p_rating || '/5)' || coalesce(': ' || nullif(btrim(p_comment), ''), ''));
  end if;
end $$;

create or replace function public.mark_notifications_read(p_tenant uuid)
returns void language sql security definer set search_path = '' as $$
  update public.customer_notifications set read_at = now()
  where tenant_id = p_tenant and customer_id = app.my_customer_id(p_tenant) and read_at is null
$$;

create or replace function public.subscribe_to_plan(p_tenant uuid, p_plan uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_c uuid := app.my_customer_id(p_tenant); v_id uuid;
begin
  if v_c is null then raise exception 'Sign in as a customer of this business' using errcode = '42501'; end if;
  if not exists (select 1 from public.subscription_plans where id = p_plan and tenant_id = p_tenant and is_active) then raise exception 'Plan not available' using errcode = '22023'; end if;
  if exists (select 1 from public.customer_subscriptions where customer_id = v_c and status in ('pending_payment', 'active', 'paused')) then
    raise exception 'You already have a subscription. Cancel it first to change plans.' using errcode = '23505';
  end if;
  insert into public.customer_subscriptions (tenant_id, customer_id, plan_id) values (p_tenant, v_c, p_plan) returning id into v_id;
  return v_id;
end $$;

create or replace function public.cancel_my_subscription(p_sub uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  select * into s from public.customer_subscriptions where id = p_sub;
  if s.id is null or not (app.is_customer_self(s.tenant_id, s.customer_id) or app.has_permission(s.tenant_id, 'subscriptions.manage')) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  update public.customer_subscriptions set status = case when status = 'pending_payment' then 'cancelled' else status end,
    auto_renew = false, updated_at = now() where id = p_sub;
  if s.status = 'pending_payment' then return; end if;
end $$;

-- Business records the subscription payment; the plan starts now.
create or replace function public.activate_subscription(p_sub uuid, p_method text, p_reference text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare s record; v_plan record; v_pay uuid; v_ref text;
begin
  select * into s from public.customer_subscriptions where id = p_sub;
  if s.id is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  if not app.has_permission(s.tenant_id, 'subscriptions.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into v_plan from public.subscription_plans where id = s.plan_id;
  v_ref := coalesce(nullif(btrim(coalesce(p_reference, '')), ''), 'SUB-' || upper(substr(replace(p_sub::text, '-', ''), 1, 8)) || '-' || to_char(now(), 'YYMMDDHH24MI'));
  if v_plan.price > 0 then
    insert into public.payments (tenant_id, customer_id, amount, currency, method, status, reference, note, recorded_by)
    values (s.tenant_id, s.customer_id, v_plan.price, (select currency from public.tenants where id = s.tenant_id),
            p_method::public.payment_method, 'successful', v_ref, 'Subscription: ' || v_plan.name, auth.uid())
    returning id into v_pay;
  end if;
  update public.customer_subscriptions set status = 'active', payment_id = v_pay,
    current_period_start = case when status = 'active' and current_period_end > now() then current_period_start else now() end,
    current_period_end = case when status = 'active' and current_period_end > now() then current_period_end + make_interval(days => v_plan.period_days)
                              else now() + make_interval(days => v_plan.period_days) end,
    updated_at = now() where id = p_sub;
  perform app.audit(s.tenant_id, 'subscription.activated', 'customer_subscription', p_sub, jsonb_build_object('payment', v_pay));
end $$;

-- ---------------------------------------------------------------------------
-- 24. Smart reminder engine (transparent rules first)
-- ---------------------------------------------------------------------------
create or replace function app.insights_core(p_tenant uuid)
returns table (customer_id uuid, full_name text, phone text, completed_orders int, last_completed_at timestamptz,
               avg_interval_days numeric, avg_order_value numeric, total_spend numeric, preferred_dow int,
               predicted_next_at timestamptz, segment text, reason text, has_active_order boolean, subscription_plan text)
language sql stable security definer set search_path = '' as $$
  with s as (select (app.laundry_settings(p_tenant) ->> 'reminder_default_days')::int as dflt),
  done as (
    select o.customer_id, o.completed_at, o.total, o.created_at,
           lag(o.completed_at) over (partition by o.customer_id order by o.completed_at) as prev_at
    from public.orders o where o.tenant_id = p_tenant and o.cancelled_at is null and o.completed_at is not null
  ),
  agg as (
    select d.customer_id, count(*)::int as n, max(d.completed_at) as last_at, avg(d.total) as aov, sum(d.total) as spend,
           avg(extract(epoch from d.completed_at - d.prev_at) / 86400) filter (where d.prev_at is not null) as avg_int,
           mode() within group (order by extract(isodow from d.created_at)::int) as dow
    from done d group by d.customer_id
  ),
  avg_all as (select avg(spend) as avg_spend from agg),
  sub as (
    select cs.customer_id, p.name from public.customer_subscriptions cs join public.subscription_plans p on p.id = cs.plan_id
    where cs.tenant_id = p_tenant and cs.status = 'active' and cs.current_period_end > now()
  ),
  cancels as (
    select customer_id, count(*) as n from public.orders where tenant_id = p_tenant and cancelled_at > now() - interval '60 days' group by customer_id
  ),
  active as (
    select distinct o.customer_id from public.orders o join public.workflow_stages st on st.id = o.current_stage_id
    where o.tenant_id = p_tenant and o.cancelled_at is null and not st.is_terminal
  ),
  base as (
    select c.id, c.full_name, c.phone, c.tags, a.n, a.last_at, a.aov, a.spend, a.dow,
           round(coalesce(a.avg_int, (select dflt from s))::numeric, 1) as interval_days,
           (sub.name is not null) as subscribed, sub.name as plan, coalesce(cn.n, 0) as cancels,
           (ac.customer_id is not null) as has_active
    from public.customers c
    left join agg a on a.customer_id = c.id
    left join sub on sub.customer_id = c.id
    left join cancels cn on cn.customer_id = c.id
    left join active ac on ac.customer_id = c.id
    where c.tenant_id = p_tenant and c.archived_at is null
  )
  select b.id, b.full_name, b.phone, coalesce(b.n, 0), b.last_at, case when b.n >= 2 then b.interval_days end, round(b.aov, 2), round(coalesce(b.spend, 0), 2), b.dow,
    case when b.last_at is null then null else
      b.last_at + make_interval(days => (case when b.subscribed then least(b.interval_days, 7) else b.interval_days end)::int + case when b.cancels > 0 then 3 else 0 end)
    end,
    case
      when b.last_at is null then 'prospect'
      when 'vip' = any (b.tags) or b.spend >= 3 * (select avg_spend from avg_all) then 'vip'
      when now() > b.last_at + make_interval(days => greatest((b.interval_days * 3)::int, 60)) then 'lapsed'
      when now() > b.last_at + make_interval(days => (b.interval_days * 1.5)::int) then 'at_risk'
      when b.n = 1 then 'new'
      else 'regular'
    end,
    case when b.last_at is null then 'No completed orders yet'
      else concat_ws(' · ',
        case when b.n >= 2 then 'Usually every ' || b.interval_days || ' days' else 'Default interval of ' || b.interval_days || ' days (one order so far)' end,
        case when b.subscribed then 'subscriber (' || b.plan || ')' end,
        case when b.cancels > 0 then b.cancels || ' recent cancellation(s)' end,
        case when b.dow is not null then 'often books on ' || (array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[b.dow] end)
    end,
    b.has_active, b.plan
  from base b
$$;

create or replace function public.customer_insights(p_tenant uuid, p_customer uuid default null)
returns table (customer_id uuid, full_name text, phone text, completed_orders int, last_completed_at timestamptz,
               avg_interval_days numeric, avg_order_value numeric, total_spend numeric, preferred_dow int,
               predicted_next_at timestamptz, segment text, reason text, has_active_order boolean, subscription_plan text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.has_permission(p_tenant, 'customers.view') then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query select * from app.insights_core(p_tenant) i where p_customer is null or i.customer_id = p_customer;
end $$;

create or replace function public.my_service_reminder(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_c uuid := app.my_customer_id(p_tenant); r record;
begin
  if v_c is null then return null; end if;
  select * into r from app.insights_core(p_tenant) i where i.customer_id = v_c;
  if r.last_completed_at is null or r.has_active_order then return null; end if;
  return jsonb_build_object('predicted_next_at', r.predicted_next_at, 'last_completed_at', r.last_completed_at,
                            'interval_days', r.avg_interval_days, 'reason', r.reason, 'due', r.predicted_next_at <= now() + interval '1 day');
end $$;

-- ---------------------------------------------------------------------------
-- 25. Slots with capacity
-- ---------------------------------------------------------------------------
create or replace function public.slot_availability(p_tenant uuid, p_days int default 8)
returns table (slot_start timestamptz, booked int, capacity int)
language plpgsql stable security definer set search_path = '' as $$
declare v_tz text; v_ps jsonb := app.portal_settings(p_tenant); v_cap int;
begin
  if app.my_customer_id(p_tenant) is null and not app.is_member(p_tenant) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select timezone into v_tz from public.tenants where id = p_tenant;
  v_cap := coalesce((v_ps ->> 'slot_capacity')::int, 0);
  return query
    with slots as (
      select ((d::date + make_interval(hours => h)) at time zone v_tz) as st
      from generate_series((now() at time zone v_tz)::date, (now() at time zone v_tz)::date + (least(greatest(p_days, 1), 21) - 1), interval '1 day') d,
           generate_series((v_ps ->> 'slot_start_hour')::int, greatest((v_ps ->> 'slot_end_hour')::int - 2, (v_ps ->> 'slot_start_hour')::int), 2) h
    )
    select s.st, (select count(*)::int from public.delivery_jobs j where j.tenant_id = p_tenant and j.kind = 'pickup'
                   and j.status not in ('failed', 'cancelled') and j.scheduled_start = s.st), v_cap
    from slots s order by s.st;
end $$;

-- ---------------------------------------------------------------------------
-- 26. Customer app: settings, public profile, pricing, booking (extended)
-- ---------------------------------------------------------------------------
create or replace function app.portal_settings(p_tenant uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'signup_enabled', coalesce((t.settings -> 'portal' ->> 'signup_enabled')::boolean, true),
    'welcome_title', t.settings -> 'portal' ->> 'welcome_title',
    'welcome_text', t.settings -> 'portal' ->> 'welcome_text',
    'delivery_fee', coalesce((t.settings -> 'portal' ->> 'delivery_fee')::numeric, 0),
    'service_charge_pct', coalesce((t.settings -> 'portal' ->> 'service_charge_pct')::numeric, 0),
    'min_order', coalesce((t.settings -> 'portal' ->> 'min_order')::numeric, 0),
    'pickup_lead_hours', coalesce((t.settings -> 'portal' ->> 'pickup_lead_hours')::int, 2),
    'slot_start_hour', coalesce((t.settings -> 'portal' ->> 'slot_start_hour')::int, 8),
    'slot_end_hour', coalesce((t.settings -> 'portal' ->> 'slot_end_hour')::int, 18),
    'slot_capacity', coalesce((t.settings -> 'portal' ->> 'slot_capacity')::int, 0),
    'drop_off_enabled', coalesce((t.settings -> 'portal' ->> 'drop_off_enabled')::boolean, true),
    'pickup_enabled', coalesce((t.settings -> 'portal' ->> 'pickup_enabled')::boolean, true),
    'express_enabled', coalesce((t.settings -> 'portal' ->> 'express_enabled')::boolean, false),
    'express_surcharge_pct', coalesce((t.settings -> 'portal' ->> 'express_surcharge_pct')::numeric, 0),
    'express_hours', coalesce((t.settings -> 'portal' ->> 'express_hours')::int, 24),
    'standard_hours', coalesce((t.settings -> 'portal' ->> 'standard_hours')::int, 4),
    'support_phone', coalesce(t.settings -> 'portal' ->> 'support_phone', t.phone),
    'support_whatsapp', t.settings -> 'portal' ->> 'support_whatsapp',
    'support_email', coalesce(t.settings -> 'portal' ->> 'support_email', t.email),
    'faqs', coalesce(t.settings -> 'portal' -> 'faqs', '[]'::jsonb),
    'bank_name', t.settings -> 'payments' ->> 'bank_name',
    'account_name', t.settings -> 'payments' ->> 'account_name',
    'account_number', t.settings -> 'payments' ->> 'account_number'
  ) from public.tenants t where t.id = p_tenant
$$;

create or replace function public.public_business(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v public.tenants; v_now timestamptz := now(); v_ls jsonb;
begin
  select * into v from public.tenants where slug = lower(btrim(p_slug));
  if v.id is null then return null; end if;
  if v.status in ('suspended', 'cancelled') then
    return jsonb_build_object('id', v.id, 'slug', v.slug, 'name', v.name, 'available', false, 'branding', v.branding - 'receipt_footer');
  end if;
  v_ls := app.laundry_settings(v.id);
  return jsonb_build_object(
    'id', v.id, 'slug', v.slug, 'name', v.name, 'industry', v.industry, 'available', true,
    'currency', v.currency, 'country', v.country, 'timezone', v.timezone, 'address', v.address,
    'branding', v.branding - 'receipt_footer',
    'laundry_ops', app.has_module(v.id, 'laundry_ops'),
    'portal', app.portal_settings(v.id) - 'bank_name' - 'account_name' - 'account_number',
    'loyalty', jsonb_build_object('enabled', (v_ls ->> 'loyalty_enabled')::boolean, 'points_per_100', (v_ls ->> 'points_per_100')::numeric,
                                  'point_value', (v_ls ->> 'point_value')::numeric, 'min_redeem', (v_ls ->> 'min_redeem')::int,
                                  'referral_points', (v_ls ->> 'referral_points')::int, 'referee_points', (v_ls ->> 'referee_points')::int),
    'zones', (select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'areas', z.areas, 'delivery_fee', z.delivery_fee, 'min_order', z.min_order)
                     order by z.sort_order, z.name), '[]'::jsonb) from public.service_zones z where z.tenant_id = v.id and z.is_active),
    'plans', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'price', p.price,
                     'period_days', p.period_days, 'included_kg', p.included_kg, 'free_delivery', p.free_delivery) order by p.sort_order, p.price), '[]'::jsonb)
              from public.subscription_plans p where p.tenant_id = v.id and p.is_active),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.sort_order, c.name), '[]'::jsonb)
                   from public.service_categories c where c.tenant_id = v.id
                     and exists (select 1 from public.services s where s.category_id = c.id and s.is_active)),
    'services', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', s.id, 'name', s.name, 'description', s.description, 'category_id', s.category_id,
                    'pricing_model', s.pricing_model, 'price', s.base_price, 'tax_rate', s.tax_rate,
                    'duration_minutes', s.duration_minutes, 'instructions', s.customer_instructions)
                    order by s.sort_order, s.name), '[]'::jsonb)
                 from public.services s where s.tenant_id = v.id and s.is_active),
    'offers', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', o.id, 'code', o.code, 'title', o.title, 'description', o.description, 'kind', o.kind,
                  'value', o.value, 'min_order', o.min_order, 'ends_at', o.ends_at, 'first_order_only', o.first_order_only,
                  'is_featured', o.is_featured) order by o.is_featured desc, o.sort_order, o.created_at), '[]'::jsonb)
               from public.tenant_offers o where o.tenant_id = v.id and o.is_active
                 and (o.starts_at is null or o.starts_at <= v_now) and (o.ends_at is null or o.ends_at > v_now)
                 and (o.max_redemptions is null or o.redeemed_count < o.max_redemptions))
  );
end $$;

drop function if exists public.quote_my_order(uuid, jsonb, text, text);
drop function if exists public.place_my_order(uuid, jsonb, text, uuid, uuid, timestamptz, timestamptz, text, text);
drop function if exists app.portal_quote(uuid, uuid, jsonb, text, text);

create or replace function app.portal_quote(p_tenant uuid, p_customer uuid, p_items jsonb, p_promo text, p_mode text,
                                            p_address uuid default null, p_express boolean default false, p_points int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_ps jsonb := app.portal_settings(p_tenant);
  v_ls jsonb := app.laundry_settings(p_tenant);
  v_item jsonb; v_svc record; v_qty numeric; v_line numeric;
  v_lines jsonb := '[]'::jsonb;
  v_sub numeric := 0; v_tax numeric := 0; v_fee numeric := 0; v_charge numeric := 0; v_disc numeric := 0; v_express numeric := 0;
  v_sub_disc numeric := 0; v_sub_kg numeric := 0; v_kg_left numeric := 0; v_points int := 0; v_points_disc numeric := 0;
  v_offer public.tenant_offers; v_code text := upper(nullif(btrim(coalesce(p_promo, '')), ''));
  v_promo_error text; v_now timestamptz := now(); v_per_kg boolean := false;
  v_zone_id uuid; v_zone_name text; v_zone_fee numeric; v_zone_min numeric; v_zone_active boolean; v_zone_error text; v_min numeric := (v_ps ->> 'min_order')::numeric;
  v_subs record; v_balance int;
begin
  if p_mode not in ('pickup_delivery', 'drop_off') then raise exception 'Choose pickup & delivery or drop-off' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one service' using errcode = '22023'; end if;
  if jsonb_array_length(p_items) > 30 then raise exception 'Too many items in one order' using errcode = '22023'; end if;

  select cs.id, p.included_kg, p.free_delivery, p.name, cs.current_period_start into v_subs
    from public.customer_subscriptions cs join public.subscription_plans p on p.id = cs.plan_id
    where cs.customer_id = p_customer and cs.status = 'active' and cs.current_period_end > v_now limit 1;
  if v_subs.id is not null then
    v_kg_left := greatest(v_subs.included_kg - coalesce((select sum(subscription_kg) from public.orders where subscription_id = v_subs.id and cancelled_at is null
                                                          and created_at >= v_subs.current_period_start), 0), 0);
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select id, name, pricing_model, base_price, tax_rate into v_svc from public.services
      where id = (v_item ->> 'service_id')::uuid and tenant_id = p_tenant and is_active;
    if v_svc.id is null then raise exception 'A service in your basket is no longer available' using errcode = '22023'; end if;
    v_qty := round(coalesce((v_item ->> 'quantity')::numeric, 1), 1);
    if v_qty <= 0 or v_qty > 1000 then raise exception 'Check the quantities in your basket' using errcode = '22023'; end if;
    v_line := round(v_qty * v_svc.base_price, 2);
    v_sub := v_sub + v_line;
    v_tax := v_tax + round(v_line * v_svc.tax_rate / 100, 2);
    if v_svc.pricing_model = 'per_kg' then
      v_per_kg := true;
      if v_kg_left > 0 then
        v_sub_disc := v_sub_disc + round(least(v_qty, v_kg_left) * v_svc.base_price, 2);
        v_sub_kg := v_sub_kg + least(v_qty, v_kg_left);
        v_kg_left := v_kg_left - least(v_qty, v_kg_left);
      end if;
    end if;
    v_lines := v_lines || jsonb_build_object('service_id', v_svc.id, 'name', v_svc.name, 'pricing_model', v_svc.pricing_model,
                                            'quantity', v_qty, 'unit_price', v_svc.base_price, 'tax_rate', v_svc.tax_rate, 'line_total', v_line);
  end loop;

  if p_mode = 'pickup_delivery' then
    v_fee := (v_ps ->> 'delivery_fee')::numeric;
    if p_address is not null then
      select z.id, z.name, z.delivery_fee, z.min_order, z.is_active into v_zone_id, v_zone_name, v_zone_fee, v_zone_min, v_zone_active
        from public.customer_addresses a left join public.service_zones z on z.id = a.zone_id
        where a.id = p_address and a.customer_id = p_customer;
      if v_zone_id is not null and v_zone_active then
        v_fee := v_zone_fee; v_min := greatest(v_min, v_zone_min);
      elsif exists (select 1 from public.service_zones where tenant_id = p_tenant and is_active) then
        v_zone_error := 'Choose your area for this address. We only collect in our service areas.';
      end if;
    end if;
    if v_subs.id is not null and v_subs.free_delivery then v_fee := 0; end if;
  end if;
  v_charge := round(v_sub * (v_ps ->> 'service_charge_pct')::numeric / 100, 2);
  if p_express and (v_ps ->> 'express_enabled')::boolean then
    v_express := round(v_sub * (v_ps ->> 'express_surcharge_pct')::numeric / 100, 2);
  end if;

  if v_code is not null then
    select * into v_offer from public.tenant_offers where tenant_id = p_tenant and code = v_code;
    if v_offer.id is null or not v_offer.is_active then v_promo_error := 'That code is not valid';
    elsif v_offer.starts_at is not null and v_offer.starts_at > v_now then v_promo_error := 'That code is not active yet';
    elsif v_offer.ends_at is not null and v_offer.ends_at <= v_now then v_promo_error := 'That code has expired';
    elsif v_offer.max_redemptions is not null and v_offer.redeemed_count >= v_offer.max_redemptions then v_promo_error := 'That code has been fully used';
    elsif v_sub < v_offer.min_order then v_promo_error := 'Spend at least ' || to_char(v_offer.min_order, 'FM999,999,990.00') || ' to use this code';
    elsif v_offer.first_order_only and exists (select 1 from public.orders where customer_id = p_customer and cancelled_at is null) then
      v_promo_error := 'This code is for your first order only';
    elsif v_offer.once_per_customer and exists (select 1 from public.orders where customer_id = p_customer and promo_code = v_code and cancelled_at is null) then
      v_promo_error := 'You have already used this code';
    elsif v_offer.kind = 'free_delivery' and v_fee = 0 then v_promo_error := 'This code gives free collection & delivery';
    else
      v_disc := case v_offer.kind when 'percent' then round(v_sub * v_offer.value / 100, 2) when 'fixed' then least(v_offer.value, v_sub) else v_fee end;
    end if;
  end if;

  if coalesce(p_points, 0) > 0 and (v_ls ->> 'loyalty_enabled')::boolean then
    select loyalty_points into v_balance from public.customers where id = p_customer;
    v_points := least(p_points, coalesce(v_balance, 0));
    if v_points < (v_ls ->> 'min_redeem')::int then v_points := 0;
    else
      v_points_disc := least(round(v_points * (v_ls ->> 'point_value')::numeric, 2), greatest(v_sub + v_tax + v_fee + v_charge + v_express - v_disc - v_sub_disc, 0));
      v_points := ceil(v_points_disc / nullif((v_ls ->> 'point_value')::numeric, 0))::int;
    end if;
  end if;

  return jsonb_build_object(
    'lines', v_lines, 'subtotal', v_sub, 'tax', v_tax, 'delivery_fee', v_fee, 'service_fee', v_charge, 'express_fee', v_express,
    'discount', v_disc, 'promo_code', case when v_disc > 0 then v_code end, 'promo_error', v_promo_error,
    'promo_title', case when v_disc > 0 then v_offer.title end,
    'subscription_discount', v_sub_disc, 'subscription_kg', v_sub_kg, 'subscription_id', v_subs.id, 'subscription_name', v_subs.name,
    'points_used', v_points, 'points_discount', v_points_disc,
    'zone_id', v_zone_id, 'zone_name', v_zone_name, 'zone_error', v_zone_error,
    'is_estimate', v_per_kg,
    'total', greatest(v_sub + v_tax + v_fee + v_charge + v_express - v_disc - v_sub_disc - v_points_disc, 0),
    'min_order', v_min, 'below_minimum', v_sub < v_min,
    'currency', (select currency from public.tenants where id = p_tenant));
end $$;

create or replace function public.quote_my_order(p_tenant uuid, p_items jsonb, p_promo text default null, p_mode text default 'pickup_delivery',
                                                p_address uuid default null, p_express boolean default false, p_points int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_customer uuid := app.my_customer_id(p_tenant);
begin
  if v_customer is null then raise exception 'Sign in as a customer of this business' using errcode = '42501'; end if;
  return app.portal_quote(p_tenant, v_customer, p_items, p_promo, p_mode, p_address, p_express, p_points);
end $$;

create or replace function public.place_my_order(
  p_tenant uuid, p_items jsonb, p_mode text,
  p_pickup_address uuid default null, p_delivery_address uuid default null,
  p_pickup_at timestamptz default null, p_delivery_at timestamptz default null,
  p_promo text default null, p_notes text default null,
  p_express boolean default false, p_points int default 0
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_customer record; v_t public.tenants; v_ps jsonb; v_q jsonb; v_line jsonb;
  v_branch uuid; v_wf uuid; v_stage uuid; v_order uuid := gen_random_uuid(); v_number text;
  v_pick text; v_drop text; v_hours int; v_cap int; v_booked int;
begin
  select * into v_t from public.tenants where id = p_tenant;
  select * into v_customer from public.customers where tenant_id = p_tenant and user_id = auth.uid() and archived_at is null;
  if v_customer.id is null then raise exception 'Sign in as a customer of this business' using errcode = '42501'; end if;
  if v_t.status in ('suspended', 'cancelled') then raise exception '% is not taking orders right now', v_t.name using errcode = '22023'; end if;
  v_ps := app.portal_settings(p_tenant);
  if p_mode = 'pickup_delivery' and not (v_ps ->> 'pickup_enabled')::boolean then raise exception 'This business does not offer pickup & delivery' using errcode = '22023'; end if;
  if p_mode = 'drop_off' and not (v_ps ->> 'drop_off_enabled')::boolean then raise exception 'This business does not accept drop-offs' using errcode = '22023'; end if;

  v_q := app.portal_quote(p_tenant, v_customer.id, p_items, p_promo, p_mode, p_pickup_address, p_express, p_points);
  if v_q ->> 'promo_error' is not null then raise exception '%', v_q ->> 'promo_error' using errcode = '22023'; end if;
  if v_q ->> 'zone_error' is not null then raise exception '%', v_q ->> 'zone_error' using errcode = '22023'; end if;
  if (v_q ->> 'below_minimum')::boolean then
    raise exception 'The minimum order is %', to_char((v_q ->> 'min_order')::numeric, 'FM999,999,990.00') using errcode = '22023';
  end if;

  if p_mode = 'pickup_delivery' then
    if p_pickup_address is null then raise exception 'Choose a collection address' using errcode = '22023'; end if;
    if p_pickup_at is null or p_delivery_at is null then raise exception 'Choose collection and delivery times' using errcode = '22023'; end if;
    if p_pickup_at < now() + make_interval(hours => (v_ps ->> 'pickup_lead_hours')::int) - interval '5 minutes' then
      raise exception 'Collection must be at least % hours from now', v_ps ->> 'pickup_lead_hours' using errcode = '22023';
    end if;
    v_hours := case when p_express and (v_ps ->> 'express_enabled')::boolean then (v_ps ->> 'express_hours')::int else (v_ps ->> 'standard_hours')::int end;
    if p_delivery_at < p_pickup_at + make_interval(hours => greatest(v_hours, 2)) - interval '5 minutes' then
      raise exception 'Delivery needs at least % hours after collection', greatest(v_hours, 2) using errcode = '22023';
    end if;
    v_cap := (v_ps ->> 'slot_capacity')::int;
    if v_cap > 0 then
      select count(*) into v_booked from public.delivery_jobs where tenant_id = p_tenant and kind = 'pickup' and status not in ('failed', 'cancelled') and scheduled_start = p_pickup_at;
      if v_booked >= v_cap then raise exception 'That collection slot is full. Choose another time.' using errcode = '23P01'; end if;
    end if;
    select concat_ws(', ', a.label || ': ' || a.line1, a.line2, a.city, a.state) || coalesce(' (near ' || a.landmark || ')', '') into v_pick
      from public.customer_addresses a where a.id = p_pickup_address and a.customer_id = v_customer.id;
    if v_pick is null then raise exception 'Collection address not found' using errcode = '22023'; end if;
    select concat_ws(', ', a.label || ': ' || a.line1, a.line2, a.city, a.state) || coalesce(' (near ' || a.landmark || ')', '') into v_drop
      from public.customer_addresses a where a.id = coalesce(p_delivery_address, p_pickup_address) and a.customer_id = v_customer.id;
    if v_drop is null then raise exception 'Delivery address not found' using errcode = '22023'; end if;
  elsif p_pickup_at is not null and p_pickup_at < now() - interval '1 hour' then
    raise exception 'Choose a drop-off time in the future' using errcode = '22023';
  end if;

  v_branch := coalesce((select b.id from public.branches b where b.id = v_customer.home_branch_id and b.is_active),
                       (select b.id from public.branches b where b.tenant_id = p_tenant and b.is_active order by b.created_at limit 1));
  if v_branch is null then raise exception 'This business is not set up to take orders yet' using errcode = '22023'; end if;
  select w.id into v_wf from public.workflows w where w.tenant_id = p_tenant and w.applies_to = 'order' and w.is_default;
  select s.id into v_stage from public.workflow_stages s where s.workflow_id = v_wf order by s.is_initial desc, s.position limit 1;
  if v_stage is null then raise exception 'This business is not set up to take orders yet' using errcode = '22023'; end if;

  perform set_config('clena.trusted_write', 'on', true);
  v_number := 'ORD-' || lpad(app.next_counter(p_tenant, 'order')::text, 5, '0');
  -- items first are not possible (FK), so insert order, then items, then notify via trigger already fired with items missing:
  -- the after-insert trigger reads items, so insert items inside the same statement window using a deferred approach below.
  insert into public.orders (id, tenant_id, branch_id, customer_id, order_number, workflow_id, current_stage_id, currency,
                             notes, source, created_by, pickup_required, delivery_required,
                             pickup_address, delivery_address, pickup_at, expected_at, promo_code,
                             subtotal, tax_total, delivery_fee, service_fee, express_fee, is_express, discount_total, total,
                             points_redeemed, subscription_id, subscription_kg, zone_id)
  values (v_order, p_tenant, v_branch, v_customer.id, v_number, v_wf, v_stage, v_t.currency,
          nullif(left(btrim(coalesce(p_notes, '')), 1000), ''), 'portal', auth.uid(),
          p_mode = 'pickup_delivery', p_mode = 'pickup_delivery', v_pick, v_drop, p_pickup_at,
          case when p_mode = 'pickup_delivery' then p_delivery_at end, v_q ->> 'promo_code',
          (v_q ->> 'subtotal')::numeric, (v_q ->> 'tax')::numeric, (v_q ->> 'delivery_fee')::numeric,
          (v_q ->> 'service_fee')::numeric, (v_q ->> 'express_fee')::numeric, coalesce(p_express, false) and (v_q ->> 'express_fee')::numeric > 0,
          (v_q ->> 'discount')::numeric + (v_q ->> 'subscription_discount')::numeric + (v_q ->> 'points_discount')::numeric,
          (v_q ->> 'total')::numeric, (v_q ->> 'points_used')::int, (v_q ->> 'subscription_id')::uuid, (v_q ->> 'subscription_kg')::numeric,
          (v_q ->> 'zone_id')::uuid);
  for v_line in select * from jsonb_array_elements(v_q -> 'lines') loop
    insert into public.order_items (tenant_id, order_id, service_id, description, pricing_model, quantity, unit_price, tax_rate, line_total)
    values (p_tenant, v_order, (v_line ->> 'service_id')::uuid, v_line ->> 'name', (v_line ->> 'pricing_model')::public.pricing_model,
            (v_line ->> 'quantity')::numeric, (v_line ->> 'unit_price')::numeric, (v_line ->> 'tax_rate')::numeric, (v_line ->> 'line_total')::numeric);
  end loop;
  -- job summaries need the items, which exist only now
  update public.delivery_jobs set items_summary = (select string_agg(description || ' ×' || trim(to_char(quantity, 'FM999990.##')), ', ') from public.order_items where order_id = v_order)
    where order_id = v_order;
  if v_q ->> 'promo_code' is not null then
    update public.tenant_offers set redeemed_count = redeemed_count + 1 where tenant_id = p_tenant and code = v_q ->> 'promo_code';
  end if;
  if (v_q ->> 'points_used')::int > 0 then
    perform app.add_points(p_tenant, v_customer.id, -((v_q ->> 'points_used')::int), 'redemption', v_order, 'Redeemed on ' || v_number);
  end if;
  perform set_config('clena.trusted_write', 'off', true);
  return jsonb_build_object('id', v_order, 'order_number', v_number, 'total', (v_q ->> 'total')::numeric);
end $$;

-- Cancelling also returns redeemed points.
create or replace function public.cancel_my_order(p_order uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  select o.id, o.tenant_id, o.customer_id, o.cancelled_at, o.amount_paid, o.promo_code, o.points_redeemed, s.is_initial, s.key,
         s.position = (select min(position) from public.workflow_stages x where x.workflow_id = o.workflow_id) as first_stage
    into v from public.orders o join public.workflow_stages s on s.id = o.current_stage_id
    where o.id = p_order and app.is_customer_self(o.tenant_id, o.customer_id);
  if v.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if v.cancelled_at is not null then return; end if;
  if not (v.is_initial or v.first_stage or v.key = 'pickup_assigned') or v.amount_paid > 0 then
    raise exception 'This order is already being processed. Chat with the business to change it.' using errcode = '22023';
  end if;
  perform set_config('clena.trusted_write', 'on', true);
  update public.orders set cancelled_at = now(), cancel_reason = coalesce(nullif(left(btrim(coalesce(p_reason, '')), 300), ''), 'Cancelled by customer') where id = p_order;
  update public.delivery_jobs set status = 'cancelled' where order_id = p_order and status in ('unassigned', 'assigned', 'en_route');
  if v.promo_code is not null then
    update public.tenant_offers set redeemed_count = greatest(redeemed_count - 1, 0) where tenant_id = v.tenant_id and code = v.promo_code;
  end if;
  perform set_config('clena.trusted_write', 'off', true);
  if v.points_redeemed > 0 then perform app.add_points(v.tenant_id, v.customer_id, v.points_redeemed, 'reversal', p_order, 'Order cancelled'); end if;
end $$;

-- Joining records who referred the customer and gives them their own referral code.
drop function if exists public.join_business(text, text, text);
create or replace function app.new_referral_code(p_tenant uuid, p_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_base text := upper(left(regexp_replace(coalesce(p_name, ''), '[^A-Za-z]', '', 'g'), 5)); v_code text; i int := 0;
begin
  if char_length(v_base) < 3 then v_base := 'CLEAN'; end if;
  loop
    v_code := v_base || lpad((floor(random() * 1000))::int::text, 3, '0');
    exit when not exists (select 1 from public.customers where tenant_id = p_tenant and referral_code = v_code);
    i := i + 1; if i > 20 then v_code := v_base || upper(substr(md5(random()::text), 1, 5)); exit; end if;
  end loop;
  return v_code;
end $$;

create or replace function public.join_business(p_slug text, p_full_name text default null, p_phone text default null, p_ref text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_t public.tenants; v_user record; v_existing record; v_id uuid; v_name text; v_referrer uuid;
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
begin
  if v_uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into v_t from public.tenants where slug = lower(btrim(p_slug));
  if v_t.id is null then raise exception 'Business not found' using errcode = 'P0002'; end if;
  if v_t.status in ('suspended', 'cancelled') then raise exception '% is not taking new customers right now', v_t.name using errcode = '22023'; end if;
  select c.id, c.tenant_id, t.name as tenant_name into v_existing from public.customers c join public.tenants t on t.id = c.tenant_id where c.user_id = v_uid;
  if v_existing.id is not null then
    if v_existing.tenant_id = v_t.id then return v_existing.id; end if;
    raise exception 'This account is registered with %. Use a different email address to join %.', v_existing.tenant_name, v_t.name using errcode = '42501';
  end if;
  if exists (select 1 from public.tenant_members m where m.user_id = v_uid) then
    raise exception 'This is a business staff account. Use a different email address to sign up as a customer.' using errcode = '42501';
  end if;
  select u.email, u.email_confirmed_at, u.raw_user_meta_data into v_user from auth.users u where u.id = v_uid;
  v_name := coalesce(nullif(btrim(p_full_name), ''), nullif(v_user.raw_user_meta_data ->> 'full_name', ''), split_part(v_user.email, '@', 1));
  v_phone := coalesce(v_phone, nullif(regexp_replace(coalesce(v_user.raw_user_meta_data ->> 'phone', ''), '[^0-9+]', '', 'g'), ''));
  select id into v_referrer from public.customers where tenant_id = v_t.id
    and referral_code = upper(btrim(coalesce(nullif(p_ref, ''), v_user.raw_user_meta_data ->> 'ref', '')));
  perform set_config('clena.trusted_write', 'on', true);
  if v_user.email_confirmed_at is not null then
    select id into v_id from public.customers where tenant_id = v_t.id and user_id is null and archived_at is null and lower(email) = lower(v_user.email)
      order by created_at limit 1;
  end if;
  if v_id is not null then
    update public.customers set user_id = v_uid, referral_code = coalesce(referral_code, app.new_referral_code(v_t.id, v_name)) where id = v_id;
  else
    if not coalesce((v_t.settings -> 'portal' ->> 'signup_enabled')::boolean, true) then
      perform set_config('clena.trusted_write', 'off', true);
      raise exception '% is not accepting new sign-ups. Ask them to add you as a customer.', v_t.name using errcode = '42501';
    end if;
    if v_phone is not null and exists (select 1 from public.customers where tenant_id = v_t.id and phone = v_phone) then
      perform set_config('clena.trusted_write', 'off', true);
      raise exception 'This phone number is already registered with %. Contact them to link your account.', v_t.name using errcode = '23505';
    end if;
    insert into public.customers (tenant_id, user_id, full_name, phone, email, created_by, home_branch_id, referral_code, referred_by)
    values (v_t.id, v_uid, left(v_name, 120), v_phone, lower(v_user.email), v_uid,
            (select id from public.branches where tenant_id = v_t.id and is_active order by created_at limit 1),
            app.new_referral_code(v_t.id, v_name), v_referrer)
    returning id into v_id;
  end if;
  perform set_config('clena.trusted_write', 'off', true);
  return v_id;
end $$;

create or replace function public.my_referral_code(p_tenant uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_c uuid := app.my_customer_id(p_tenant); v_code text;
begin
  if v_c is null then return null; end if;
  select referral_code into v_code from public.customers where id = v_c;
  if v_code is null then
    v_code := app.new_referral_code(p_tenant, (select full_name from public.customers where id = v_c));
    perform set_config('clena.trusted_write', 'on', true);
    update public.customers set referral_code = v_code where id = v_c;
    perform set_config('clena.trusted_write', 'off', true);
  end if;
  return v_code;
end $$;

-- ---------------------------------------------------------------------------
-- 27. Queues and KPIs
-- ---------------------------------------------------------------------------
create or replace function public.ops_queue_counts(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_tz text; v_day_start timestamptz; v_day_end timestamptz;
begin
  if not (app.has_permission(p_tenant, 'orders.view') or app.has_permission(p_tenant, 'logistics.manage')) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select timezone into v_tz from public.tenants where id = p_tenant;
  v_day_start := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_day_end := v_day_start + interval '1 day';
  return (
    with o as (
      select o.*, s.key as stage from public.orders o join public.workflow_stages s on s.id = o.current_stage_id
      where o.tenant_id = p_tenant and o.cancelled_at is null and not s.is_terminal
    )
    select jsonb_build_object(
      'pickups_today', (select count(*) from public.delivery_jobs j where j.tenant_id = p_tenant and j.kind = 'pickup' and j.status in ('unassigned', 'assigned', 'en_route') and j.scheduled_start < v_day_end),
      'deliveries_today', (select count(*) from public.delivery_jobs j where j.tenant_id = p_tenant and j.kind = 'delivery' and j.status in ('unassigned', 'assigned', 'en_route') and j.scheduled_start < v_day_end),
      'unassigned_jobs', (select count(*) from public.delivery_jobs j where j.tenant_id = p_tenant and j.status = 'unassigned'),
      'failed_jobs', (select count(*) from public.delivery_jobs j where j.tenant_id = p_tenant and j.status = 'failed'
                        and not exists (select 1 from public.delivery_jobs n where n.order_id = j.order_id and n.kind = j.kind and n.attempt > j.attempt)),
      'awaiting_receiving', (select count(*) from o where stage in ('picked_up') or (stage = 'pickup_requested' and not pickup_required)),
      'sorting', (select count(*) from o where stage in ('received', 'sorting')),
      'processing', (select count(*) from o where stage in ('processing', 'drying', 'finishing')),
      'quality', (select count(*) from o where stage = 'quality_check'),
      'ready', (select count(*) from o where stage = 'ready'),
      'out_for_delivery', (select count(*) from o where stage = 'out_for_delivery'),
      'exceptions', (select count(*) from o where on_hold or (expected_at < now())
                       or exists (select 1 from public.incidents i where i.order_id = o.id and i.status <> 'resolved')),
      'open_incidents', (select count(*) from public.incidents i where i.tenant_id = p_tenant and i.status <> 'resolved'),
      'overdue', (select count(*) from o where expected_at < now()),
      'pending_approvals', (select count(*) from public.order_adjustments a where a.tenant_id = p_tenant and a.status = 'pending_approval'),
      'at_partner', (select count(*) from public.partner_batches b where b.tenant_id = p_tenant and b.status = 'sent')
    )
  );
end $$;

create or replace function public.ops_kpis(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_days numeric := greatest(extract(epoch from p_to - p_from) / 86400, 1); s jsonb := app.laundry_settings(p_tenant);
begin
  if not app.has_permission(p_tenant, 'reports.view') then raise exception 'You do not have permission to view reports' using errcode = '42501'; end if;
  return (
    with o as (select * from public.orders where tenant_id = p_tenant and cancelled_at is null and created_at between p_from and p_to),
    pay as (select p.* from public.payments p where p.tenant_id = p_tenant and p.status = 'successful' and p.created_at between p_from and p_to),
    ref as (select r.* from public.refunds r where r.tenant_id = p_tenant and r.created_at between p_from and p_to),
    jobs as (select * from public.delivery_jobs where tenant_id = p_tenant and coalesce(completed_at, scheduled_start, created_at) between p_from and p_to),
    cust as (select customer_id, count(*) n from o group by customer_id),
    prior as (select distinct customer_id from public.orders where tenant_id = p_tenant and cancelled_at is null and created_at < p_from),
    turn as (
      select o.id, extract(epoch from (o.delivered_at - coalesce(
        (select min(h.created_at) from public.order_status_history h join public.workflow_stages st on st.id = h.to_stage_id where h.order_id = o.id and st.key = 'received'),
        o.created_at))) / 3600 as hours
      from public.orders o where o.tenant_id = p_tenant and o.delivered_at between p_from and p_to
    ),
    qc as (select * from public.quality_checks where tenant_id = p_tenant and created_at between p_from and p_to),
    inc as (select * from public.incidents where tenant_id = p_tenant and created_at between p_from and p_to),
    subs as (select * from public.customer_subscriptions where tenant_id = p_tenant)
    select jsonb_build_object(
      'orders', (select count(*) from o),
      'orders_per_day', round((select count(*) from o) / v_days, 1),
      'revenue', (select coalesce(sum(amount), 0) from pay) - (select coalesce(sum(amount), 0) from ref),
      'revenue_per_day', round(((select coalesce(sum(amount), 0) from pay) - (select coalesce(sum(amount), 0) from ref)) / v_days, 2),
      'refunds', (select coalesce(sum(amount), 0) from ref),
      'avg_order_value', (select round(coalesce(avg(total), 0), 2) from o),
      'customers', (select count(*) from cust),
      'repeat_customers', (select count(*) from cust where n > 1 or customer_id in (select customer_id from prior)),
      'customer_retention_pct', (select round(100.0 * count(*) filter (where customer_id in (select customer_id from prior)) / nullif(count(*), 0), 1) from cust),
      'active_subscriptions', (select count(*) from subs where status = 'active' and current_period_end > now()),
      'subscription_retention_pct', (select round(100.0 * count(*) filter (where status = 'active' and current_period_end > now()) / nullif(count(*) filter (where status <> 'pending_payment'), 0), 1) from subs),
      'pickup_success_pct', (select round(100.0 * count(*) filter (where status = 'completed') / nullif(count(*) filter (where status in ('completed', 'failed')), 0), 1) from jobs where kind = 'pickup'),
      'delivery_success_pct', (select round(100.0 * count(*) filter (where status = 'completed') / nullif(count(*) filter (where status in ('completed', 'failed')), 0), 1) from jobs where kind = 'delivery'),
      'avg_turnaround_hours', (select round(avg(hours)::numeric, 1) from turn),
      'overdue_rate_pct', (select round(100.0 * count(*) filter (where (delivered_at is null and expected_at < now()) or delivered_at > expected_at) / nullif(count(*) filter (where expected_at is not null), 0), 1) from o),
      'rework_or_complaint_pct', round(100.0 * ((select count(*) from qc where not passed) + (select count(*) from inc where kind = 'quality_complaint')) / nullif((select count(*) from o), 0), 1),
      'missing_damaged_pct', round(100.0 * (select count(*) from inc where kind in ('missing_item', 'damaged_item')) / nullif((select count(*) from o), 0), 2),
      'incidents', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (select kind, count(*) n from inc group by kind) x),
      'customer_lifetime_value', (select round(coalesce(avg(t), 0), 2) from (select sum(total) t from public.orders where tenant_id = p_tenant and cancelled_at is null group by customer_id) x),
      'new_customers', (select count(*) from public.customers where tenant_id = p_tenant and created_at between p_from and p_to),
      'customer_acquisition_cost', case when (s ->> 'marketing_spend_month') is not null then
          round((s ->> 'marketing_spend_month')::numeric * (v_days / 30) / nullif((select count(*) from public.customers where tenant_id = p_tenant and created_at between p_from and p_to), 0), 2) end,
      'gross_margin_per_order', case when (s ->> 'processing_cost_per_kg') is not null or (s ->> 'delivery_cost_per_job') is not null then
          round(((select coalesce(sum(total), 0) from o)
            - coalesce((s ->> 'processing_cost_per_kg')::numeric, 0) * (select coalesce(sum(coalesce(received_weight_kg, 0)), 0) from o)
            - coalesce((s ->> 'delivery_cost_per_job')::numeric, 0) * (select count(*) from jobs where status = 'completed'))
            / nullif((select count(*) from o), 0), 2) end,
      'drivers', (select coalesce(jsonb_agg(d order by d.completed desc), '[]'::jsonb) from (
          select j.driver_member_id as member_id,
                 coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email) as name,
                 count(*) filter (where j.status = 'completed') as completed,
                 count(*) filter (where j.status = 'failed') as failed,
                 count(*) filter (where j.status in ('assigned', 'en_route')) as open,
                 round(100.0 * count(*) filter (where j.status = 'completed') / nullif(count(*) filter (where j.status in ('completed', 'failed')), 0), 1) as completion_pct
          from jobs j join public.tenant_members m on m.id = j.driver_member_id join auth.users u on u.id = m.user_id
          group by j.driver_member_id, u.raw_user_meta_data, u.email) d),
      'partners', (select coalesce(jsonb_agg(p), '[]'::jsonb) from (
          select pp.name, count(b.id) as batches,
                 round(avg(extract(epoch from b.returned_at - b.sent_at) / 3600)::numeric, 1) as avg_hours,
                 count(*) filter (where b.returned_at > b.expected_back_at) as late,
                 count(*) filter (where b.status = 'sent') as out_now
          from public.processing_partners pp left join public.partner_batches b on b.partner_id = pp.id and b.sent_at between p_from and p_to
          where pp.tenant_id = p_tenant group by pp.id, pp.name) p),
      'staff', (select coalesce(jsonb_agg(x order by x.moves desc), '[]'::jsonb) from (
          select min(coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email)) as name, count(*) as moves
          from public.order_status_history h join public.orders oo on oo.id = h.order_id join auth.users u on u.id = h.changed_by
          join public.tenant_members tm on tm.tenant_id = oo.tenant_id and tm.user_id = h.changed_by
          where oo.tenant_id = p_tenant and h.created_at between p_from and p_to group by u.id order by count(*) desc limit 20) x),
      'feedback_avg', (select round(avg(rating)::numeric, 2) from public.order_feedback where tenant_id = p_tenant and created_at between p_from and p_to),
      'feedback_count', (select count(*) from public.order_feedback where tenant_id = p_tenant and created_at between p_from and p_to)
    )
  );
end $$;

-- ---------------------------------------------------------------------------
-- 28. Daily automation (called by the scheduled job with the service key)
-- ---------------------------------------------------------------------------
create or replace function public.run_daily_ops()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t record; r record; v_rem int := 0; v_late int := 0; v_ren int := 0; v_exp int := 0;
begin
  for t in select tm.tenant_id, te.slug from public.tenant_modules tm join public.tenants te on te.id = tm.tenant_id
           where tm.module_key = 'laundry_ops' and te.status in ('active', 'trial') loop
    -- service reminders
    for r in select i.* from app.insights_core(t.tenant_id) i
             where i.predicted_next_at is not null and i.predicted_next_at <= now() + interval '1 day' and not i.has_active_order
               and i.segment <> 'prospect'
               and not exists (select 1 from public.customer_notifications n where n.customer_id = i.customer_id and n.trigger = 'service_reminder' and n.created_at > now() - interval '7 days') loop
      perform app.notify_customer(t.tenant_id, r.customer_id, null, 'service_reminder', 'Time for a fresh pickup?',
        'It''s been a while since your last order. Book a pickup in a few taps.', '/b/' || t.slug || '/services');
      v_rem := v_rem + 1;
    end loop;
    -- late orders become exceptions
    for r in select o.id from public.orders o join public.workflow_stages s on s.id = o.current_stage_id
             where o.tenant_id = t.tenant_id and o.cancelled_at is null and not s.is_terminal and s.key not in ('delivered')
               and o.expected_at < now()
               and not exists (select 1 from public.incidents i where i.order_id = o.id and i.kind = 'delayed' and i.status <> 'resolved') loop
      insert into public.incidents (tenant_id, order_id, kind, severity, source, description)
      values (t.tenant_id, r.id, 'delayed', 'medium', 'system', 'Past its due time and not yet delivered');
      perform app.notify_order(r.id, 'order_delayed');
      v_late := v_late + 1;
    end loop;
    -- subscription renewals and expiry
    for r in select cs.* from public.customer_subscriptions cs where cs.tenant_id = t.tenant_id and cs.status = 'active'
             and cs.current_period_end between now() and now() + interval '3 days'
             and not exists (select 1 from public.customer_notifications n where n.customer_id = cs.customer_id and n.trigger = 'subscription_renewal' and n.created_at > now() - interval '5 days') loop
      perform app.notify_customer(t.tenant_id, r.customer_id, null, 'subscription_renewal', 'Your plan renews soon',
        'Your subscription ends on ' || to_char(r.current_period_end, 'DD Mon') || '. Renew to keep your benefits.', '/b/' || t.slug || '/subscriptions');
      v_ren := v_ren + 1;
    end loop;
    update public.customer_subscriptions set status = 'expired', updated_at = now()
      where tenant_id = t.tenant_id and status = 'active' and current_period_end < now();
    get diagnostics v_exp = row_count;
  end loop;
  return jsonb_build_object('reminders', v_rem, 'late_orders', v_late, 'renewal_notices', v_ren, 'expired', v_exp);
end $$;

-- ---------------------------------------------------------------------------
-- 29. Installer: switches a business to the laundry lifecycle, roles and defaults
-- ---------------------------------------------------------------------------
create or replace function app.install_laundry_ops(p_tenant uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_wf uuid; v_stage record; v_target record; v_keep uuid; v_alias text; v_pos int := 0; v_role uuid; v_r record;
  v_mgr text[] := array['owner', 'manager', 'ops_manager', 'supervisor'];
begin
  insert into public.tenant_modules (tenant_id, module_key) values (p_tenant, 'laundry_ops') on conflict do nothing;
  perform set_config('clena.trusted_write', 'on', true);
  perform set_config('clena.demo_load', 'on', true);

  -- roles (spec section 24)
  for v_r in select * from (values
      ('ops_manager', 'Operations Manager', array['dashboard.view','customers.view','customers.manage','services.view','orders.view','orders.manage','orders.update_status',
        'bookings.view','bookings.manage','logistics.view','logistics.manage','staff.view','reports.view','ops.receive','ops.sort','ops.process','ops.qc','incidents.manage','support.manage']),
      ('front_desk', 'Front Desk', array['dashboard.view','customers.view','customers.manage','services.view','orders.view','orders.manage','orders.update_status',
        'bookings.view','bookings.manage','ops.receive','support.manage','payments.view','payments.record']),
      ('sorting_staff', 'Sorting Staff', array['orders.view','orders.update_status','services.view','ops.receive','ops.sort']),
      ('processing_staff', 'Processing Staff', array['orders.view','orders.update_status','services.view','ops.process']),
      ('quality_control', 'Quality Control', array['orders.view','orders.update_status','services.view','ops.qc','incidents.manage']),
      ('finance', 'Finance', array['dashboard.view','customers.view','orders.view','payments.view','payments.record','invoices.view','invoices.manage','expenses.manage','reports.view','subscriptions.manage']),
      ('support', 'Support', array['customers.view','customers.manage','orders.view','bookings.view','support.manage','incidents.manage'])
    ) x(key, name, perms) loop
    insert into public.roles (tenant_id, key, name, is_system) values (p_tenant, v_r.key, v_r.name, false)
      on conflict (tenant_id, key) do update set name = excluded.name returning id into v_role;
    insert into public.role_permissions (tenant_id, role_id, permission_key) select p_tenant, v_role, unnest(v_r.perms) on conflict do nothing;
  end loop;

  -- lifecycle (spec: Order Lifecycle). Existing stages are kept and renamed so no history is lost.
  select id into v_wf from public.workflows where tenant_id = p_tenant and applies_to = 'order' and is_default;
  update public.workflow_stages set position = position + 1000 where workflow_id = v_wf;
  for v_target in select * from (values
      ('pickup_requested', 'Pickup Requested', '#94A3B8', true, true, false, array['owner','manager','ops_manager','supervisor','front_desk'], array[]::text[]),
      ('pickup_assigned', 'Pickup Assigned', '#64748B', true, false, false, array['owner','manager','ops_manager','supervisor','front_desk'], array[]::text[]),
      ('picked_up', 'Picked Up', '#6366F1', true, false, false, array['owner','manager','ops_manager','supervisor','driver'], array[]::text[]),
      ('received', 'Received', '#475569', true, false, false, array['owner','manager','ops_manager','supervisor','front_desk','sorting_staff','staff'], array[]::text[]),
      ('sorting', 'Sorting', '#8B5CF6', false, false, false, array['owner','manager','ops_manager','supervisor','front_desk','sorting_staff','staff'], array[]::text[]),
      ('processing', 'Processing', '#0EA5E9', true, false, false, array['owner','manager','ops_manager','supervisor','sorting_staff','processing_staff','quality_control','staff'], array['washing']),
      ('drying', 'Drying', '#06B6D4', false, false, false, array['owner','manager','ops_manager','supervisor','processing_staff','staff'], array[]::text[]),
      ('finishing', 'Ironing and Folding', '#14B8A6', true, false, false, array['owner','manager','ops_manager','supervisor','processing_staff','staff'], array['ironing', 'folding']),
      ('quality_check', 'Quality Check', '#F59E0B', true, false, false, array['owner','manager','ops_manager','supervisor','processing_staff','quality_control','staff'], array[]::text[]),
      ('ready', 'Ready', '#12C08A', true, false, false, array['owner','manager','ops_manager','supervisor','quality_control'], array[]::text[]),
      ('out_for_delivery', 'Out for Delivery', '#1E88A8', true, false, false, array['owner','manager','ops_manager','supervisor','driver'], array[]::text[]),
      ('delivered', 'Delivered', '#0B3B5C', true, false, false, array['owner','manager','ops_manager','supervisor','driver','front_desk'], array[]::text[]),
      ('completed', 'Completed', '#0B1B33', true, false, true, array['owner','manager','ops_manager','supervisor','front_desk','finance'], array[]::text[])
    ) x(key, name, color, visible, initial, terminal, roles, aliases) loop
    v_pos := v_pos + 1;
    v_keep := app.stage_id(v_wf, v_target.key);
    foreach v_alias in array v_target.aliases loop
      if v_keep is null then
        v_keep := app.stage_id(v_wf, v_alias);
      elsif app.stage_id(v_wf, v_alias) is not null then
        update public.orders set current_stage_id = v_keep where current_stage_id = app.stage_id(v_wf, v_alias);
        update public.order_status_history set to_stage_id = v_keep where to_stage_id = app.stage_id(v_wf, v_alias);
        update public.order_status_history set from_stage_id = v_keep where from_stage_id = app.stage_id(v_wf, v_alias);
        delete from public.workflow_stages where id = app.stage_id(v_wf, v_alias);
      end if;
    end loop;
    if v_keep is null then
      insert into public.workflow_stages (tenant_id, workflow_id, key, name, color, position, is_initial, is_terminal, customer_visible, allowed_roles)
      values (p_tenant, v_wf, v_target.key, v_target.name, v_target.color, v_pos, v_target.initial, v_target.terminal, v_target.visible, v_target.roles);
    else
      update public.workflow_stages set key = v_target.key, name = v_target.name, color = v_target.color, position = v_pos,
        is_initial = v_target.initial, is_terminal = v_target.terminal, customer_visible = v_target.visible, allowed_roles = v_target.roles
      where id = v_keep;
    end if;
  end loop;
  -- any custom stages the business added stay, placed before Completed
  for v_stage in select id from public.workflow_stages where workflow_id = v_wf and position >= 1000 order by position loop
    v_pos := v_pos + 1;
    update public.workflow_stages set position = v_pos, is_initial = false, is_terminal = false where id = v_stage.id;
  end loop;
  update public.workflow_stages set position = v_pos + 1 where workflow_id = v_wf and key = 'completed';

  -- previously "delivered" orders were closed; they are now Completed
  update public.orders o set current_stage_id = app.stage_id(v_wf, 'completed'), delivered_at = coalesce(o.delivered_at, o.completed_at, o.updated_at)
    where o.tenant_id = p_tenant and o.current_stage_id = app.stage_id(v_wf, 'delivered') and o.completed_at is not null;
  -- orders past sorting get their counts from their lines; released ones get a QC record
  update public.orders o set
      received_weight_kg = coalesce(o.received_weight_kg, (select sum(quantity) from public.order_items i where i.order_id = o.id and i.pricing_model = 'per_kg')),
      received_item_count = coalesce(o.received_item_count, (select sum(quantity)::int from public.order_items i where i.order_id = o.id and i.pricing_model <> 'per_kg'))
    where o.tenant_id = p_tenant and (select position from public.workflow_stages s where s.id = o.current_stage_id) > app.stage_pos(v_wf, 'sorting');
  insert into public.quality_checks (tenant_id, order_id, checklist, passed, notes, inspector, created_at)
    select p_tenant, o.id, '{"identity":true,"count_weight":true,"stains_damage":true,"process_complete":true,"cleanliness":true,"finishing":true,"tags_present":true,"exceptions_recorded":true}'::jsonb,
           true, 'Recorded at module installation', null, coalesce(o.completed_at, o.updated_at)
    from public.orders o where o.tenant_id = p_tenant and (select position from public.workflow_stages s where s.id = o.current_stage_id) >= app.stage_pos(v_wf, 'ready')
      and not exists (select 1 from public.quality_checks q where q.order_id = o.id);

  -- sensible defaults for a Lagos laundry (all editable in settings)
  update public.tenants set settings = settings
    || jsonb_build_object('portal', coalesce(settings -> 'portal', '{}'::jsonb) || jsonb_build_object(
         'express_enabled', coalesce((settings -> 'portal' ->> 'express_enabled')::boolean, true),
         'express_surcharge_pct', coalesce((settings -> 'portal' ->> 'express_surcharge_pct')::numeric, 50),
         'express_hours', coalesce((settings -> 'portal' ->> 'express_hours')::int, 24),
         'standard_hours', coalesce((settings -> 'portal' ->> 'standard_hours')::int, 48),
         'slot_capacity', coalesce((settings -> 'portal' ->> 'slot_capacity')::int, 6),
         'pickup_lead_hours', coalesce((settings -> 'portal' ->> 'pickup_lead_hours')::int, 2),
         'faqs', coalesce(settings -> 'portal' -> 'faqs', '[
            {"q":"How is the price worked out?","a":"Per-kg services are estimated from what you enter and confirmed after we weigh and inspect your items. If the final price is higher, we ask you to approve it in the app first."},
            {"q":"How long does it take?","a":"Standard orders are delivered within 48 hours of collection. Express orders within 24 hours, for a surcharge."},
            {"q":"What if an item is damaged or missing?","a":"Report it from the order screen with a photo. Every item is tagged and tracked, and our team investigates and replies within one working day."},
            {"q":"Can I change my pickup time?","a":"Yes. Chat with us from the Support screen and we will reschedule."},
            {"q":"How do I pay?","a":"Pay on collection or delivery by cash, card or transfer. Your order page shows our bank details."}]'::jsonb)))
    || jsonb_build_object('ops', coalesce(settings -> 'ops', '{}'::jsonb) || '{"qc_required": true, "weigh_before_processing": true, "auto_complete_when_paid": true}'::jsonb)
    || jsonb_build_object('loyalty', coalesce(settings -> 'loyalty', '{"enabled": true, "points_per_100": 1, "point_value": 1, "min_redeem": 200, "referral_points": 500, "referee_points": 300, "milestone_every": 10, "milestone_points": 1000}'::jsonb))
  where id = p_tenant;

  insert into public.service_zones (tenant_id, name, areas, delivery_fee, min_order, sort_order) values
    (p_tenant, 'Lekki & Ajah', 'Lekki Phase 1, Ikate, Chevron, Osapa, Agungi, Ajah, Sangotedo', 1500, 0, 1),
    (p_tenant, 'Victoria Island & Ikoyi', 'Victoria Island, Oniru, Ikoyi, Banana Island', 2000, 0, 2),
    (p_tenant, 'Mainland', 'Yaba, Surulere, Ikeja, GRA, Maryland, Gbagada, Magodo, Ogudu', 2500, 10000, 3)
  on conflict (tenant_id, name) do nothing;
  if not exists (select 1 from public.subscription_plans where tenant_id = p_tenant) then
    insert into public.subscription_plans (tenant_id, name, description, price, period_days, included_kg, free_delivery, sort_order) values
      (p_tenant, 'Solo', 'For one person: about one bag a week.', 25000, 30, 20, true, 1),
      (p_tenant, 'Family', 'For a busy household: weekly pickups.', 55000, 30, 50, true, 2),
      (p_tenant, 'Corporate', 'Uniforms and linen for small teams.', 120000, 30, 120, true, 3);
  end if;
  perform set_config('clena.demo_load', 'off', true);
  perform set_config('clena.trusted_write', 'off', true);
end $$;

-- Clena team switches the module on or off for a business.
create or replace function public.platform_set_module(p_tenant uuid, p_module text, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app.has_platform_permission('tenants.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_module <> 'laundry_ops' then raise exception 'Unknown module' using errcode = '22023'; end if;
  if p_enabled then perform app.install_laundry_ops(p_tenant);
  else delete from public.tenant_modules where tenant_id = p_tenant and module_key = p_module; end if;
  perform app.audit(p_tenant, case when p_enabled then 'module.enabled' else 'module.disabled' end, 'tenant', p_tenant, jsonb_build_object('module', p_module));
end $$;

-- ---------------------------------------------------------------------------
-- 30. Triggers that depend on the functions above
-- ---------------------------------------------------------------------------
drop trigger if exists orders_laundry_after_stage on public.orders;
create trigger orders_laundry_after_stage after update of current_stage_id on public.orders
  for each row execute function app.laundry_after_stage();
drop trigger if exists orders_laundry_after_payment on public.orders;
create trigger orders_laundry_after_payment after update of payment_status on public.orders
  for each row execute function app.laundry_after_payment();

-- ---------------------------------------------------------------------------
-- 31. Grants (explicit; new Supabase projects expose nothing by default)
-- ---------------------------------------------------------------------------
grant select on public.tenant_modules, public.service_zones, public.ops_media, public.bags, public.order_bags, public.order_garments,
  public.delivery_jobs, public.driver_status, public.incidents, public.quality_checks, public.order_adjustments, public.refunds,
  public.customer_notifications, public.order_feedback, public.loyalty_ledger, public.subscription_plans, public.customer_subscriptions,
  public.processing_partners, public.partner_batches, public.partner_batch_orders, public.ops_checklist_marks to authenticated;
grant insert, update, delete on public.service_zones, public.subscription_plans, public.processing_partners, public.ops_checklist_marks to authenticated;
grant insert on public.ops_media to authenticated;
grant update on public.delivery_jobs to authenticated;
grant select, insert, update, delete on public.tenant_modules, public.service_zones, public.ops_media, public.bags, public.order_bags, public.order_garments,
  public.delivery_jobs, public.job_secrets, public.driver_status, public.incidents, public.quality_checks, public.order_adjustments, public.refunds,
  public.customer_notifications, public.order_feedback, public.loyalty_ledger, public.subscription_plans, public.customer_subscriptions,
  public.processing_partners, public.partner_batches, public.partner_batch_orders, public.ops_checklist_marks to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'public.find_by_reference(uuid, text)', 'public.attach_bag(uuid, text)', 'public.release_bag(uuid, text)',
    'public.record_count_weight(uuid, integer, numeric, jsonb)', 'public.request_adjustment(uuid, text, numeric, text)',
    'public.decide_adjustment(uuid, boolean, text)', 'public.add_garment(uuid, text, text, text, text, text, text)', 'public.remove_garment(uuid)',
    'public.submit_quality_check(uuid, jsonb, text)', 'public.create_incident(uuid, uuid, text, text, text, boolean, text[])',
    'public.update_incident(uuid, text, text, uuid, boolean)', 'public.report_my_issue(uuid, text, text, text[])',
    'public.refund_payment(uuid, numeric, text, text, text)', 'public.assign_job(uuid, uuid)', 'public.reschedule_job(uuid, timestamptz, text)',
    'public.set_my_availability(uuid, boolean)', 'public.driver_start_job(uuid)', 'public.driver_complete_pickup(uuid, text[], integer, text, text)',
    'public.driver_complete_delivery(uuid, text, text, text, text, text)', 'public.driver_fail_job(uuid, text, text)', 'public.my_delivery_otp(uuid)',
    'public.send_to_partner(uuid, uuid[], timestamptz, text)', 'public.receive_partner_batch(uuid, text)', 'public.adjust_points(uuid, integer, text)',
    'public.submit_feedback(uuid, integer, text)', 'public.mark_notifications_read(uuid)', 'public.subscribe_to_plan(uuid, uuid)',
    'public.cancel_my_subscription(uuid)', 'public.activate_subscription(uuid, text, text)', 'public.customer_insights(uuid, uuid)',
    'public.my_service_reminder(uuid)', 'public.slot_availability(uuid, integer)', 'public.ops_queue_counts(uuid)', 'public.ops_kpis(uuid, timestamptz, timestamptz)',
    'public.quote_my_order(uuid, jsonb, text, text, uuid, boolean, integer)',
    'public.place_my_order(uuid, jsonb, text, uuid, uuid, timestamptz, timestamptz, text, text, boolean, integer)',
    'public.cancel_my_order(uuid, text)', 'public.join_business(text, text, text, text)', 'public.my_referral_code(uuid)', 'public.platform_set_module(uuid, text, boolean)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
revoke all on function public.public_business(text) from public;
grant execute on function public.public_business(text) to anon, authenticated, service_role;
revoke all on function public.run_daily_ops() from public, anon, authenticated;
grant execute on function public.run_daily_ops() to service_role;

revoke all on function app.has_module(uuid, text), app.audit(uuid, text, text, uuid, jsonb), app.stage_key(uuid), app.stage_id(uuid, text),
  app.stage_pos(uuid, text), app.system_move(uuid, text, text), app.laundry_settings(uuid), app.notify_customer(uuid, uuid, uuid, text, text, text, text),
  app.notify_order(uuid, text, text), app.can_ops(uuid), app.order_tenant(uuid), app.recompute_order(uuid), app.apply_adjustment(uuid, text),
  app.my_job(uuid), app.add_points(uuid, uuid, integer, text, uuid, text), app.award_completion(uuid), app.insights_core(uuid),
  app.portal_quote(uuid, uuid, jsonb, text, text, uuid, boolean, integer), app.new_referral_code(uuid, text), app.install_laundry_ops(uuid),
  app.portal_settings(uuid), app.refresh_order_payment(uuid) from public;
grant execute on function app.has_module(uuid, text), app.stage_key(uuid), app.can_ops(uuid) to anon, authenticated, service_role;
grant execute on function app.laundry_order_defaults(), app.laundry_after_insert(), app.laundry_stage_guard(), app.laundry_after_stage(),
  app.laundry_after_payment(), app.guard_order_delete(), app.job_make_secret() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 32. Switch it on for D'WashGuy (only)
-- ---------------------------------------------------------------------------
do $$
declare v uuid;
begin
  select id into v from public.tenants where slug = 'dwashguy';
  if v is not null then perform app.install_laundry_ops(v); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 33. Staff notes on an order (internal, never shown to customers)
-- ---------------------------------------------------------------------------
create table if not exists public.order_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade
);
create index if not exists order_notes_order_idx on public.order_notes (order_id, created_at);
alter table public.order_notes enable row level security;
drop policy if exists order_notes_select on public.order_notes;
create policy order_notes_select on public.order_notes for select to authenticated using (app.has_permission(tenant_id, 'orders.view'));
drop policy if exists order_notes_insert on public.order_notes;
create policy order_notes_insert on public.order_notes for insert to authenticated
  with check (created_by = auth.uid() and app.can_ops(tenant_id));
grant select, insert on public.order_notes to authenticated;
grant select, insert, update, delete on public.order_notes to service_role;

-- ---------------------------------------------------------------------------
-- 34. Customer laundry preferences (shown to staff on every order)
-- ---------------------------------------------------------------------------
create or replace function public.update_my_preferences(p_tenant uuid, p_prefs jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid := app.my_customer_id(p_tenant); v_clean jsonb := '{}'::jsonb; k text;
begin
  if v_id is null then raise exception 'Sign in as a customer of this business' using errcode = '42501'; end if;
  foreach k in array array['starch', 'fragrance', 'finish', 'detergent', 'preferred_time', 'preferred_day', 'other'] loop
    if p_prefs ? k and nullif(btrim(p_prefs ->> k), '') is not null then
      v_clean := v_clean || jsonb_build_object(k, left(btrim(p_prefs ->> k), 120));
    end if;
  end loop;
  perform set_config('clena.trusted_write', 'on', true);
  update public.customers set preferences = (preferences - array['starch', 'fragrance', 'finish', 'detergent', 'preferred_time', 'preferred_day', 'other']) || v_clean where id = v_id;
  perform set_config('clena.trusted_write', 'off', true);
end $$;
revoke all on function public.update_my_preferences(uuid, jsonb) from public;
grant execute on function public.update_my_preferences(uuid, jsonb) to authenticated, service_role;
