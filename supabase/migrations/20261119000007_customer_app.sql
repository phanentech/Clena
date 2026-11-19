-- =============================================================================
-- Clena: branded customer app.
--   * each business has a public link  /b/<slug>  for its own customers
--   * a customer login belongs to exactly ONE business (enforced here)
--   * customers order, track, chat and manage addresses; prices, fees and
--     promo codes are always computed on the server
--   * tighter guards on tenant and customer rows
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Guard: business owners may edit their profile, branding and settings, but
-- not status, plan, suspension or demo flags (those belong to the platform).
-- Also reserves slugs that would clash with app routes.
-- ---------------------------------------------------------------------------
create or replace function app.is_reserved_slug(p_slug text)
returns boolean language sql immutable set search_path = '' as $$
  select lower(p_slug) = any (array['app', 'api', 'auth', 'b', 'platform', 'onboarding', 'admin', 'www', 'clena',
    'support', 'help', 'customer', 'customers', 'driver', 'staff', 'suspended', 'pricing', 'features', 'industries',
    'contact', 'demo', 'login', 'signup', 'register', 'billing', 'settings', 'static', 'assets', 'mail', 'status'])
$$;

create or replace function app.guard_tenant_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if app.is_reserved_slug(new.slug) and (tg_op = 'INSERT' or new.slug is distinct from old.slug) then
    raise exception 'That web address is reserved. Choose another one.' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then return new; end if;
  if auth.uid() is null or current_setting('clena.trusted_write', true) = 'on' or app.is_platform_admin() then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.plan_id is distinct from old.plan_id
     or new.is_demo is distinct from old.is_demo
     or new.suspended_at is distinct from old.suspended_at
     or new.suspension_reason is distinct from old.suspension_reason
     or new.suspension_note is distinct from old.suspension_note
     or new.partner_id is distinct from old.partner_id
     or new.created_by is distinct from old.created_by then
    raise exception 'Only the Clena team can change the status or plan of a business' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists tenants_guard on public.tenants;
create trigger tenants_guard before insert or update on public.tenants
  for each row execute function app.guard_tenant_update();

-- ---------------------------------------------------------------------------
-- One business per customer login. Staff cannot attach a login to a record;
-- only join_business (or an operator in SQL) can.
-- ---------------------------------------------------------------------------
create unique index if not exists customers_one_business_per_login on public.customers (user_id) where user_id is not null;

