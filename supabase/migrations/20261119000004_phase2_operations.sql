-- =============================================================================
-- Clena — Phase 2: invitations, bookings, reports, dashboard deltas, sample data
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Fix: policies that are evaluated for anonymous visitors (e.g. plans on the
-- pricing page) call these helpers, so anon must be able to execute them.
-- They only ever answer about auth.uid(), which is null for anon.
-- ---------------------------------------------------------------------------
grant execute on function
  app.is_platform_admin(), app.is_platform_super_admin(), app.is_member(uuid),
  app.has_permission(uuid, text), app.member_role_key(uuid), app.current_member_id(uuid),
  app.can_access_branch(uuid, uuid), app.is_customer_self(uuid, uuid), app.path_tenant(text)
to anon;

-- Trusted server functions (sample data, invitations) may write online payments.
create or replace function app.guard_payment_write()
returns trigger language plpgsql as $$
begin
  if auth.uid() is null or current_setting('clena.trusted_write', true) = 'on' then return new; end if;
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

-- Sample-data loading writes its own, back-dated status history.
create or replace function app.record_order_stage_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_terminal boolean;
begin
  if current_setting('clena.demo_load', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.order_status_history (tenant_id, order_id, from_stage_id, to_stage_id, changed_by, note)
    values (new.tenant_id, new.id, null, new.current_stage_id, auth.uid(), 'Order created');
  elsif new.current_stage_id is distinct from old.current_stage_id then
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

-- Restore (not force off) the trusted-write flag so callers that set it keep it.
create or replace function app.refresh_order_payment(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_paid numeric(12, 2); v_total numeric(12, 2); v_refunded boolean;
        v_prev text := coalesce(current_setting('clena.trusted_write', true), 'off');
begin
  if p_order is null then return; end if;
  select coalesce(sum(amount) filter (where status = 'successful'), 0), bool_or(status = 'refunded')
    into v_paid, v_refunded from public.payments where order_id = p_order;
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
  perform set_config('clena.trusted_write', v_prev, true);
end $$;

-- ---------------------------------------------------------------------------
-- Team invitations. The invited person signs up with that email and is added
-- automatically (accept_my_invitations runs on every sign-in).
-- ---------------------------------------------------------------------------
create table public.tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role_id uuid not null,
  job_title text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, role_id) references public.roles (tenant_id, id) on delete cascade
);
create unique index tenant_invitations_pending_uq on public.tenant_invitations (tenant_id, email) where status = 'pending';
create index tenant_invitations_email_idx on public.tenant_invitations (email) where status = 'pending';
alter table public.tenant_invitations enable row level security;

create policy tenant_invitations_select on public.tenant_invitations for select to authenticated
  using (app.has_permission(tenant_id, 'staff.view'));
create policy tenant_invitations_write on public.tenant_invitations for all to authenticated
  using (app.has_permission(tenant_id, 'staff.manage'))
  with check (app.has_permission(tenant_id, 'staff.manage'));

create or replace function app.guard_invitation_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null
     and exists (select 1 from public.roles where id = new.role_id and key = 'owner')
     and not app.has_permission(new.tenant_id, 'settings.manage') then
    raise exception 'Only an owner can invite another owner' using errcode = '42501';
  end if;
  new.invited_by := coalesce(new.invited_by, auth.uid());
  return new;
end $$;
create trigger tenant_invitations_guard before insert or update on public.tenant_invitations
  for each row execute function app.guard_invitation_role();

create or replace function public.accept_my_invitations()
returns int language plpgsql security definer set search_path = '' as $$
declare v_email text; v_inv record; v_count int := 0;
begin
  if auth.uid() is null then return 0; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null then return 0; end if;
  perform set_config('clena.trusted_write', 'on', true);
  for v_inv in select * from public.tenant_invitations where email = v_email and status = 'pending' loop
    insert into public.tenant_members (tenant_id, user_id, role_id, status, job_title)
    values (v_inv.tenant_id, auth.uid(), v_inv.role_id, 'active', v_inv.job_title)
    on conflict (tenant_id, user_id) do nothing;
    update public.tenant_invitations set status = 'accepted', accepted_at = now() where id = v_inv.id;
    v_count := v_count + 1;
  end loop;
  perform set_config('clena.trusted_write', 'off', true);
  return v_count;
