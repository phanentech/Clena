-- =============================================================================
-- Clena — Reference data, tenant creation, storage
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Permission catalogue
-- ---------------------------------------------------------------------------
insert into public.permissions (key, module, description) values
  ('dashboard.view',       'dashboard',   'View the business dashboard'),
  ('customers.view',       'customers',   'View customers'),
  ('customers.manage',     'customers',   'Create and edit customers'),
  ('services.view',        'services',    'View services and prices'),
  ('services.manage',      'services',    'Create and edit services and prices'),
  ('orders.view',          'orders',      'View orders'),
  ('orders.manage',        'orders',      'Create and edit orders'),
  ('orders.update_status', 'orders',      'Move orders through workflow stages'),
  ('bookings.view',        'bookings',    'View bookings'),
  ('bookings.manage',      'bookings',    'Create and edit bookings'),
  ('logistics.view',       'logistics',   'View pickup and delivery jobs'),
  ('logistics.manage',     'logistics',   'Assign and manage pickup and delivery jobs'),
  ('payments.view',        'finance',     'View payments and revenue'),
  ('payments.record',      'finance',     'Record offline payments and refunds'),
  ('invoices.view',        'finance',     'View invoices'),
  ('invoices.manage',      'finance',     'Create and send invoices'),
  ('expenses.manage',      'finance',     'Record and edit expenses'),
  ('reports.view',         'reports',     'View reports and analytics'),
  ('staff.view',           'staff',       'View staff'),
  ('staff.manage',         'staff',       'Invite, edit and remove staff'),
  ('branches.manage',      'settings',    'Create and edit branches'),
  ('workflows.manage',     'settings',    'Configure workflows and stages'),
  ('subscriptions.manage', 'subscriptions','Manage customer subscription plans'),
  ('marketing.manage',     'marketing',   'Campaigns, promotions and loyalty'),
  ('inventory.manage',     'inventory',   'Inventory and suppliers'),
  ('automations.manage',   'automations', 'Configure automation rules'),
  ('ai.use',               'ai',          'Use the Clena AI assistant'),
  ('settings.manage',      'settings',    'Owner-level business settings and roles'),
  ('billing.manage',       'settings',    'Manage the Clena subscription for this business');

-- ---------------------------------------------------------------------------
-- Role templates (copied into each tenant; tenants can edit non-owner roles)
-- ---------------------------------------------------------------------------
insert into public.role_templates (role_key, role_name, permission_key)
select 'owner', 'Business Owner', key from public.permissions;

insert into public.role_templates (role_key, role_name, permission_key)
select 'manager', 'Business Manager', key from public.permissions
where key not in ('settings.manage', 'billing.manage');

insert into public.role_templates (role_key, role_name, permission_key)
select 'supervisor', 'Supervisor', unnest(array[
  'dashboard.view', 'customers.view', 'customers.manage', 'services.view',
  'orders.view', 'orders.manage', 'orders.update_status', 'bookings.view', 'bookings.manage',
  'logistics.view', 'logistics.manage', 'staff.view', 'reports.view']);

insert into public.role_templates (role_key, role_name, permission_key)
select 'staff', 'Staff', unnest(array[
  'dashboard.view', 'customers.view', 'services.view', 'orders.view', 'orders.update_status', 'bookings.view']);

insert into public.role_templates (role_key, role_name, permission_key)
select 'driver', 'Driver', unnest(array['logistics.view']);

insert into public.role_templates (role_key, role_name, permission_key)
select 'accountant', 'Accountant', unnest(array[
  'dashboard.view', 'customers.view', 'orders.view', 'payments.view', 'payments.record',
  'invoices.view', 'invoices.manage', 'expenses.manage', 'reports.view']);