create or replace function app.guard_customer_login_link()
returns trigger language plpgsql as $$
begin
  if auth.uid() is null or current_setting('clena.trusted_write', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' and new.user_id is not null then
    raise exception 'Customer logins are linked when the customer joins from your link' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id and new.user_id is not null then
    raise exception 'Customer logins are linked when the customer joins from your link' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists customers_guard_login on public.customers;
create trigger customers_guard_login before insert or update on public.customers
  for each row execute function app.guard_customer_login_link();

-- Order numbers: trusted server functions (customer orders) may draw numbers too.
create or replace function app.next_counter(p_tenant uuid, p_name text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if auth.uid() is not null and not app.is_member(p_tenant)
     and coalesce(current_setting('clena.trusted_write', true), '') <> 'on' then
    raise exception 'Not a member of this business' using errcode = '42501';
  end if;
  insert into public.tenant_counters (tenant_id, name, value) values (p_tenant, p_name, 1)
  on conflict (tenant_id, name) do update set value = public.tenant_counters.value + 1
  returning value into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Orders: collection / delivery details and fees
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists pickup_address text,
  add column if not exists delivery_address text,
  add column if not exists pickup_at timestamptz,
  add column if not exists promo_code text,
  add column if not exists delivery_fee numeric(12, 2) not null default 0 check (delivery_fee >= 0),
  add column if not exists service_fee numeric(12, 2) not null default 0 check (service_fee >= 0),
  add column if not exists cancel_reason text;

-- ---------------------------------------------------------------------------
-- Offers a business shows to its own customers (promo codes)
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,23}$'),
  title text not null check (char_length(title) between 2 and 60),
  description text check (description is null or char_length(description) <= 200),
  kind text not null check (kind in ('percent', 'fixed', 'free_delivery')),
  value numeric(12, 2) not null default 0 check (value >= 0),
  min_order numeric(12, 2) not null default 0 check (min_order >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions int check (max_redemptions is null or max_redemptions > 0),
  redeemed_count int not null default 0,
  first_order_only boolean not null default false,
  once_per_customer boolean not null default true,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  sort_order int not null default 0,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, id),
  check (kind <> 'percent' or value between 1 and 100),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
drop trigger if exists tenant_offers_touch on public.tenant_offers;
create trigger tenant_offers_touch before update on public.tenant_offers
  for each row execute function app.touch_updated_at();
alter table public.tenant_offers enable row level security;
drop policy if exists tenant_offers_select on public.tenant_offers;
create policy tenant_offers_select on public.tenant_offers for select to authenticated
  using (app.is_member(tenant_id)
         or (is_active and exists (select 1 from public.customers c where c.tenant_id = tenant_offers.tenant_id and c.user_id = auth.uid())));
drop policy if exists tenant_offers_write on public.tenant_offers;
create policy tenant_offers_write on public.tenant_offers for all to authenticated
  using (app.has_permission(tenant_id, 'settings.manage'))
  with check (app.has_permission(tenant_id, 'settings.manage'));

-- ---------------------------------------------------------------------------
-- Support chat between a customer and the business
-- ---------------------------------------------------------------------------
create table if not exists public.customer_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  order_id uuid,
  sender text not null check (sender in ('customer', 'business')),
  author_id uuid references auth.users (id) on delete set null default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete cascade,
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete set null (order_id)
);
create index if not exists customer_messages_thread_idx on public.customer_messages (tenant_id, customer_id, created_at);
alter table public.customer_messages enable row level security;
drop policy if exists customer_messages_select on public.customer_messages;
create policy customer_messages_select on public.customer_messages for select to authenticated
  using (app.has_permission(tenant_id, 'customers.view') or app.is_customer_self(tenant_id, customer_id));
drop policy if exists customer_messages_insert on public.customer_messages;
create policy customer_messages_insert on public.customer_messages for insert to authenticated
  with check (author_id = auth.uid() and (
    (sender = 'customer' and app.is_customer_self(tenant_id, customer_id))
    or (sender = 'business' and app.has_permission(tenant_id, 'customers.manage'))));

create or replace function app.guard_customer_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.order_id is not null and not exists (
    select 1 from public.orders o where o.id = new.order_id and o.customer_id = new.customer_id) then
    raise exception 'That order does not belong to this customer' using errcode = '22023';
  end if;
  new.body := btrim(new.body);
  new.read_at := null;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists customer_messages_guard on public.customer_messages;
create trigger customer_messages_guard before insert on public.customer_messages
  for each row execute function app.guard_customer_message();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app.my_customer_id(p_tenant uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.customers where tenant_id = p_tenant and user_id = auth.uid() and archived_at is null
$$;

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
    'drop_off_enabled', coalesce((t.settings -> 'portal' ->> 'drop_off_enabled')::boolean, true),
    'pickup_enabled', coalesce((t.settings -> 'portal' ->> 'pickup_enabled')::boolean, true),
    'support_phone', coalesce(t.settings -> 'portal' ->> 'support_phone', t.phone),
    'support_whatsapp', t.settings -> 'portal' ->> 'support_whatsapp',
    'support_email', coalesce(t.settings -> 'portal' ->> 'support_email', t.email),
    'bank_name', t.settings -> 'payments' ->> 'bank_name',
    'account_name', t.settings -> 'payments' ->> 'account_name',
    'account_number', t.settings -> 'payments' ->> 'account_number'
  ) from public.tenants t where t.id = p_tenant
$$;

