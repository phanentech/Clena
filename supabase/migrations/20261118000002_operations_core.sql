-- =============================================================================
-- Clena — Core operations: services, workflows, customers, orders, bookings, payments
-- =============================================================================

create type public.pricing_model as enum (
  'fixed', 'per_item', 'per_kg', 'per_vehicle', 'per_room', 'per_hour', 'per_sqm', 'quote'
);
create type public.payment_status as enum ('unpaid', 'partially_paid', 'paid', 'refunded');
create type public.payment_method as enum ('cash', 'bank_transfer', 'manual', 'pos', 'paystack', 'flutterwave');
create type public.transaction_status as enum ('pending', 'successful', 'failed', 'refunded');
create type public.booking_status as enum ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');

-- Only owners (settings.manage) may assign the owner role to someone.
create or replace function app.guard_owner_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null
     and coalesce(current_setting('clena.trusted_write', true), 'off') <> 'on'
     and exists (select 1 from public.roles where id = new.role_id and key = 'owner')
     and (tg_op = 'INSERT' or new.role_id is distinct from old.role_id)
     and not app.has_permission(new.tenant_id, 'settings.manage') then
    raise exception 'Only an owner can grant the owner role' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger tenant_members_owner_assignment before insert or update on public.tenant_members
  for each row execute function app.guard_owner_assignment();

-- ---------------------------------------------------------------------------
-- Per-tenant counters (order numbers, invoice numbers, ...)
-- ---------------------------------------------------------------------------
create table public.tenant_counters (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  value bigint not null default 0,
  primary key (tenant_id, name)
);
alter table public.tenant_counters enable row level security;
-- no policies: only accessed through app.next_counter()

create or replace function app.next_counter(p_tenant uuid, p_name text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if auth.uid() is not null and not app.is_member(p_tenant) then
    raise exception 'Not a member of this business' using errcode = '42501';
  end if;
  insert into public.tenant_counters (tenant_id, name, value) values (p_tenant, p_name, 1)
  on conflict (tenant_id, name) do update set value = public.tenant_counters.value + 1
  returning value into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Services
-- ---------------------------------------------------------------------------
create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name),
  unique (tenant_id, id)
);
create trigger service_categories_touch before update on public.service_categories
  for each row execute function app.touch_updated_at();

create table public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  category_id uuid,
  name text not null check (char_length(name) between 2 and 120),
  description text,
  image_path text,
  pricing_model public.pricing_model not null default 'fixed',
  base_price numeric(12, 2) not null default 0 check (base_price >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  duration_minutes int check (duration_minutes is null or duration_minutes > 0),
  staff_required int not null default 1 check (staff_required >= 0),
  customer_instructions text,
  internal_instructions text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, category_id) references public.service_categories (tenant_id, id) on delete set null (category_id)
);
create index services_tenant_idx on public.services (tenant_id, is_active);
create trigger services_touch before update on public.services
  for each row execute function app.touch_updated_at();

-- Empty = available at every branch
create table public.service_branches (
  tenant_id uuid not null,
  service_id uuid not null,
  branch_id uuid not null,
  price_override numeric(12, 2) check (price_override is null or price_override >= 0),
  primary key (service_id, branch_id),
  foreign key (tenant_id, service_id) references public.services (tenant_id, id) on delete cascade,
  foreign key (tenant_id, branch_id) references public.branches (tenant_id, id) on delete cascade
);