-- ---------------------------------------------------------------------------
-- Industry templates
-- ---------------------------------------------------------------------------
insert into public.industry_templates (key, name, description, workflow_stages, default_services, terminology, sort_order) values
('laundry', 'Laundry & Dry Cleaning', 'Wash, dry clean, iron and deliver garments.',
 '[{"key":"received","name":"Received","color":"#64748B"},
   {"key":"sorting","name":"Sorting","color":"#6366F1","customer_visible":false},
   {"key":"washing","name":"Washing","color":"#0EA5E9"},
   {"key":"drying","name":"Drying","color":"#06B6D4","customer_visible":false},
   {"key":"ironing","name":"Ironing","color":"#14B8A6"},
   {"key":"folding","name":"Folding","color":"#10B981","customer_visible":false},
   {"key":"quality_check","name":"Quality Check","color":"#F59E0B"},
   {"key":"ready","name":"Ready","color":"#12C08A"},
   {"key":"out_for_delivery","name":"Out for Delivery","color":"#1E88A8"},
   {"key":"delivered","name":"Delivered","color":"#0B1B33","is_terminal":true}]',
 '[{"category":"Wash & Fold","name":"Wash & Fold","pricing_model":"per_kg","base_price":1500,"duration_minutes":2880},
   {"category":"Wash & Iron","name":"Shirt — Wash & Iron","pricing_model":"per_item","base_price":800,"duration_minutes":2880},
   {"category":"Dry Cleaning","name":"Suit — Dry Clean","pricing_model":"per_item","base_price":4500,"duration_minutes":4320},
   {"category":"Dry Cleaning","name":"Native Attire — Dry Clean","pricing_model":"per_item","base_price":3000,"duration_minutes":4320},
   {"category":"Household","name":"Duvet","pricing_model":"per_item","base_price":5000,"duration_minutes":4320}]',
 '{"order":"Order","item":"Garment"}', 1),
('car_wash', 'Car Wash & Detailing', 'Exterior wash, interior cleaning and detailing.',
 '[{"key":"booked","name":"Booked","color":"#64748B"},
   {"key":"vehicle_received","name":"Vehicle Received","color":"#6366F1"},
   {"key":"inspection","name":"Inspection","color":"#F59E0B"},
   {"key":"washing","name":"Washing","color":"#0EA5E9"},
   {"key":"detailing","name":"Detailing","color":"#14B8A6"},
   {"key":"quality_check","name":"Quality Check","color":"#F59E0B"},
   {"key":"ready","name":"Ready","color":"#12C08A"},
   {"key":"collected","name":"Collected","color":"#0B1B33","is_terminal":true}]',
 '[{"category":"Wash","name":"Exterior Wash","pricing_model":"per_vehicle","base_price":3000,"duration_minutes":45},
   {"category":"Wash","name":"Full Wash (In & Out)","pricing_model":"per_vehicle","base_price":5000,"duration_minutes":90},
   {"category":"Detailing","name":"Full Detailing","pricing_model":"per_vehicle","base_price":25000,"duration_minutes":300}]',
 '{"order":"Job","item":"Vehicle"}', 2),
('home_cleaning', 'Home Cleaning', 'Residential cleaning by room or by the hour.',
 '[{"key":"booked","name":"Booked","color":"#64748B"},
   {"key":"assigned","name":"Assigned","color":"#6366F1"},
   {"key":"en_route","name":"En Route","color":"#0EA5E9"},
   {"key":"arrived","name":"Arrived","color":"#06B6D4"},
   {"key":"cleaning","name":"Cleaning","color":"#14B8A6"},
   {"key":"inspection","name":"Inspection","color":"#F59E0B"},
   {"key":"completed","name":"Completed","color":"#0B1B33","is_terminal":true}]',
 '[{"category":"Standard","name":"Standard Clean","pricing_model":"per_room","base_price":7000,"duration_minutes":120},
   {"category":"Deep","name":"Deep Clean","pricing_model":"per_room","base_price":12000,"duration_minutes":240},
   {"category":"Hourly","name":"Hourly Cleaner","pricing_model":"per_hour","base_price":3500,"duration_minutes":60}]',
 '{"order":"Job","item":"Room"}', 3),