end $$;
revoke execute on function public.accept_my_invitations() from public, anon;
grant execute on function public.accept_my_invitations() to authenticated;

-- ---------------------------------------------------------------------------
-- Bookings: create with capacity and double-booking checks
-- ---------------------------------------------------------------------------
create or replace function public.create_booking(
  p_tenant uuid,
  p_branch uuid,
  p_customer uuid,
  p_service uuid,
  p_start timestamptz,
  p_end timestamptz default null,
  p_location text default null,
  p_notes text default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_svc record;
  v_end timestamptz;
  v_capacity int;
  v_busy int;
  v_currency text;
begin
  if not app.has_permission(p_tenant, 'bookings.manage') then
    raise exception 'You do not have permission to create bookings' using errcode = '42501';
  end if;
  select id, base_price, duration_minutes into v_svc from public.services
    where id = p_service and tenant_id = p_tenant and is_active;
  if v_svc.id is null then raise exception 'Service not found or inactive' using errcode = '22023'; end if;
  v_end := coalesce(p_end, p_start + make_interval(mins => coalesce(v_svc.duration_minutes, 60)));
  if v_end <= p_start then raise exception 'End time must be after start time' using errcode = '22023'; end if;

  select coalesce((settings ->> 'booking_capacity')::int, 3), currency into v_capacity, v_currency
    from public.tenants where id = p_tenant;

  if exists (select 1 from public.bookings b
             where b.tenant_id = p_tenant and b.customer_id = p_customer
               and b.status not in ('cancelled', 'no_show')
               and tstzrange(b.scheduled_start, b.scheduled_end) && tstzrange(p_start, v_end)) then
    raise exception 'This customer already has a booking at that time' using errcode = '23P01';
  end if;
  select count(*) into v_busy from public.bookings b
    where b.tenant_id = p_tenant and b.branch_id = p_branch
      and b.status not in ('cancelled', 'no_show')
      and tstzrange(b.scheduled_start, b.scheduled_end) && tstzrange(p_start, v_end);
  if v_busy >= v_capacity then
    raise exception 'That time slot is fully booked at this branch' using errcode = '23P01';
  end if;

  insert into public.bookings (tenant_id, branch_id, customer_id, service_id, booking_number, status,
                               scheduled_start, scheduled_end, location_text, special_instructions,
                               quoted_total, currency, created_by)
  values (p_tenant, p_branch, p_customer, p_service,
          'BKG-' || lpad(app.next_counter(p_tenant, 'booking')::text, 5, '0'), 'pending',
          p_start, v_end, p_location, p_notes, v_svc.base_price, v_currency, auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.create_booking(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.create_booking(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard metrics v2: adds previous-period comparison and today's bookings
-- ---------------------------------------------------------------------------
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
  v_prev_from timestamptz := p_from - (p_to - p_from);
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
    'revenue_prev', case when v_can_money then (select coalesce(sum(amount), 0) from p where created_at >= v_prev_from and created_at < p_from) end,
    'orders_today', (select count(*) from o where created_at >= v_today),
    'orders_period', (select count(*) from o where created_at between p_from and p_to),
    'orders_prev', (select count(*) from o where created_at >= v_prev_from and created_at < p_from),
    'avg_order_value', case when v_can_money then (select coalesce(round(avg(total), 2), 0) from o where created_at between p_from and p_to) end,
    'active_orders', (select count(*) from o where not is_terminal),
    'completed_orders', (select count(*) from o where is_terminal and completed_at between p_from and p_to),
    'overdue_orders', (select count(*) from o where not is_terminal and expected_at < now()),
    'pending_payments', case when v_can_money then (select coalesce(sum(total - amount_paid), 0) from o where payment_status in ('unpaid', 'partially_paid')) end,
    'pending_bookings', (select count(*) from public.bookings b where b.tenant_id = p_tenant and b.status = 'pending'
                           and (p_branch is null or b.branch_id = p_branch)),
    'bookings_today', (select count(*) from public.bookings b where b.tenant_id = p_tenant
                           and b.scheduled_start >= v_today and b.scheduled_start < v_today + interval '1 day'
                           and b.status not in ('cancelled')
                           and (p_branch is null or b.branch_id = p_branch)),
    'new_customers', (select count(*) from c where created_at between p_from and p_to),
    'new_customers_prev', (select count(*) from c where created_at >= v_prev_from and created_at < p_from),
    'repeat_customers', (select count(*) from c where n > 1),
    'total_customers', (select count(*) from c),
    'stage_breakdown', (select coalesce(jsonb_agg(x order by x.position), '[]'::jsonb) from (
        select s.id, s.name, s.color, s.position, s.is_terminal, count(o.id) as count
        from public.workflow_stages s
        join public.workflows w on w.id = s.workflow_id and w.tenant_id = p_tenant and w.is_default and w.applies_to = 'order'
        left join o on o.current_stage_id = s.id
        group by s.id, s.name, s.color, s.position, s.is_terminal) x),
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

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create or replace function public.report_summary(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_money boolean := app.has_permission(p_tenant, 'payments.view'); v_tz text;
begin
  if not app.has_permission(p_tenant, 'reports.view') then
    raise exception 'You do not have permission to view reports' using errcode = '42501';
  end if;
  select timezone into v_tz from public.tenants where id = p_tenant;
  return (
    with o as (
      select * from public.orders where tenant_id = p_tenant and cancelled_at is null
        and created_at between p_from and p_to
    ), p as (
      select * from public.payments where tenant_id = p_tenant and status = 'successful'
        and created_at between p_from and p_to
    )
    select jsonb_build_object(
      'orders', (select count(*) from o),
      'sales', case when v_money then (select coalesce(sum(total), 0) from o) end,
      'collected', case when v_money then (select coalesce(sum(amount), 0) from p) end,
      'outstanding', case when v_money then (select coalesce(sum(total - amount_paid), 0) from o) end,
      'avg_order_value', case when v_money then (select coalesce(round(avg(total), 2), 0) from o) end,
      'customers_served', (select count(distinct customer_id) from o),
      'avg_turnaround_hours', (select round(avg(extract(epoch from completed_at - created_at)) / 3600, 1) from o where completed_at is not null),
      'by_service', (select coalesce(jsonb_agg(x order by x.revenue desc nulls last, x.orders desc), '[]'::jsonb) from (
          select oi.description as name, count(distinct oi.order_id) as orders, sum(oi.quantity) as quantity,
                 case when v_money then sum(oi.line_total) end as revenue
          from public.order_items oi join o on o.id = oi.order_id group by oi.description) x),
      'by_branch', (select coalesce(jsonb_agg(x order by x.orders desc), '[]'::jsonb) from (
          select b.name, count(o.id) as orders, case when v_money then coalesce(sum(o.total), 0) end as revenue
          from public.branches b left join o on o.branch_id = b.id
          where b.tenant_id = p_tenant group by b.id, b.name) x),
      'by_method', case when v_money then (select coalesce(jsonb_agg(x order by x.amount desc), '[]'::jsonb) from (
          select method::text as method, count(*) as payments, sum(amount) as amount from p group by method) x) end,
      'top_customers', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
          select c.id, c.full_name as name, count(o.id) as orders,
                 case when v_money then sum(o.total) end as revenue
          from o join public.customers c on c.id = o.customer_id
          group by c.id, c.full_name order by count(o.id) desc, sum(o.total) desc limit 8) x),
      'by_weekday', (select coalesce(jsonb_agg(x order by x.dow), '[]'::jsonb) from (
          select extract(isodow from created_at at time zone v_tz)::int as dow, count(*) as orders
          from o group by 1) x)
    )
  );
end $$;
revoke execute on function public.report_summary(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.report_summary(uuid, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Sample data: realistic, clearly flagged (is_demo) and removable.
-- Callable by owners (settings.manage) from the app, or by the operator in SQL.
-- ---------------------------------------------------------------------------
create or replace function public.load_demo_data(p_tenant uuid, p_customers int default 42, p_orders int default 180)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_first text[] := array['Adaeze','Tunde','Ngozi','Emeka','Fatima','Chinedu','Bisi','Ifeoma','Segun','Amaka','Kunle','Halima',
                          'Obinna','Yetunde','Ibrahim','Chioma','Femi','Zainab','Uche','Funmi','Musa','Kemi','Nnamdi','Aisha',
                          'Dayo','Ebere','Tobi','Hauwa','Ikenna','Bukola','Sade','Gbenga','Nkechi','Yusuf','Ronke','Kelechi'];
  v_last text[]  := array['Okafor','Bakare','Eze','Nwosu','Bello','Adeyemi','Okonkwo','Ibrahim','Balogun','Obi','Mohammed',
                          'Adebayo','Chukwu','Ogunleye','Danjuma','Nnaji','Afolabi','Usman','Okeke','Lawal','Oyelaran','Ekwueme'];
  v_companies text[] := array['Lekki Gardens Estate','Bluewave Hotels','Crestview Apartments','Harbour Point Offices',
                              'Greenfield Clinic','Atlantic Shortlets','Primerose Schools','Coral Suites'];
  v_areas text[] := array['Lekki Phase 1','Ikoyi','Victoria Island','Yaba','Surulere','Ikeja GRA','Ajah','Magodo',
                          'Gbagada','Maryland','Ogudu','Festac','Chevron Drive','Oniru'];
  v_streets text[] := array['Admiralty Way','Bourdillon Road','Ozumba Mbadiwe Ave','Herbert Macaulay Way','Adeniran Ogunsanya St',
                            'Isaac John St','Fola Osibo Rd','Akin Adesola St','Ogunlana Drive','Allen Avenue'];
  v_notes text[] := array['Prefers light starch on shirts.','Call before delivery — gate is locked after 7pm.',
                          'Corporate account, invoice monthly.','Allergic to scented detergent — use hypoallergenic.',
                          'Always tips the rider. Very loyal customer.','Asked for weekend pickups only.'];
  v_methods text[] := array['bank_transfer','bank_transfer','bank_transfer','cash','cash','pos','pos','paystack'];
  v_user uuid := auth.uid();
  v_wf uuid; v_stage_ids uuid[]; v_stage_count int;
  v_branches uuid[]; v_customers uuid[] := '{}'; v_svc record; v_services jsonb;
  v_currency text; v_c uuid; v_i int; v_j int; v_k int;
  v_created timestamptz; v_completed timestamptz; v_expected timestamptz; v_age numeric;
  v_pos int; v_order uuid; v_sub numeric; v_tax numeric; v_disc numeric; v_total numeric;
  v_qty numeric; v_line numeric; v_items int; v_pick jsonb; v_r numeric; v_paid numeric; v_branch uuid;
  v_span interval; v_start timestamptz; v_bk_status public.booking_status; v_count_orders int := 0;
begin
  if v_user is not null and not app.has_permission(p_tenant, 'settings.manage') then
    raise exception 'Only the business owner can load sample data' using errcode = '42501';
  end if;
  if p_customers > 200 or p_orders > 1000 then
    raise exception 'Too much sample data requested' using errcode = '22023';
  end if;

  select currency into v_currency from public.tenants where id = p_tenant;
  if v_currency is null then raise exception 'Business not found' using errcode = 'P0002'; end if;

  -- branches
  select array_agg(id order by created_at) into v_branches from public.branches where tenant_id = p_tenant and is_active;
  if v_branches is null then
    insert into public.branches (tenant_id, name, address, city, country)
    values (p_tenant, 'Main Branch', '12 Admiralty Way', 'Lagos', 'NG') returning array[id] into v_branches;
  end if;

  -- services with a real price
  select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'model', pricing_model, 'price', base_price,
                                      'tax', tax_rate, 'minutes', coalesce(duration_minutes, 120)))
    into v_services
    from public.services where tenant_id = p_tenant and is_active and base_price > 0;
  if v_services is null then
    raise exception 'Add at least one priced service before loading sample data' using errcode = '22023';
  end if;

  select w.id into v_wf from public.workflows w where w.tenant_id = p_tenant and w.applies_to = 'order' and w.is_default;
  select array_agg(id order by position), count(*) into v_stage_ids, v_stage_count
    from public.workflow_stages where workflow_id = v_wf;
  if v_stage_count is null or v_stage_count = 0 then
    raise exception 'Set up an order workflow first' using errcode = '22023';
  end if;

  perform set_config('clena.trusted_write', 'on', true);
  perform set_config('clena.demo_load', 'on', true);

  -- customers
  for v_i in 1..p_customers loop
    v_c := null;
    insert into public.customers (tenant_id, full_name, phone, email, customer_type, company_name, tags,
                                  whatsapp_opt_in, marketing_opt_in, home_branch_id, is_demo, created_at, notes)
    select p_tenant, f || ' ' || l,
           '+23480' || lpad(((v_i * 104729 + extract(epoch from now())::bigint % 1000) % 100000000)::text, 8, '0'),
           case when random() < 0.7 then lower(f) || '.' || lower(l) || v_i || '@example.com' end,
           case when v_i % 7 = 0 then 'business' else 'individual' end,
           case when v_i % 7 = 0 then v_companies[1 + (v_i / 7) % array_length(v_companies, 1)] end,
           case when v_i % 9 = 0 then array['vip'] when v_i % 7 = 0 then array['corporate']
                when v_i % 5 = 0 then array['subscriber'] else '{}'::text[] end,
           random() < 0.8, random() < 0.45,
           v_branches[1 + (v_i % array_length(v_branches, 1))], true,
           now() - make_interval(days => floor(power(random(), 0.8) * 150)::int, hours => floor(random() * 24)::int),
           case when v_i % 6 = 0 then v_notes[1 + (v_i / 6) % array_length(v_notes, 1)] end
    from (select v_first[1 + floor(random() * array_length(v_first, 1))::int] as f,
                 v_last[1 + floor(random() * array_length(v_last, 1))::int] as l) n
    on conflict do nothing
    returning id into v_c;
    if v_c is not null then
      v_customers := v_customers || v_c;
      if random() < 0.75 then
        insert into public.customer_addresses (tenant_id, customer_id, label, line1, city, state, country, is_default)
        values (p_tenant, v_c, case when v_i % 7 = 0 then 'Office' else 'Home' end,
                (1 + floor(random() * 60))::int || ' ' || v_streets[1 + floor(random() * array_length(v_streets, 1))::int]
                  || ', ' || v_areas[1 + floor(random() * array_length(v_areas, 1))::int],
                'Lagos', 'Lagos', 'NG', true);
      end if;
    end if;
  end loop;
  if array_length(v_customers, 1) is null then
    raise exception 'Could not create sample customers' using errcode = '22023';
  end if;

  -- orders across the last 75 days, weighted toward recent days
  for v_i in 1..p_orders loop
    v_order := gen_random_uuid();
    v_created := now() - make_interval(secs => (power(random(), 1.5) * 75 * 86400)::int);
    v_created := least(now() - interval '10 minutes', date_trunc('hour', v_created) + make_interval(mins => floor(random() * 60)::int));
    v_age := extract(epoch from now() - v_created) / 86400;
    if v_age > 6 then v_pos := case when random() < 0.97 then v_stage_count else greatest(1, v_stage_count - 1) end;
    elsif v_age > 3 then v_pos := greatest(1, v_stage_count - floor(random() * 4)::int);
    else v_pos := 1 + floor(random() * greatest(1, v_stage_count - 1))::int;
    end if;
    v_c := v_customers[1 + floor(random() * array_length(v_customers, 1))::int];
    v_branch := case when random() < 0.65 then v_branches[1] else v_branches[1 + floor(random() * array_length(v_branches, 1))::int] end;

    v_sub := 0; v_tax := 0;
    v_items := 1 + floor(random() * 3)::int;
    v_expected := v_created + interval '2 days';
    insert into public.orders (id, tenant_id, branch_id, customer_id, order_number, workflow_id, current_stage_id,
                               currency, expected_at, source, is_demo, created_by, created_at, pickup_required, delivery_required)
    values (v_order, p_tenant, v_branch, v_c, 'ORD-' || lpad(app.next_counter(p_tenant, 'order')::text, 5, '0'),
            v_wf, v_stage_ids[v_pos], v_currency, v_expected,
            (array['staff','staff','staff','portal','whatsapp'])[1 + floor(random() * 5)::int], true, v_user, v_created,
            random() < 0.4, random() < 0.5);

    for v_j in 1..v_items loop
      v_pick := v_services -> floor(random() * jsonb_array_length(v_services))::int;
      v_qty := case v_pick ->> 'model'
                 when 'per_kg' then round((3 + random() * 9)::numeric, 1)
                 when 'per_item' then 1 + floor(random() * 8)
                 when 'per_room' then 1 + floor(random() * 4)
                 when 'per_hour' then 2 + floor(random() * 4)
                 when 'per_sqm' then 50 + floor(random() * 200)
                 else 1 end;
      v_line := round(v_qty * (v_pick ->> 'price')::numeric, 2);
      v_sub := v_sub + v_line;
      v_tax := v_tax + round(v_line * (v_pick ->> 'tax')::numeric / 100, 2);
      v_expected := greatest(v_expected, v_created + make_interval(mins => (v_pick ->> 'minutes')::int));
      insert into public.order_items (tenant_id, order_id, service_id, description, pricing_model, quantity, unit_price, tax_rate, line_total, created_at)
      values (p_tenant, v_order, (v_pick ->> 'id')::uuid, v_pick ->> 'name', (v_pick ->> 'model')::public.pricing_model,
              v_qty, (v_pick ->> 'price')::numeric, (v_pick ->> 'tax')::numeric, v_line, v_created);
    end loop;

    v_disc := case when random() < 0.12 then round(v_sub * 0.1, 2) else 0 end;
    v_total := v_sub - v_disc + v_tax;
    v_completed := case when v_pos = v_stage_count
                        then least(now() - interval '1 hour', v_created + make_interval(hours => (20 + floor(random() * 70))::int)) end;
    update public.orders set subtotal = v_sub, discount_total = v_disc, tax_total = v_tax, total = v_total,
                             expected_at = v_expected, completed_at = v_completed
      where id = v_order;

    -- back-dated status history for every stage reached
    v_span := coalesce(v_completed, now()) - v_created;
    for v_k in 1..v_pos loop
      insert into public.order_status_history (tenant_id, order_id, from_stage_id, to_stage_id, changed_by, note, created_at)
      values (p_tenant, v_order, case when v_k > 1 then v_stage_ids[v_k - 1] end, v_stage_ids[v_k], v_user,
              case when v_k = 1 then 'Order created' end,
              v_created + v_span * ((v_k - 1)::numeric / greatest(v_pos, 1)) + make_interval(secs => v_k));
    end loop;

    -- payments
    v_r := random();
    v_paid := case
      when v_pos = v_stage_count and v_r < 0.88 then v_total
      when v_pos = v_stage_count and v_r < 0.95 then round(v_total * 0.5, 2)
      when v_pos < v_stage_count and v_r < 0.40 then v_total
      when v_pos < v_stage_count and v_r < 0.55 then round(v_total * 0.5, 2)
      else 0 end;
    if v_paid > 0 then
      insert into public.payments (tenant_id, order_id, customer_id, amount, currency, method, status, provider,
                                   provider_reference, reference, verified_at, recorded_by, created_at)
      select p_tenant, v_order, v_c, v_paid, v_currency, m::public.payment_method, 'successful',
             case when m = 'paystack' then 'paystack' end,
             case when m = 'paystack' then 'DEMO-PSK-' || replace(v_order::text, '-', '') end,
             'DEMO-' || upper(substr(replace(v_order::text, '-', ''), 1, 10)),
             coalesce(v_completed, v_created), v_user, coalesce(v_completed, v_created + interval '30 minutes')
      from (select v_methods[1 + floor(random() * array_length(v_methods, 1))::int] as m) mm;
    end if;
    v_count_orders := v_count_orders + 1;
  end loop;

  -- bookings: last 10 days and next 14 days
  for v_i in 1..30 loop
    v_pick := v_services -> floor(random() * jsonb_array_length(v_services))::int;
    v_start := date_trunc('day', now()) + make_interval(days => (-10 + floor(random() * 25))::int, hours => 8 + floor(random() * 9)::int);
    v_bk_status := case
      when v_start < now() then (array['completed','completed','completed','no_show','cancelled'])[1 + floor(random() * 5)::int]::public.booking_status
      else (array['pending','confirmed','confirmed'])[1 + floor(random() * 3)::int]::public.booking_status end;
    insert into public.bookings (tenant_id, branch_id, customer_id, service_id, booking_number, status, scheduled_start,
                                 scheduled_end, location_text, quoted_total, currency, source, is_demo, created_by, created_at)
    values (p_tenant, v_branches[1 + floor(random() * array_length(v_branches, 1))::int],
            v_customers[1 + floor(random() * array_length(v_customers, 1))::int], (v_pick ->> 'id')::uuid,
            'BKG-' || lpad(app.next_counter(p_tenant, 'booking')::text, 5, '0'), v_bk_status, v_start,
            v_start + make_interval(mins => (array[30, 45, 60, 60, 90])[1 + floor(random() * 5)::int]),
            case when random() < 0.5 then 'Pickup from customer address' end,
            (v_pick ->> 'price')::numeric, v_currency,
            (array['staff','portal','whatsapp'])[1 + floor(random() * 3)::int]::text, true, v_user,
            v_start - make_interval(days => 1 + floor(random() * 5)::int));
  end loop;

  update public.tenants set settings = settings || jsonb_build_object('demo_data_loaded_at', now()) where id = p_tenant;

  perform set_config('clena.demo_load', 'off', true);
  perform set_config('clena.trusted_write', 'off', true);
  return jsonb_build_object('customers', array_length(v_customers, 1), 'orders', v_count_orders, 'bookings', 30);
end $$;

create or replace function public.clear_demo_data(p_tenant uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_orders int; v_customers int;
begin
  if auth.uid() is not null and not app.has_permission(p_tenant, 'settings.manage') then
    raise exception 'Only the business owner can remove sample data' using errcode = '42501';
  end if;
  delete from public.payments where tenant_id = p_tenant
    and order_id in (select id from public.orders where tenant_id = p_tenant and is_demo);
  delete from public.orders where tenant_id = p_tenant and is_demo;
  get diagnostics v_orders = row_count;
  delete from public.bookings where tenant_id = p_tenant and is_demo;
  delete from public.customers c where c.tenant_id = p_tenant and c.is_demo
    and not exists (select 1 from public.orders o where o.customer_id = c.id)
    and not exists (select 1 from public.bookings b where b.customer_id = c.id);
  get diagnostics v_customers = row_count;
  update public.tenants set settings = settings - 'demo_data_loaded_at' where id = p_tenant;
  return jsonb_build_object('orders', v_orders, 'customers', v_customers);
end $$;

revoke execute on function public.load_demo_data(uuid, int, int) from public, anon;
revoke execute on function public.clear_demo_data(uuid) from public, anon;
grant execute on function public.load_demo_data(uuid, int, int) to authenticated;
grant execute on function public.clear_demo_data(uuid) to authenticated;

revoke all on function app.guard_invitation_role() from public;
grant execute on all functions in schema app to authenticated, service_role;
revoke all on function app.attach_owner(text, text) from public, anon, authenticated;
revoke all on function app.grant_platform_role(text, public.platform_role) from public, anon, authenticated;