create table public.service_addons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  service_id uuid not null,
  name text not null,
  price numeric(12, 2) not null default 0 check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, service_id) references public.services (tenant_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Workflows (configurable per tenant; never hard-coded in the frontend)
-- ---------------------------------------------------------------------------
create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  applies_to text not null default 'order' check (applies_to in ('order', 'booking')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index workflows_one_default on public.workflows (tenant_id, applies_to) where is_default;
create trigger workflows_touch before update on public.workflows
  for each row execute function app.touch_updated_at();

create table public.workflow_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  workflow_id uuid not null,
  key text not null,
  name text not null,
  color text not null default '#64748B' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position int not null,
  is_initial boolean not null default false,
  is_terminal boolean not null default false,
  customer_visible boolean not null default true,
  requires_approval boolean not null default false,
  required_fields jsonb not null default '[]'::jsonb,
  -- role keys allowed to move an order INTO this stage; empty = anyone with orders.update_status
  allowed_roles text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_id, key),
  unique (tenant_id, id),
  foreign key (tenant_id, workflow_id) references public.workflows (tenant_id, id) on delete cascade
);
create index workflow_stages_workflow_idx on public.workflow_stages (workflow_id, position);
create trigger workflow_stages_touch before update on public.workflow_stages
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Customers (CRM). user_id links a customer-portal login; one person can be a
-- customer of many tenants with separate records.
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text,
  email text,
  customer_type text not null default 'individual' check (customer_type in ('individual', 'business')),
  company_name text,
  tags text[] not null default '{}',
  preferences jsonb not null default '{}'::jsonb,
  notes text,
  marketing_opt_in boolean not null default false,
  whatsapp_opt_in boolean not null default false,
  sms_opt_in boolean not null default false,
  email_opt_in boolean not null default true,
  loyalty_points int not null default 0,
  home_branch_id uuid,
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, home_branch_id) references public.branches (tenant_id, id) on delete set null (home_branch_id)
);
create unique index customers_tenant_phone_uq on public.customers (tenant_id, phone) where phone is not null;
create unique index customers_tenant_user_uq on public.customers (tenant_id, user_id) where user_id is not null;
create index customers_tenant_created_idx on public.customers (tenant_id, created_at desc);
create index customers_search_idx on public.customers using gin (to_tsvector('simple', coalesce(full_name, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(email, '')));
create trigger customers_touch before update on public.customers
  for each row execute function app.touch_updated_at();

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid not null,
  label text not null default 'Home',
  line1 text not null,
  line2 text,
  city text,
  state text,
  country text,
  landmark text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete cascade
);
create index customer_addresses_customer_idx on public.customer_addresses (customer_id);
create trigger customer_addresses_touch before update on public.customer_addresses
  for each row execute function app.touch_updated_at();

create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid not null,
  body text not null check (char_length(body) between 1 and 4000),
  author_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete cascade
);
create index customer_notes_customer_idx on public.customer_notes (customer_id, created_at desc);

-- Is the current user the portal login for this customer?
create or replace function app.is_customer_self(p_tenant uuid, p_customer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.customers c
    where c.id = p_customer and c.tenant_id = p_tenant and c.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  branch_id uuid not null,
  customer_id uuid not null,
  order_number text not null,
  workflow_id uuid not null,
  current_stage_id uuid not null,
  payment_status public.payment_status not null default 'unpaid',
  currency text not null,
  subtotal numeric(12, 2) not null default 0,
  discount_total numeric(12, 2) not null default 0 check (discount_total >= 0),
  tax_total numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  amount_paid numeric(12, 2) not null default 0,
  assigned_member_id uuid,
  expected_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  notes text,
  source text not null default 'staff' check (source in ('staff', 'portal', 'booking', 'api', 'whatsapp')),
  booking_id uuid,
  pickup_required boolean not null default false,
  delivery_required boolean not null default false,
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, order_number),
  unique (tenant_id, id),
  foreign key (tenant_id, branch_id) references public.branches (tenant_id, id),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id),
  foreign key (tenant_id, workflow_id) references public.workflows (tenant_id, id),
  foreign key (tenant_id, current_stage_id) references public.workflow_stages (tenant_id, id),
  foreign key (tenant_id, assigned_member_id) references public.tenant_members (tenant_id, id) on delete set null (assigned_member_id)
);
create index orders_tenant_created_idx on public.orders (tenant_id, created_at desc);
create index orders_tenant_branch_idx on public.orders (tenant_id, branch_id, created_at desc);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_stage_idx on public.orders (current_stage_id);
create trigger orders_touch before update on public.orders
  for each row execute function app.touch_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  service_id uuid,
  description text not null,
  pricing_model public.pricing_model not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  tax_rate numeric(5, 2) not null default 0,
  line_total numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade,
  foreign key (tenant_id, service_id) references public.services (tenant_id, id) on delete set null (service_id)
);
create index order_items_order_idx on public.order_items (order_id);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  from_stage_id uuid,
  to_stage_id uuid not null,
  changed_by uuid references auth.users (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

create table public.order_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  storage_path text not null,
  kind text not null default 'photo' check (kind in ('photo', 'document', 'signature')),
  caption text,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade,
  check (split_part(storage_path, '/', 1) = tenant_id::text)
);