-- ---------------------------------------------------------------------------
-- Public business profile for the branded app (safe for anonymous visitors)
-- ---------------------------------------------------------------------------
create or replace function public.public_business(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v public.tenants; v_now timestamptz := now();
begin
  select * into v from public.tenants where slug = lower(btrim(p_slug));
  if v.id is null then return null; end if;
  if v.status in ('suspended', 'cancelled') then
    return jsonb_build_object('id', v.id, 'slug', v.slug, 'name', v.name, 'available', false,
                              'branding', v.branding - 'receipt_footer');
  end if;
  return jsonb_build_object(
    'id', v.id, 'slug', v.slug, 'name', v.name, 'industry', v.industry, 'available', true,
    'currency', v.currency, 'country', v.country, 'timezone', v.timezone, 'address', v.address,
    'branding', v.branding - 'receipt_footer',
    'portal', app.portal_settings(v.id) - 'bank_name' - 'account_name' - 'account_number',
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

-- ---------------------------------------------------------------------------
-- Join a business as its customer (from the business's link)
-- ---------------------------------------------------------------------------
create or replace function public.join_business(p_slug text, p_full_name text default null, p_phone text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_t public.tenants;
  v_user record;
  v_existing record;
  v_id uuid;
  v_name text;
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
begin
  if v_uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into v_t from public.tenants where slug = lower(btrim(p_slug));
  if v_t.id is null then raise exception 'Business not found' using errcode = 'P0002'; end if;
  if v_t.status in ('suspended', 'cancelled') then
    raise exception '% is not taking new customers right now', v_t.name using errcode = '22023';
  end if;

  select c.id, c.tenant_id, t.name as tenant_name into v_existing
    from public.customers c join public.tenants t on t.id = c.tenant_id where c.user_id = v_uid;
  if v_existing.id is not null then
    if v_existing.tenant_id = v_t.id then return v_existing.id; end if;
    raise exception 'This account is registered with %. Use a different email address to join %.', v_existing.tenant_name, v_t.name
      using errcode = '42501';
  end if;
  if exists (select 1 from public.tenant_members m where m.user_id = v_uid) then
    raise exception 'This is a business staff account. Use a different email address to sign up as a customer.' using errcode = '42501';
  end if;

  select u.email, u.email_confirmed_at, u.raw_user_meta_data into v_user from auth.users u where u.id = v_uid;
  v_name := coalesce(nullif(btrim(p_full_name), ''), nullif(v_user.raw_user_meta_data ->> 'full_name', ''), split_part(v_user.email, '@', 1));
  v_phone := coalesce(v_phone, nullif(regexp_replace(coalesce(v_user.raw_user_meta_data ->> 'phone', ''), '[^0-9+]', '', 'g'), ''));

  perform set_config('clena.trusted_write', 'on', true);
  -- An existing record the business created for this verified email is claimed, so past orders show up.
  if v_user.email_confirmed_at is not null then
    select id into v_id from public.customers
      where tenant_id = v_t.id and user_id is null and archived_at is null and lower(email) = lower(v_user.email)
      order by created_at limit 1;
  end if;
  if v_id is not null then
    update public.customers set user_id = v_uid where id = v_id;
  else
    if not coalesce((v_t.settings -> 'portal' ->> 'signup_enabled')::boolean, true) then
      perform set_config('clena.trusted_write', 'off', true);
      raise exception '% is not accepting new sign-ups. Ask them to add you as a customer.', v_t.name using errcode = '42501';
    end if;
    if v_phone is not null and exists (select 1 from public.customers where tenant_id = v_t.id and phone = v_phone) then
      perform set_config('clena.trusted_write', 'off', true);
      raise exception 'This phone number is already registered with %. Contact them to link your account.', v_t.name using errcode = '23505';
    end if;
    insert into public.customers (tenant_id, user_id, full_name, phone, email, created_by, home_branch_id)
    values (v_t.id, v_uid, left(v_name, 120), v_phone, lower(v_user.email), v_uid,
            (select id from public.branches where tenant_id = v_t.id and is_active order by created_at limit 1))
    returning id into v_id;
  end if;
  perform set_config('clena.trusted_write', 'off', true);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Pricing for customer orders. Used by the review screen and by place order,
-- so what the customer sees is exactly what is charged.
-- p_items: [{"service_id": "...", "quantity": 2}]
-- ---------------------------------------------------------------------------
create or replace function app.portal_quote(p_tenant uuid, p_customer uuid, p_items jsonb, p_promo text, p_mode text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_ps jsonb := app.portal_settings(p_tenant);
  v_item jsonb; v_svc record; v_qty numeric; v_line numeric;
  v_lines jsonb := '[]'::jsonb;
  v_sub numeric := 0; v_tax numeric := 0; v_fee numeric := 0; v_charge numeric := 0; v_disc numeric := 0;
  v_offer public.tenant_offers; v_code text := upper(nullif(btrim(coalesce(p_promo, '')), ''));
  v_promo_error text; v_now timestamptz := now();
begin
  if p_mode not in ('pickup_delivery', 'drop_off') then
    raise exception 'Choose pickup & delivery or drop-off' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one service' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'Too many items in one order' using errcode = '22023';
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
    v_lines := v_lines || jsonb_build_object('service_id', v_svc.id, 'name', v_svc.name, 'pricing_model', v_svc.pricing_model,
                                            'quantity', v_qty, 'unit_price', v_svc.base_price, 'tax_rate', v_svc.tax_rate, 'line_total', v_line);
  end loop;

  if p_mode = 'pickup_delivery' then v_fee := (v_ps ->> 'delivery_fee')::numeric; end if;
  v_charge := round(v_sub * (v_ps ->> 'service_charge_pct')::numeric / 100, 2);

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
      v_disc := case v_offer.kind
        when 'percent' then round(v_sub * v_offer.value / 100, 2)
        when 'fixed' then least(v_offer.value, v_sub)
        else v_fee end;
    end if;
  end if;

  return jsonb_build_object(
    'lines', v_lines, 'subtotal', v_sub, 'tax', v_tax, 'delivery_fee', v_fee, 'service_fee', v_charge,
    'discount', v_disc, 'promo_code', case when v_disc > 0 then v_code end, 'promo_error', v_promo_error,
    'promo_title', case when v_disc > 0 then v_offer.title end,
    'total', v_sub + v_tax + v_fee + v_charge - v_disc,
    'min_order', (v_ps ->> 'min_order')::numeric,
    'below_minimum', v_sub < (v_ps ->> 'min_order')::numeric,
    'currency', (select currency from public.tenants where id = p_tenant));
end $$;

create or replace function public.quote_my_order(p_tenant uuid, p_items jsonb, p_promo text default null, p_mode text default 'pickup_delivery')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_customer uuid := app.my_customer_id(p_tenant);
begin
  if v_customer is null then raise exception 'Sign in as a customer of this business' using errcode = '42501'; end if;
  return app.portal_quote(p_tenant, v_customer, p_items, p_promo, p_mode);
end $$;

-- ---------------------------------------------------------------------------
-- Place an order from the customer app
-- ---------------------------------------------------------------------------
create or replace function public.place_my_order(
  p_tenant uuid,
  p_items jsonb,
  p_mode text,
  p_pickup_address uuid default null,
  p_delivery_address uuid default null,
  p_pickup_at timestamptz default null,
  p_delivery_at timestamptz default null,
  p_promo text default null,
  p_notes text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_customer record;
  v_t public.tenants;
  v_ps jsonb;
  v_q jsonb;
  v_line jsonb;
  v_branch uuid; v_wf uuid; v_stage uuid;
  v_order uuid := gen_random_uuid();
  v_number text;
  v_pick text; v_drop text;
begin
  select * into v_t from public.tenants where id = p_tenant;
  select * into v_customer from public.customers where tenant_id = p_tenant and user_id = auth.uid() and archived_at is null;
  if v_customer.id is null then raise exception 'Sign in as a customer of this business' using errcode = '42501'; end if;
  if v_t.status in ('suspended', 'cancelled') then
    raise exception '% is not taking orders right now', v_t.name using errcode = '22023';
  end if;
  v_ps := app.portal_settings(p_tenant);
  if p_mode = 'pickup_delivery' and not (v_ps ->> 'pickup_enabled')::boolean then
    raise exception 'This business does not offer pickup & delivery' using errcode = '22023';
  end if;
  if p_mode = 'drop_off' and not (v_ps ->> 'drop_off_enabled')::boolean then
    raise exception 'This business does not accept drop-offs' using errcode = '22023';
  end if;

  v_q := app.portal_quote(p_tenant, v_customer.id, p_items, p_promo, p_mode);
  if v_q ->> 'promo_error' is not null then raise exception '%', v_q ->> 'promo_error' using errcode = '22023'; end if;
  if (v_q ->> 'below_minimum')::boolean then
    raise exception 'The minimum order is %', to_char((v_q ->> 'min_order')::numeric, 'FM999,999,990.00') using errcode = '22023';
  end if;

  if p_mode = 'pickup_delivery' then
    if p_pickup_address is null then raise exception 'Choose a collection address' using errcode = '22023'; end if;
    if p_pickup_at is null or p_delivery_at is null then raise exception 'Choose collection and delivery times' using errcode = '22023'; end if;
    if p_pickup_at < now() + make_interval(hours => (v_ps ->> 'pickup_lead_hours')::int) - interval '5 minutes' then
      raise exception 'Collection must be at least % hours from now', v_ps ->> 'pickup_lead_hours' using errcode = '22023';
    end if;
    if p_delivery_at <= p_pickup_at + interval '2 hours' then
      raise exception 'Delivery must be after collection' using errcode = '22023';
    end if;
    select concat_ws(', ', a.label || ': ' || a.line1, a.line2, a.city, a.state) into v_pick
      from public.customer_addresses a where a.id = p_pickup_address and a.customer_id = v_customer.id;
    if v_pick is null then raise exception 'Collection address not found' using errcode = '22023'; end if;
    select concat_ws(', ', a.label || ': ' || a.line1, a.line2, a.city, a.state) into v_drop
      from public.customer_addresses a where a.id = coalesce(p_delivery_address, p_pickup_address) and a.customer_id = v_customer.id;
    if v_drop is null then raise exception 'Delivery address not found' using errcode = '22023'; end if;
  elsif p_pickup_at is not null and p_pickup_at < now() - interval '1 hour' then
    raise exception 'Choose a drop-off time in the future' using errcode = '22023';
  end if;

  v_branch := coalesce(
    (select b.id from public.branches b where b.id = v_customer.home_branch_id and b.is_active),
    (select b.id from public.branches b where b.tenant_id = p_tenant and b.is_active order by b.created_at limit 1));
  if v_branch is null then raise exception 'This business is not set up to take orders yet' using errcode = '22023'; end if;
  select w.id into v_wf from public.workflows w where w.tenant_id = p_tenant and w.applies_to = 'order' and w.is_default;
  select s.id into v_stage from public.workflow_stages s where s.workflow_id = v_wf order by s.is_initial desc, s.position limit 1;
  if v_stage is null then raise exception 'This business is not set up to take orders yet' using errcode = '22023'; end if;

  perform set_config('clena.trusted_write', 'on', true);
  v_number := 'ORD-' || lpad(app.next_counter(p_tenant, 'order')::text, 5, '0');
  insert into public.orders (id, tenant_id, branch_id, customer_id, order_number, workflow_id, current_stage_id, currency,
                             notes, source, created_by, pickup_required, delivery_required,
                             pickup_address, delivery_address, pickup_at, expected_at, promo_code,
                             subtotal, tax_total, delivery_fee, service_fee, discount_total, total)
  values (v_order, p_tenant, v_branch, v_customer.id, v_number, v_wf, v_stage, v_t.currency,
          nullif(left(btrim(coalesce(p_notes, '')), 1000), ''), 'portal', auth.uid(),
          p_mode = 'pickup_delivery', p_mode = 'pickup_delivery', v_pick, v_drop, p_pickup_at,
          case when p_mode = 'pickup_delivery' then p_delivery_at end, v_q ->> 'promo_code',
          (v_q ->> 'subtotal')::numeric, (v_q ->> 'tax')::numeric, (v_q ->> 'delivery_fee')::numeric,
          (v_q ->> 'service_fee')::numeric, (v_q ->> 'discount')::numeric, (v_q ->> 'total')::numeric);
  for v_line in select * from jsonb_array_elements(v_q -> 'lines') loop
    insert into public.order_items (tenant_id, order_id, service_id, description, pricing_model, quantity, unit_price, tax_rate, line_total)
    values (p_tenant, v_order, (v_line ->> 'service_id')::uuid, v_line ->> 'name', (v_line ->> 'pricing_model')::public.pricing_model,
            (v_line ->> 'quantity')::numeric, (v_line ->> 'unit_price')::numeric, (v_line ->> 'tax_rate')::numeric, (v_line ->> 'line_total')::numeric);
  end loop;
  if v_q ->> 'promo_code' is not null then
    update public.tenant_offers set redeemed_count = redeemed_count + 1 where tenant_id = p_tenant and code = v_q ->> 'promo_code';
  end if;
  perform set_config('clena.trusted_write', 'off', true);
  return jsonb_build_object('id', v_order, 'order_number', v_number, 'total', (v_q ->> 'total')::numeric);
end $$;

-- Customer may cancel while the order is still at the first stage and unpaid.
create or replace function public.cancel_my_order(p_order uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  select o.id, o.tenant_id, o.cancelled_at, o.amount_paid, o.promo_code, s.is_initial,
         s.position = (select min(position) from public.workflow_stages x where x.workflow_id = o.workflow_id) as first_stage
    into v
    from public.orders o join public.workflow_stages s on s.id = o.current_stage_id
    where o.id = p_order and app.is_customer_self(o.tenant_id, o.customer_id);
  if v.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if v.cancelled_at is not null then return; end if;
  if not (v.is_initial or v.first_stage) or v.amount_paid > 0 then
    raise exception 'This order is already being processed. Chat with the business to change it.' using errcode = '22023';
  end if;
  perform set_config('clena.trusted_write', 'on', true);
  update public.orders set cancelled_at = now(), cancel_reason = coalesce(nullif(left(btrim(coalesce(p_reason, '')), 300), ''), 'Cancelled by customer')
    where id = p_order;
  if v.promo_code is not null then
    update public.tenant_offers set redeemed_count = greatest(redeemed_count - 1, 0) where tenant_id = v.tenant_id and code = v.promo_code;
  end if;
  perform set_config('clena.trusted_write', 'off', true);
end $$;

-- Customer edits their own profile (not tags, notes or loyalty, which belong to the business).
create or replace function public.update_my_profile(
  p_tenant uuid, p_full_name text, p_phone text default null,
  p_whatsapp boolean default null, p_sms boolean default null, p_email boolean default null,
  p_payment_method text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid := app.my_customer_id(p_tenant);
        v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
begin
  if v_id is null then raise exception 'Sign in as a customer of this business' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_full_name, ''))) < 2 then raise exception 'Enter your full name' using errcode = '22023'; end if;
  if p_payment_method is not null and p_payment_method not in ('cash', 'bank_transfer', 'pos', 'card_on_delivery') then
    raise exception 'Choose a payment method' using errcode = '22023';
  end if;
  if v_phone is not null and exists (select 1 from public.customers where tenant_id = p_tenant and phone = v_phone and id <> v_id) then
    raise exception 'That phone number is used by another customer' using errcode = '23505';
  end if;
  perform set_config('clena.trusted_write', 'on', true);
  update public.customers set
    full_name = left(btrim(p_full_name), 120),
    phone = v_phone,
    whatsapp_opt_in = coalesce(p_whatsapp, whatsapp_opt_in),
    sms_opt_in = coalesce(p_sms, sms_opt_in),
    email_opt_in = coalesce(p_email, email_opt_in),
    preferences = case when p_payment_method is null then preferences
                       else preferences || jsonb_build_object('payment_method', p_payment_method) end
  where id = v_id;
  perform set_config('clena.trusted_write', 'off', true);
end $$;

-- Mark the other side's messages in a conversation as read.
create or replace function public.mark_conversation_read(p_tenant uuid, p_customer uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_self uuid := app.my_customer_id(p_tenant);
begin
  if v_self is not null and (p_customer is null or p_customer = v_self) then
    update public.customer_messages set read_at = now()
      where tenant_id = p_tenant and customer_id = v_self and sender = 'business' and read_at is null;
  elsif p_customer is not null and app.has_permission(p_tenant, 'customers.view') then
    update public.customer_messages set read_at = now()
      where tenant_id = p_tenant and customer_id = p_customer and sender = 'customer' and read_at is null;
  else
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end $$;

-- Change the business's public link, with friendly validation.
create or replace function public.set_business_slug(p_tenant uuid, p_slug text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  if not app.has_permission(p_tenant, 'settings.manage') then
    raise exception 'Only the business owner can change the link' using errcode = '42501';
  end if;
  if v_slug !~ '^[a-z0-9]([a-z0-9-]{1,46}[a-z0-9])$' then
    raise exception 'Use 3–48 lowercase letters, numbers or dashes, starting and ending with a letter or number' using errcode = '22023';
  end if;
  if app.is_reserved_slug(v_slug) then raise exception 'That link is reserved. Choose another one.' using errcode = '22023'; end if;
  if exists (select 1 from public.tenants where slug = v_slug and id <> p_tenant) then
    raise exception 'That link is already taken. Try another.' using errcode = '23505';
  end if;
  update public.tenants set slug = v_slug where id = p_tenant;
  return v_slug;
end $$;

-- Conversations for the business inbox.
create or replace function public.customer_conversations(p_tenant uuid)
returns table (customer_id uuid, full_name text, phone text, last_body text, last_sender text, last_at timestamptz, unread int)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.full_name, c.phone, m.body, m.sender, m.created_at,
         (select count(*)::int from public.customer_messages u where u.customer_id = c.id and u.sender = 'customer' and u.read_at is null)
  from public.customers c
  join lateral (select body, sender, created_at from public.customer_messages x
                where x.customer_id = c.id order by x.created_at desc limit 1) m on true
  where c.tenant_id = p_tenant
  order by m.created_at desc
$$;

-- ---------------------------------------------------------------------------
-- Grants (explicit: new Supabase projects do not expose objects by default)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on table public.tenant_offers to authenticated, service_role;
grant select, insert, update, delete on table public.customer_messages to authenticated, service_role;

revoke all on function public.public_business(text) from public;
grant execute on function public.public_business(text) to anon, authenticated, service_role;
revoke all on function public.join_business(text, text, text) from public;
grant execute on function public.join_business(text, text, text) to authenticated, service_role;
revoke all on function public.quote_my_order(uuid, jsonb, text, text) from public;
grant execute on function public.quote_my_order(uuid, jsonb, text, text) to authenticated, service_role;
revoke all on function public.place_my_order(uuid, jsonb, text, uuid, uuid, timestamptz, timestamptz, text, text) from public;
grant execute on function public.place_my_order(uuid, jsonb, text, uuid, uuid, timestamptz, timestamptz, text, text) to authenticated, service_role;
revoke all on function public.cancel_my_order(uuid, text) from public;
grant execute on function public.cancel_my_order(uuid, text) to authenticated, service_role;
revoke all on function public.update_my_profile(uuid, text, text, boolean, boolean, boolean, text) from public;
grant execute on function public.update_my_profile(uuid, text, text, boolean, boolean, boolean, text) to authenticated, service_role;
revoke all on function public.mark_conversation_read(uuid, uuid) from public;
grant execute on function public.mark_conversation_read(uuid, uuid) to authenticated, service_role;
revoke all on function public.set_business_slug(uuid, text) from public;
grant execute on function public.set_business_slug(uuid, text) to authenticated, service_role;
revoke all on function public.customer_conversations(uuid) from public;
grant execute on function public.customer_conversations(uuid) to authenticated, service_role;

revoke all on function app.is_reserved_slug(text), app.guard_tenant_update(), app.guard_customer_login_link(),
  app.guard_customer_message(), app.my_customer_id(uuid), app.portal_settings(uuid),
  app.portal_quote(uuid, uuid, jsonb, text, text) from public;
grant execute on function app.is_reserved_slug(text), app.my_customer_id(uuid) to authenticated, service_role;
grant execute on function app.guard_tenant_update(), app.guard_customer_login_link(), app.guard_customer_message()
  to anon, authenticated, service_role;