('apartment_cleaning', 'Apartment & Shortlet Cleaning', 'Turnover cleaning for apartments and shortlets.',
 '[{"key":"scheduled","name":"Scheduled","color":"#64748B"},
   {"key":"cleaner_assigned","name":"Cleaner Assigned","color":"#6366F1"},
   {"key":"arrived","name":"Arrived","color":"#0EA5E9"},
   {"key":"cleaning","name":"Cleaning","color":"#14B8A6"},
   {"key":"linen_change","name":"Linen Change","color":"#06B6D4"},
   {"key":"inspection","name":"Inspection","color":"#F59E0B"},
   {"key":"ready","name":"Ready","color":"#0B1B33","is_terminal":true}]',
 '[{"category":"Turnover","name":"Studio Turnover","pricing_model":"fixed","base_price":15000,"duration_minutes":120},
   {"category":"Turnover","name":"2-Bedroom Turnover","pricing_model":"fixed","base_price":25000,"duration_minutes":180}]',
 '{"order":"Turnover","item":"Unit"}', 4),
('commercial_cleaning', 'Office & Commercial Cleaning', 'Contract cleaning for offices and facilities.',
 '[{"key":"scheduled","name":"Scheduled","color":"#64748B"},
   {"key":"assigned","name":"Team Assigned","color":"#6366F1"},
   {"key":"in_progress","name":"In Progress","color":"#14B8A6"},
   {"key":"inspection","name":"Inspection","color":"#F59E0B"},
   {"key":"completed","name":"Completed","color":"#0B1B33","is_terminal":true}]',
 '[{"category":"Office","name":"Office Cleaning","pricing_model":"per_sqm","base_price":250,"duration_minutes":240},
   {"category":"Office","name":"Post-construction Clean","pricing_model":"quote","base_price":0,"duration_minutes":480}]',
 '{"order":"Job","item":"Area"}', 5),
('other', 'Other Service Business', 'Start from a simple workflow and customise it.',
 '[{"key":"received","name":"Received","color":"#64748B"},
   {"key":"in_progress","name":"In Progress","color":"#14B8A6"},
   {"key":"ready","name":"Ready","color":"#12C08A"},
   {"key":"completed","name":"Completed","color":"#0B1B33","is_terminal":true}]',
 '[]', '{"order":"Order","item":"Item"}', 99);

-- ---------------------------------------------------------------------------
-- SaaS plans (prices are configurable by platform admins; these are defaults)
-- ---------------------------------------------------------------------------
insert into public.plans (code, name, description, currency, price_monthly, price_annual, limits, features, sort_order) values
('starter', 'Starter', 'For a single location getting organised.', 'NGN', 15000, 150000,
 '{"branches":1,"staff":5,"customers":1000,"orders_per_month":500,"storage_mb":1024,"automations":3,"ai_requests_per_month":0,"whatsapp_messages_per_month":0}',
 '{"inventory":false,"marketing":false,"subscriptions":false,"white_label":false,"custom_domain":false,"ai":false}', 1),
('growth', 'Growth', 'For growing teams with pickup and delivery.', 'NGN', 35000, 350000,
 '{"branches":3,"staff":20,"customers":10000,"orders_per_month":3000,"storage_mb":10240,"automations":20,"ai_requests_per_month":500,"whatsapp_messages_per_month":1000}',
 '{"inventory":true,"marketing":true,"subscriptions":true,"white_label":false,"custom_domain":false,"ai":true}', 2),
('business', 'Business', 'For multi-branch operators.', 'NGN', 75000, 750000,
 '{"branches":10,"staff":100,"customers":100000,"orders_per_month":20000,"storage_mb":51200,"automations":100,"ai_requests_per_month":3000,"whatsapp_messages_per_month":10000}',
 '{"inventory":true,"marketing":true,"subscriptions":true,"white_label":true,"custom_domain":false,"ai":true}', 3),
('enterprise', 'Enterprise', 'Custom limits, white-label and custom domains.', 'NGN', 0, 0,
 '{"branches":null,"staff":null,"customers":null,"orders_per_month":null,"storage_mb":null,"automations":null,"ai_requests_per_month":null,"whatsapp_messages_per_month":null}',
 '{"inventory":true,"marketing":true,"subscriptions":true,"white_label":true,"custom_domain":true,"ai":true}', 4);