-- Status history is written by a trigger, never by clients.
create or replace function app.record_order_stage_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_terminal boolean;
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (tenant_id, order_id, from_stage_id, to_stage_id, changed_by, note)
    values (new.tenant_id, new.id, null, new.current_stage_id, auth.uid(), 'Order created');
  elsif new.current_stage_id is distinct from old.current_stage_id then
    -- stage must belong to the order's workflow
    if not exists (select 1 from public.workflow_stages s
                   where s.id = new.current_stage_id and s.workflow_id = new.workflow_id) then
      raise exception 'Stage does not belong to this order''s workflow' using errcode = '22023';
    end if;
    insert into public.order_status_history (tenant_id, order_id, from_stage_id, to_stage_id, changed_by, note)
    values (new.tenant_id, new.id, old.current_stage_id, new.current_stage_id, auth.uid(),
            nullif(current_setting('clena.stage_note', true), ''));
    select is_terminal into v_terminal from public.workflow_stages where id = new.current_stage_id;
    if v_terminal and new.completed_at is null then
      new.completed_at := now();
    elsif not v_terminal then
      new.completed_at := null;
    end if;
  end if;
  return new;
end $$;
create trigger orders_stage_history_ins after insert on public.orders
  for each row execute function app.record_order_stage_change();
create trigger orders_stage_history_upd before update of current_stage_id on public.orders
  for each row execute function app.record_order_stage_change();

-- Money columns on orders are maintained by the server (create_order / payment triggers).
-- Block direct edits from ordinary clients.
create or replace function app.guard_order_money()
returns trigger language plpgsql as $$
begin
  if current_setting('clena.trusted_write', true) = 'on' or auth.uid() is null then
    return new;
  end if;
  if new.subtotal is distinct from old.subtotal or new.tax_total is distinct from old.tax_total
     or new.total is distinct from old.total or new.amount_paid is distinct from old.amount_paid
     or new.payment_status is distinct from old.payment_status
     or new.tenant_id is distinct from old.tenant_id or new.order_number is distinct from old.order_number
     or new.customer_id is distinct from old.customer_id then
    raise exception 'Order totals, payment state and identity cannot be edited directly'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger orders_guard_money before update on public.orders
  for each row execute function app.guard_order_money();

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  branch_id uuid not null,
  customer_id uuid not null,
  service_id uuid not null,
  booking_number text not null,
  status public.booking_status not null default 'pending',
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  address_id uuid,
  location_text text,
  special_instructions text,
  details jsonb not null default '{}'::jsonb,
  assigned_member_id uuid,
  quoted_total numeric(12, 2),
  currency text not null,
  source text not null default 'staff' check (source in ('staff', 'portal', 'api', 'whatsapp')),
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start),
  unique (tenant_id, booking_number),
  unique (tenant_id, id),
  foreign key (tenant_id, branch_id) references public.branches (tenant_id, id),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id),
  foreign key (tenant_id, service_id) references public.services (tenant_id, id),
  foreign key (tenant_id, address_id) references public.customer_addresses (tenant_id, id) on delete set null (address_id),
  foreign key (tenant_id, assigned_member_id) references public.tenant_members (tenant_id, id) on delete set null (assigned_member_id)
);
create index bookings_tenant_start_idx on public.bookings (tenant_id, scheduled_start);
create index bookings_customer_idx on public.bookings (customer_id);
create trigger bookings_touch before update on public.bookings
  for each row execute function app.touch_updated_at();

alter table public.orders
  add foreign key (tenant_id, booking_id) references public.bookings (tenant_id, id) on delete set null (booking_id);

-- ---------------------------------------------------------------------------
-- Payments (ledger of transactions). Online payments are only inserted/updated
-- by the server after provider verification (service role); staff can record
-- offline payments.
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  order_id uuid,
  customer_id uuid,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null,
  method public.payment_method not null,
  status public.transaction_status not null default 'pending',
  provider text,
  provider_reference text,
  reference text not null,
  note text,
  verified_at timestamptz,
  provider_response jsonb,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, reference),
  unique (tenant_id, id),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete set null (order_id),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete set null (customer_id)
);
create unique index payments_provider_ref_uq on public.payments (provider, provider_reference)
  where provider_reference is not null;
create index payments_tenant_created_idx on public.payments (tenant_id, created_at desc);
create index payments_order_idx on public.payments (order_id);
create trigger payments_touch before update on public.payments
  for each row execute function app.touch_updated_at();

-- Recalculate an order's paid amount and payment status from successful payments.
create or replace function app.refresh_order_payment(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_paid numeric(12, 2); v_total numeric(12, 2); v_refunded boolean;
begin
  if p_order is null then return; end if;
  select coalesce(sum(amount) filter (where status = 'successful'), 0),
         bool_or(status = 'refunded')
    into v_paid, v_refunded
    from public.payments where order_id = p_order;
  select total into v_total from public.orders where id = p_order;
  perform set_config('clena.trusted_write', 'on', true);
  update public.orders set
    amount_paid = v_paid,
    payment_status = case
      when v_paid = 0 and coalesce(v_refunded, false) then 'refunded'::public.payment_status
      when v_paid = 0 then 'unpaid'::public.payment_status
      when v_paid < v_total then 'partially_paid'::public.payment_status
      else 'paid'::public.payment_status end
  where id = p_order;
  perform set_config('clena.trusted_write', 'off', true);
end $$;

create or replace function app.on_payment_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app.refresh_order_payment(coalesce(new.order_id, old.order_id));
  if tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    perform app.refresh_order_payment(old.order_id);
  end if;
  return coalesce(new, old);
end $$;
create trigger payments_refresh_order after insert or update or delete on public.payments
  for each row execute function app.on_payment_change();

-- Ordinary clients may only record OFFLINE payments, and never mark online ones successful.
create or replace function app.guard_payment_write()
returns trigger language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;  -- service role / server-verified path
  if new.method in ('paystack', 'flutterwave') then
    raise exception 'Online payments are recorded only after server-side provider verification'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.amount <> old.amount or new.method <> old.method or new.tenant_id <> old.tenant_id) then
    raise exception 'Payment amount and method cannot be edited; record a refund or a new payment'
      using errcode = '42501';
  end if;
  new.recorded_by := coalesce(new.recorded_by, auth.uid());
  if tg_op = 'INSERT' and new.status = 'successful' then
    new.verified_at := now();
  end if;
  return new;
end $$;
create trigger payments_guard before insert or update on public.payments
  for each row execute function app.guard_payment_write();

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.service_branches enable row level security;
alter table public.service_addons enable row level security;
alter table public.workflows enable row level security;
alter table public.workflow_stages enable row level security;
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.customer_notes enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.order_attachments enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;

-- Services: members with services.view read; services.manage writes.
-- Customers of a tenant can read that tenant's ACTIVE services (to book).
create policy service_categories_select on public.service_categories for select to authenticated
  using (app.has_permission(tenant_id, 'services.view')
         or exists (select 1 from public.customers c where c.tenant_id = service_categories.tenant_id and c.user_id = auth.uid()));
create policy service_categories_write on public.service_categories for all to authenticated
  using (app.has_permission(tenant_id, 'services.manage'))
  with check (app.has_permission(tenant_id, 'services.manage'));

create policy services_select on public.services for select to authenticated
  using (app.has_permission(tenant_id, 'services.view')
         or (is_active and exists (select 1 from public.customers c where c.tenant_id = services.tenant_id and c.user_id = auth.uid())));