-- ---------------------------------------------------------------------------
-- Tenant bootstrap: roles, workflow, services from the industry template
-- ---------------------------------------------------------------------------
create or replace function app.bootstrap_tenant(p_tenant uuid, p_industry text, p_with_services boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_role record;
  v_role_id uuid;
  v_workflow uuid;
  v_stage jsonb;
  v_pos int := 0;
  v_stage_count int;
  v_tpl record;
  v_svc jsonb;
  v_cat uuid;
begin
  -- roles
  for v_role in select distinct role_key, role_name from public.role_templates loop
    insert into public.roles (tenant_id, key, name, is_system)
    values (p_tenant, v_role.role_key, v_role.role_name, true)
    returning id into v_role_id;
    insert into public.role_permissions (tenant_id, role_id, permission_key)
    select p_tenant, v_role_id, permission_key from public.role_templates where role_key = v_role.role_key;
  end loop;

  select * into v_tpl from public.industry_templates where key = coalesce(p_industry, 'other');
  if v_tpl.key is null then
    select * into v_tpl from public.industry_templates where key = 'other';
  end if;

  insert into public.workflows (tenant_id, name, applies_to, is_default)
  values (p_tenant, v_tpl.name || ' workflow', 'order', true)
  returning id into v_workflow;

  v_stage_count := jsonb_array_length(v_tpl.workflow_stages);
  for v_stage in select * from jsonb_array_elements(v_tpl.workflow_stages) loop
    v_pos := v_pos + 1;
    insert into public.workflow_stages (tenant_id, workflow_id, key, name, color, position,
                                        is_initial, is_terminal, customer_visible)
    values (p_tenant, v_workflow, v_stage ->> 'key', v_stage ->> 'name',
            coalesce(v_stage ->> 'color', '#64748B'), v_pos,
            v_pos = 1,
            coalesce((v_stage ->> 'is_terminal')::boolean, v_pos = v_stage_count),
            coalesce((v_stage ->> 'customer_visible')::boolean, true));
  end loop;

  if p_with_services then
    for v_svc in select * from jsonb_array_elements(v_tpl.default_services) loop
      insert into public.service_categories (tenant_id, name)
      values (p_tenant, v_svc ->> 'category')
      on conflict (tenant_id, name) do update set name = excluded.name
      returning id into v_cat;
      insert into public.services (tenant_id, category_id, name, pricing_model, base_price, duration_minutes)
      values (p_tenant, v_cat, v_svc ->> 'name', (v_svc ->> 'pricing_model')::public.pricing_model,
              (v_svc ->> 'base_price')::numeric, (v_svc ->> 'duration_minutes')::int);
    end loop;
  end if;
end $$;

-- Public RPC: create a business. The caller becomes its owner. Tenant id is never
-- supplied by the client.
create or replace function public.create_tenant(
  p_name text,
  p_slug text,
  p_industry text default 'other',
  p_country text default 'NG',
  p_currency text default 'NGN',
  p_timezone text default 'Africa/Lagos',
  p_with_template_services boolean default true
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid;
  v_plan uuid;
  v_owner_role uuid;
  v_owned int;
begin
  if v_user is null then
    raise exception 'You must be signed in to create a business' using errcode = '42501';
  end if;
  -- simple abuse guard: one user may own at most 5 businesses without platform help
  select count(*) into v_owned from public.tenant_members m join public.roles r on r.id = m.role_id
    where m.user_id = v_user and r.key = 'owner';
  if v_owned >= 5 then
    raise exception 'Business limit reached. Contact Clena support to add more.' using errcode = '42501';
  end if;
  if exists (select 1 from public.tenants where slug = lower(p_slug)) then
    raise exception 'That business URL is already taken' using errcode = '23505';
  end if;

  select id into v_plan from public.plans where code = 'starter';

  insert into public.tenants (name, slug, industry, country, currency, timezone, plan_id, created_by, branding)
  values (trim(p_name), lower(p_slug), coalesce(p_industry, 'other'), upper(p_country), upper(p_currency),
          p_timezone, v_plan, v_user,
          jsonb_build_object('primary_color', '#0B1B33', 'accent_color', '#12C08A', 'show_powered_by', true))
  returning id into v_tenant;

  perform app.bootstrap_tenant(v_tenant, p_industry, p_with_template_services);

  select id into v_owner_role from public.roles where tenant_id = v_tenant and key = 'owner';
  perform set_config('clena.trusted_write', 'on', true);
  insert into public.tenant_members (tenant_id, user_id, role_id, status)
  values (v_tenant, v_user, v_owner_role, 'active');
  perform set_config('clena.trusted_write', 'off', true);

  insert into public.tenant_subscriptions (tenant_id, plan_id, status)
  values (v_tenant, v_plan, 'trial');

  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id)
  values (v_tenant, v_user, 'tenant.created', 'tenant', v_tenant);

  return v_tenant;
end $$;

revoke execute on function public.create_tenant(text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.create_tenant(text, text, text, text, text, text, boolean) to authenticated;

-- Member's tenants with role + permissions (used by the app to build navigation)
create or replace function public.my_memberships()
returns table (tenant_id uuid, tenant_name text, tenant_slug text, role_key text, role_name text,
               permissions text[], onboarding_completed boolean, is_demo boolean)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name, t.slug, r.key, r.name,
         array(select rp.permission_key from public.role_permissions rp where rp.role_id = r.id order by 1),
         t.onboarding_completed_at is not null, t.is_demo
  from public.tenant_members m
  join public.tenants t on t.id = m.tenant_id
  join public.roles r on r.id = m.role_id
  where m.user_id = auth.uid() and m.status = 'active' and t.status <> 'suspended'
  order by t.created_at;
$$;
revoke execute on function public.my_memberships() from public, anon;
grant execute on function public.my_memberships() to authenticated;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage: private buckets, tenant-scoped paths "<tenant_id>/<...>"
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('tenant-assets', 'tenant-assets', false, 5242880,  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  ('order-media',   'order-media',   false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/heic']),
  ('proofs',        'proofs',        false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/heic']),
  ('documents',     'documents',     false, 20971520, array['application/pdf', 'image/png', 'image/jpeg']),
  ('invoices',      'invoices',      false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create or replace function app.path_tenant(p_name text)
returns uuid language plpgsql immutable as $$
begin
  return (storage.foldername(p_name))[1]::uuid;
exception when others then
  return null;
end $$;
grant execute on function app.path_tenant(text) to authenticated, service_role;

create policy "tenant members read tenant files" on storage.objects for select to authenticated
  using (
    bucket_id in ('tenant-assets', 'order-media', 'proofs', 'documents')
    and app.is_member(app.path_tenant(name))
  );

create policy "finance roles read invoices" on storage.objects for select to authenticated
  using (bucket_id = 'invoices' and app.has_permission(app.path_tenant(name), 'invoices.view'));

create policy "settings managers write tenant assets" on storage.objects for insert to authenticated
  with check (bucket_id = 'tenant-assets' and app.has_permission(app.path_tenant(name), 'settings.manage'));

create policy "order staff upload order media" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'order-media'
    and (app.has_permission(app.path_tenant(name), 'orders.manage')
         or app.has_permission(app.path_tenant(name), 'orders.update_status'))
  );

create policy "logistics upload proofs" on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and app.has_permission(app.path_tenant(name), 'logistics.view'));

create policy "managers upload documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and app.has_permission(app.path_tenant(name), 'customers.manage'));

create policy "owners delete tenant files" on storage.objects for delete to authenticated
  using (app.has_permission(app.path_tenant(name), 'settings.manage'));

-- ---------------------------------------------------------------------------
-- Operator-only helpers (run from the SQL editor / service role; NOT callable
-- by signed-in users).
-- ---------------------------------------------------------------------------
create or replace function app.attach_owner(p_slug text, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid; v_user uuid; v_role uuid;
begin
  select id into v_tenant from public.tenants where slug = p_slug;
  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_tenant is null or v_user is null then
    raise exception 'Tenant or user not found';
  end if;
  select id into v_role from public.roles where tenant_id = v_tenant and key = 'owner';
  insert into public.tenant_members (tenant_id, user_id, role_id, status)
  values (v_tenant, v_user, v_role, 'active')
  on conflict (tenant_id, user_id) do update set role_id = excluded.role_id, status = 'active';
end $$;

create or replace function app.grant_platform_role(p_email text, p_role public.platform_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.platform_admins (user_id, role)
  select id, p_role from auth.users where lower(email) = lower(p_email)
  on conflict (user_id) do update set role = excluded.role;
end $$;

revoke all on function app.attach_owner(text, text) from public, anon, authenticated;
revoke all on function app.grant_platform_role(text, public.platform_role) from public, anon, authenticated;