create policy services_write on public.services for all to authenticated
  using (app.has_permission(tenant_id, 'services.manage'))
  with check (app.has_permission(tenant_id, 'services.manage'));

create policy service_branches_select on public.service_branches for select to authenticated
  using (app.is_member(tenant_id));
create policy service_branches_write on public.service_branches for all to authenticated
  using (app.has_permission(tenant_id, 'services.manage'))
  with check (app.has_permission(tenant_id, 'services.manage'));

create policy service_addons_select on public.service_addons for select to authenticated
  using (app.has_permission(tenant_id, 'services.view')
         or exists (select 1 from public.customers c where c.tenant_id = service_addons.tenant_id and c.user_id = auth.uid()));
create policy service_addons_write on public.service_addons for all to authenticated
  using (app.has_permission(tenant_id, 'services.manage'))
  with check (app.has_permission(tenant_id, 'services.manage'));

-- Workflows
create policy workflows_select on public.workflows for select to authenticated
  using (app.is_member(tenant_id));
create policy workflows_write on public.workflows for all to authenticated
  using (app.has_permission(tenant_id, 'workflows.manage'))
  with check (app.has_permission(tenant_id, 'workflows.manage'));

create policy workflow_stages_select on public.workflow_stages for select to authenticated
  using (app.is_member(tenant_id)
         or (customer_visible and exists (select 1 from public.customers c where c.tenant_id = workflow_stages.tenant_id and c.user_id = auth.uid())));
create policy workflow_stages_write on public.workflow_stages for all to authenticated
  using (app.has_permission(tenant_id, 'workflows.manage'))
  with check (app.has_permission(tenant_id, 'workflows.manage'));

-- Customers: staff with customers.view; the customer themself.
create policy customers_select on public.customers for select to authenticated
  using (app.has_permission(tenant_id, 'customers.view') or user_id = auth.uid());
create policy customers_insert on public.customers for insert to authenticated
  with check (app.has_permission(tenant_id, 'customers.manage'));
create policy customers_update on public.customers for update to authenticated
  using (app.has_permission(tenant_id, 'customers.manage'))
  with check (app.has_permission(tenant_id, 'customers.manage'));
create policy customers_delete on public.customers for delete to authenticated
  using (app.has_permission(tenant_id, 'settings.manage'));

create policy customer_addresses_select on public.customer_addresses for select to authenticated
  using (app.has_permission(tenant_id, 'customers.view') or app.is_customer_self(tenant_id, customer_id));
create policy customer_addresses_write on public.customer_addresses for all to authenticated
  using (app.has_permission(tenant_id, 'customers.manage') or app.is_customer_self(tenant_id, customer_id))
  with check (app.has_permission(tenant_id, 'customers.manage') or app.is_customer_self(tenant_id, customer_id));

create policy customer_notes_select on public.customer_notes for select to authenticated
  using (app.has_permission(tenant_id, 'customers.view'));
create policy customer_notes_insert on public.customer_notes for insert to authenticated
  with check (app.has_permission(tenant_id, 'customers.manage') and author_id = auth.uid());

-- Orders: orders.view + branch access; customer sees their own.
create policy orders_select on public.orders for select to authenticated
  using ((app.has_permission(tenant_id, 'orders.view') and app.can_access_branch(tenant_id, branch_id))
         or app.is_customer_self(tenant_id, customer_id));
create policy orders_insert on public.orders for insert to authenticated
  with check (app.has_permission(tenant_id, 'orders.manage') and app.can_access_branch(tenant_id, branch_id));
create policy orders_update on public.orders for update to authenticated
  using ((app.has_permission(tenant_id, 'orders.manage') or app.has_permission(tenant_id, 'orders.update_status'))
         and app.can_access_branch(tenant_id, branch_id))
  with check ((app.has_permission(tenant_id, 'orders.manage') or app.has_permission(tenant_id, 'orders.update_status'))
              and app.can_access_branch(tenant_id, branch_id));
create policy orders_delete on public.orders for delete to authenticated
  using (app.has_permission(tenant_id, 'settings.manage'));

-- Staff with only orders.update_status may change the stage / assignment / notes, nothing else.
create or replace function app.guard_order_status_only()
returns trigger language plpgsql as $$
begin
  if auth.uid() is null or current_setting('clena.trusted_write', true) = 'on' then return new; end if;
  if not app.has_permission(new.tenant_id, 'orders.manage') then
    if new.branch_id is distinct from old.branch_id or new.expected_at is distinct from old.expected_at
       or new.discount_total is distinct from old.discount_total or new.workflow_id is distinct from old.workflow_id
       or new.assigned_member_id is distinct from old.assigned_member_id then
      raise exception 'You can only update the status of this order' using errcode = '42501';
    end if;
  end if;
  -- stage-level role restrictions
  if new.current_stage_id is distinct from old.current_stage_id and exists (
       select 1 from public.workflow_stages s
       where s.id = new.current_stage_id and cardinality(s.allowed_roles) > 0
         and not (app.member_role_key(new.tenant_id) = any (s.allowed_roles))
     ) then
    raise exception 'Your role cannot move orders into this stage' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger orders_guard_status_only before update on public.orders
  for each row execute function app.guard_order_status_only();

create policy order_items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id));  -- inherits orders RLS
create policy order_items_write on public.order_items for all to authenticated
  using (app.has_permission(tenant_id, 'orders.manage'))
  with check (app.has_permission(tenant_id, 'orders.manage'));

create policy order_status_history_select on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_status_history.order_id));

create policy order_attachments_select on public.order_attachments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_attachments.order_id));
create policy order_attachments_insert on public.order_attachments for insert to authenticated
  with check ((app.has_permission(tenant_id, 'orders.manage') or app.has_permission(tenant_id, 'orders.update_status'))
              and uploaded_by = auth.uid());

-- Bookings
create policy bookings_select on public.bookings for select to authenticated
  using ((app.has_permission(tenant_id, 'bookings.view') and app.can_access_branch(tenant_id, branch_id))
         or app.is_customer_self(tenant_id, customer_id));
create policy bookings_write on public.bookings for all to authenticated
  using (app.has_permission(tenant_id, 'bookings.manage') and app.can_access_branch(tenant_id, branch_id))
  with check (app.has_permission(tenant_id, 'bookings.manage') and app.can_access_branch(tenant_id, branch_id));

-- Payments: finance roles only (drivers/staff without payments.view see nothing).
create policy payments_select on public.payments for select to authenticated
  using (app.has_permission(tenant_id, 'payments.view') or app.is_customer_self(tenant_id, customer_id));
create policy payments_insert on public.payments for insert to authenticated
  with check (app.has_permission(tenant_id, 'payments.record'));
create policy payments_update on public.payments for update to authenticated
  using (app.has_permission(tenant_id, 'payments.record'))
  with check (app.has_permission(tenant_id, 'payments.record'));

-- =============================================================================
-- RPCs
-- =============================================================================

-- Create an order. Prices come from the services table, never from the client.
-- SECURITY INVOKER: RLS applies to every read and write.
-- p_items: [{"service_id":"...","quantity":2,"description":"optional override"}]
create or replace function public.create_order(
  p_tenant uuid,
  p_branch uuid,
  p_customer uuid,
  p_items jsonb,
  p_notes text default null,
  p_expected_at timestamptz default null,
  p_discount numeric default 0
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_order uuid := gen_random_uuid();
  v_workflow uuid;
  v_stage uuid;
  v_currency text;
  v_item jsonb;
  v_svc record;
  v_qty numeric;
  v_line numeric;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_number text;
begin
  if not app.has_permission(p_tenant, 'orders.manage') then
    raise exception 'You do not have permission to create orders' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'An order needs at least one item' using errcode = '22023';
  end if;
  if p_discount < 0 then
    raise exception 'Discount cannot be negative' using errcode = '22023';
  end if;

  select currency into v_currency from public.tenants where id = p_tenant;
  select w.id into v_workflow from public.workflows w
    where w.tenant_id = p_tenant and w.applies_to = 'order' and w.is_default;
  if v_workflow is null then
    raise exception 'Set up an order workflow before creating orders' using errcode = '22023';
  end if;
  select s.id into v_stage from public.workflow_stages s
    where s.workflow_id = v_workflow order by s.is_initial desc, s.position asc limit 1;

  v_number := 'ORD-' || lpad(app.next_counter(p_tenant, 'order')::text, 5, '0');

  insert into public.orders (id, tenant_id, branch_id, customer_id, order_number, workflow_id,
                             current_stage_id, currency, notes, expected_at, created_by)
  values (v_order, p_tenant, p_branch, p_customer, v_number, v_workflow, v_stage, v_currency,
          p_notes, p_expected_at, auth.uid());

  for v_item in select * from jsonb_array_elements(p_items) loop
    select id, name, pricing_model, base_price, tax_rate into v_svc
      from public.services
      where id = (v_item ->> 'service_id')::uuid and tenant_id = p_tenant and is_active;
    if v_svc.id is null then
      raise exception 'Service not found or inactive' using errcode = '22023';
    end if;
    v_qty := coalesce((v_item ->> 'quantity')::numeric, 1);
    if v_qty <= 0 then
      raise exception 'Quantity must be greater than zero' using errcode = '22023';
    end if;
    -- branch price override if any
    select coalesce(sb.price_override, v_svc.base_price) into v_svc.base_price
      from (select 1) x
      left join public.service_branches sb on sb.service_id = v_svc.id and sb.branch_id = p_branch;
    v_line := round(v_qty * v_svc.base_price, 2);
    v_subtotal := v_subtotal + v_line;
    v_tax := v_tax + round(v_line * v_svc.tax_rate / 100, 2);
    insert into public.order_items (tenant_id, order_id, service_id, description, pricing_model,
                                    quantity, unit_price, tax_rate, line_total)
    values (p_tenant, v_order, v_svc.id, coalesce(nullif(v_item ->> 'description', ''), v_svc.name),
            v_svc.pricing_model, v_qty, v_svc.base_price, v_svc.tax_rate, v_line);
  end loop;

  if p_discount > v_subtotal then
    raise exception 'Discount cannot exceed the order subtotal' using errcode = '22023';
  end if;

  perform set_config('clena.trusted_write', 'on', true);
  update public.orders set
    subtotal = v_subtotal,
    discount_total = p_discount,
    tax_total = v_tax,
    total = v_subtotal - p_discount + v_tax
  where id = v_order;
  perform set_config('clena.trusted_write', 'off', true);

  return v_order;
end $$;

-- Move an order to another stage of its workflow, with an optional note.
create or replace function public.move_order_stage(p_order uuid, p_stage uuid, p_note text default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform set_config('clena.stage_note', coalesce(p_note, ''), true);
  update public.orders set current_stage_id = p_stage where id = p_order;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  perform set_config('clena.stage_note', '', true);
end $$;

-- Dashboard metrics computed from real rows. SECURITY INVOKER -> RLS scoped.
create or replace function public.dashboard_metrics(
  p_tenant uuid,
  p_branch uuid default null,
  p_from timestamptz default date_trunc('month', now()),
  p_to timestamptz default now()
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_tz text;
  v_today timestamptz;
  v_month timestamptz;
  v_result jsonb;
  v_can_money boolean := app.has_permission(p_tenant, 'payments.view');
begin
  if not app.has_permission(p_tenant, 'dashboard.view') then
    raise exception 'You do not have permission to view the dashboard' using errcode = '42501';
  end if;
  select timezone into v_tz from public.tenants where id = p_tenant;
  v_today := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_month := date_trunc('month', now() at time zone v_tz) at time zone v_tz;

  with o as (
    select o.*, s.is_terminal
    from public.orders o join public.workflow_stages s on s.id = o.current_stage_id
    where o.tenant_id = p_tenant and o.cancelled_at is null
      and (p_branch is null or o.branch_id = p_branch)
  ), p as (
    select py.* from public.payments py
    left join public.orders po on po.id = py.order_id
    where py.tenant_id = p_tenant and py.status = 'successful'
      and (p_branch is null or po.branch_id = p_branch)
  ), c as (
    select c.id, c.created_at,
           (select count(*) from public.orders x where x.customer_id = c.id and x.cancelled_at is null) as n
    from public.customers c where c.tenant_id = p_tenant and c.archived_at is null
  )
  select jsonb_build_object(
    'currency', (select currency from public.tenants where id = p_tenant),
    'revenue_today', case when v_can_money then (select coalesce(sum(amount), 0) from p where created_at >= v_today) end,
    'revenue_month', case when v_can_money then (select coalesce(sum(amount), 0) from p where created_at >= v_month) end,
    'revenue_period', case when v_can_money then (select coalesce(sum(amount), 0) from p where created_at between p_from and p_to) end,
    'orders_today', (select count(*) from o where created_at >= v_today),
    'orders_period', (select count(*) from o where created_at between p_from and p_to),
    'active_orders', (select count(*) from o where not is_terminal),
    'completed_orders', (select count(*) from o where is_terminal and completed_at between p_from and p_to),
    'overdue_orders', (select count(*) from o where not is_terminal and expected_at < now()),
    'pending_payments', case when v_can_money then (select coalesce(sum(total - amount_paid), 0) from o where payment_status in ('unpaid', 'partially_paid')) end,
    'pending_bookings', (select count(*) from public.bookings b where b.tenant_id = p_tenant and b.status = 'pending'
                           and (p_branch is null or b.branch_id = p_branch)),
    'new_customers', (select count(*) from c where created_at between p_from and p_to),
    'repeat_customers', (select count(*) from c where n > 1),
    'total_customers', (select count(*) from c),
    'stage_breakdown', (select coalesce(jsonb_agg(x order by x.position), '[]'::jsonb) from (
        select s.name, s.color, s.position, count(o.id) as count
        from public.workflow_stages s
        join public.workflows w on w.id = s.workflow_id and w.tenant_id = p_tenant and w.is_default and w.applies_to = 'order'
        left join o on o.current_stage_id = s.id
        group by s.id, s.name, s.color, s.position) x),
    'daily', (select coalesce(jsonb_agg(d order by d.day), '[]'::jsonb) from (
        select to_char(g.day, 'YYYY-MM-DD') as day,
               (select count(*) from o where (o.created_at at time zone v_tz)::date = g.day) as orders,
               case when v_can_money then (select coalesce(sum(amount), 0) from p where (p.created_at at time zone v_tz)::date = g.day) end as revenue
        from generate_series((p_from at time zone v_tz)::date, (p_to at time zone v_tz)::date, interval '1 day') as g(day)
      ) d),
    'top_services', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select oi.description as name, count(*) as orders,
               case when v_can_money then sum(oi.line_total) end as revenue
        from public.order_items oi join o on o.id = oi.order_id
        where o.created_at between p_from and p_to
        group by oi.description order by count(*) desc limit 5) t)
  ) into v_result;
  return v_result;
end $$;

grant execute on function public.create_order(uuid, uuid, uuid, jsonb, text, timestamptz, numeric) to authenticated;
grant execute on function public.move_order_stage(uuid, uuid, text) to authenticated;
grant execute on function public.dashboard_metrics(uuid, uuid, timestamptz, timestamptz) to authenticated;
revoke execute on function public.create_order(uuid, uuid, uuid, jsonb, text, timestamptz, numeric) from anon, public;
revoke execute on function public.move_order_stage(uuid, uuid, text) from anon, public;
revoke execute on function public.dashboard_metrics(uuid, uuid, timestamptz, timestamptz) from anon, public;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

-- Customers can read the basic profile of businesses they are a customer of (portal header, names).
create policy tenants_customer_select on public.tenants for select to authenticated
  using (exists (select 1 from public.customers c where c.tenant_id = tenants.id and c.user_id = auth.uid()));
