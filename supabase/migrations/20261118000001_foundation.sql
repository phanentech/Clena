-- =============================================================================
-- Clena — Foundation: platform, tenants, memberships, roles, permissions, RLS helpers
-- =============================================================================
-- Conventions
--   * UUID primary keys, created_at/updated_at on every mutable table.
--   * Every tenant-owned table carries tenant_id and a UNIQUE (tenant_id, id) so
--     child tables can use COMPOSITE foreign keys. That makes it impossible to
--     attach a row in tenant A to a parent that belongs to tenant B.
--   * Private helper functions live in schema "app" (not exposed by PostgREST).
--   * Tenant rows are never inserted directly by clients; tenant creation goes
--     through public.create_tenant() which derives the owner from auth.uid().
-- =============================================================================

create schema if not exists app;
grant usage on schema app to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.platform_role as enum ('super_admin', 'support');
create type public.tenant_status as enum ('trial', 'active', 'past_due', 'suspended', 'cancelled');
create type public.member_status as enum ('invited', 'active', 'disabled');
create type public.billing_interval as enum ('monthly', 'annual');

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- Platform level
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.platform_role not null,
  created_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  currency text not null default 'NGN',
  price_monthly numeric(12, 2) not null default 0,
  price_annual numeric(12, 2) not null default 0,
  -- e.g. {"branches":1,"staff":5,"customers":500,"orders_per_month":500,"storage_mb":1024,
  --       "automations":0,"ai_requests_per_month":0,"whatsapp_messages_per_month":0}
  limits jsonb not null default '{}'::jsonb,
  -- e.g. {"inventory":false,"marketing":false,"white_label":false,"custom_domain":false}
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger plans_touch before update on public.plans
  for each row execute function app.touch_updated_at();

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.feature_flags (
  key text primary key,
  description text,
  enabled boolean not null default false,
  rules jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Industry templates (global, read-only to tenants)
-- ---------------------------------------------------------------------------
create table public.industry_templates (
  key text primary key,
  name text not null,
  description text,
  -- [{"key":"received","name":"Received","color":"#64748B","customer_visible":true,"is_terminal":false}, ...]
  workflow_stages jsonb not null default '[]'::jsonb,
  -- [{"category":"Wash & Fold","name":"Wash & Fold","pricing_model":"per_kg","base_price":1500,"duration_minutes":2880}, ...]
  default_services jsonb not null default '[]'::jsonb,
  -- {"order":"Order","customer":"Customer","item":"Item"}
  terminology jsonb not null default '{}'::jsonb,
  sort_order int not null default 0
);

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,46}[a-z0-9])$'),
  industry text references public.industry_templates (key),
  country text not null default 'NG',
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Africa/Lagos',
  email text,
  phone text,
  address text,
  status public.tenant_status not null default 'trial',
  plan_id uuid references public.plans (id),
  -- {"logo_path":null,"primary_color":"#0B1B33","accent_color":"#12C08A","show_powered_by":true}
  branding jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  onboarding_step int not null default 1,
  onboarding_completed_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tenants_touch before update on public.tenants
  for each row execute function app.touch_updated_at();

-- Clena's own SaaS billing for tenants (separate from customer subscriptions)
create table public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  status public.tenant_status not null default 'trial',
  billing_interval public.billing_interval not null default 'monthly',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '14 days'),
  cancel_at_period_end boolean not null default false,
  provider text,
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tenant_subscriptions_tenant_idx on public.tenant_subscriptions (tenant_id);
create trigger tenant_subscriptions_touch before update on public.tenant_subscriptions
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Permissions and configurable roles
-- ---------------------------------------------------------------------------
create table public.permissions (
  key text primary key,
  module text not null,
  description text not null
);

-- Default permission sets for each system role. Copied into every new tenant.
create table public.role_templates (
  role_key text not null,
  role_name text not null,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_key, permission_key)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key),
  unique (tenant_id, id)
);
create trigger roles_touch before update on public.roles
  for each row execute function app.touch_updated_at();

create table public.role_permissions (
  tenant_id uuid not null,
  role_id uuid not null,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_id, permission_key),
  foreign key (tenant_id, role_id) references public.roles (tenant_id, id) on delete cascade
);
create index role_permissions_tenant_idx on public.role_permissions (tenant_id);

-- ---------------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------------
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  code text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  country text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  -- {"mon":[["08:00","18:00"]], ..., "sun":[]}
  operating_hours jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create index branches_tenant_idx on public.branches (tenant_id);
create trigger branches_touch before update on public.branches
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Tenant members (business-side users). Customers are NOT members.
-- ---------------------------------------------------------------------------
create table public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null,
  status public.member_status not null default 'active',
  -- if true the member is limited to the branches in member_branches
  branch_restricted boolean not null default false,
  job_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (tenant_id, id),
  foreign key (tenant_id, role_id) references public.roles (tenant_id, id)
);
create index tenant_members_user_idx on public.tenant_members (user_id);
create trigger tenant_members_touch before update on public.tenant_members
  for each row execute function app.touch_updated_at();

create table public.member_branches (
  tenant_id uuid not null,
  member_id uuid not null,
  branch_id uuid not null,
  primary key (member_id, branch_id),
  foreign key (tenant_id, member_id) references public.tenant_members (tenant_id, id) on delete cascade,
  foreign key (tenant_id, branch_id) references public.branches (tenant_id, id) on delete cascade
);

create table public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  member_id uuid not null,
  skills text[] not null default '{}',
  employment_status text not null default 'active'
    check (employment_status in ('active', 'on_leave', 'suspended', 'terminated')),
  schedule jsonb not null default '{}'::jsonb,
  is_driver boolean not null default false,
  vehicle_info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, member_id),
  unique (tenant_id, id),
  foreign key (tenant_id, member_id) references public.tenant_members (tenant_id, id) on delete cascade
);
create trigger staff_profiles_touch before update on public.staff_profiles
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Audit logs
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_tenant_created_idx on public.audit_logs (tenant_id, created_at desc);

-- =============================================================================
-- RLS helper functions (SECURITY DEFINER so they can read membership tables
-- without recursive policy evaluation; they only ever answer about auth.uid()).
-- =============================================================================
create or replace function app.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function app.is_platform_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function app.is_member(p_tenant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.tenant_members m
    join public.tenants t on t.id = m.tenant_id
    where m.tenant_id = p_tenant
      and m.user_id = auth.uid()
      and m.status = 'active'
      and t.status <> 'suspended'
  );
$$;

create or replace function app.has_permission(p_tenant uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.tenant_members m
    join public.tenants t on t.id = m.tenant_id
    join public.role_permissions rp on rp.role_id = m.role_id
    where m.tenant_id = p_tenant
      and m.user_id = auth.uid()
      and m.status = 'active'
      and t.status <> 'suspended'
      and rp.permission_key = p_permission
  );
$$;

create or replace function app.member_role_key(p_tenant uuid)
returns text language sql stable security definer set search_path = '' as $$
  select r.key
  from public.tenant_members m
  join public.roles r on r.id = m.role_id
  where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.status = 'active';
$$;

create or replace function app.current_member_id(p_tenant uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select m.id from public.tenant_members m
  where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.status = 'active';
$$;

-- Branch restriction: unrestricted members can access every branch of their tenant.
create or replace function app.can_access_branch(p_tenant uuid, p_branch uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.status = 'active'
      and (
        m.branch_restricted = false
        or p_branch is null
        or exists (
          select 1 from public.member_branches mb
          where mb.member_id = m.id and mb.branch_id = p_branch
        )
      )
  );
$$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.plans enable row level security;
alter table public.platform_settings enable row level security;
alter table public.feature_flags enable row level security;
alter table public.industry_templates enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.permissions enable row level security;
alter table public.role_templates enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.branches enable row level security;
alter table public.tenant_members enable row level security;
alter table public.member_branches enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: a user sees/edits their own; teammates can see each other's profile.
create policy profiles_self_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.tenant_members mine
      join public.tenant_members theirs on theirs.tenant_id = mine.tenant_id
      where mine.user_id = auth.uid() and mine.status = 'active' and theirs.user_id = profiles.id
    )
    or app.is_platform_admin()
  );
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Platform admins: only super admins can see the list; a user can see their own row.
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = auth.uid() or app.is_platform_super_admin());

-- Plans: active plans are public (pricing page); platform admins manage.
create policy plans_public_select on public.plans for select to anon, authenticated
  using (is_active or app.is_platform_admin());
create policy plans_admin_write on public.plans for all to authenticated
  using (app.is_platform_super_admin()) with check (app.is_platform_super_admin());

create policy platform_settings_admin on public.platform_settings for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_super_admin());
create policy feature_flags_read on public.feature_flags for select to authenticated using (true);
create policy feature_flags_admin on public.feature_flags for all to authenticated
  using (app.is_platform_super_admin()) with check (app.is_platform_super_admin());

create policy industry_templates_read on public.industry_templates for select to anon, authenticated
  using (true);
create policy industry_templates_admin on public.industry_templates for all to authenticated
  using (app.is_platform_super_admin()) with check (app.is_platform_super_admin());

-- Permissions catalogue and role templates are readable by signed-in users.
create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_templates_read on public.role_templates for select to authenticated using (true);

-- Tenants: members read their tenant; owners with settings.manage update it.
-- No INSERT/DELETE policy: creation goes through create_tenant(); deletion is a platform operation.
create policy tenants_member_select on public.tenants for select to authenticated
  using (app.is_member(id) or app.is_platform_admin());
create policy tenants_settings_update on public.tenants for update to authenticated
  using (app.has_permission(id, 'settings.manage'))
  with check (app.has_permission(id, 'settings.manage'));
create policy tenants_platform_update on public.tenants for update to authenticated
  using (app.is_platform_super_admin()) with check (app.is_platform_super_admin());

create policy tenant_subscriptions_select on public.tenant_subscriptions for select to authenticated
  using (app.has_permission(tenant_id, 'billing.manage') or app.is_platform_admin());
create policy tenant_subscriptions_platform on public.tenant_subscriptions for all to authenticated
  using (app.is_platform_super_admin()) with check (app.is_platform_super_admin());

-- Roles & role permissions: members can read (to render UI); staff.manage edits non-system roles,
-- settings.manage (owner) can edit any role's permissions.
create policy roles_select on public.roles for select to authenticated
  using (app.is_member(tenant_id));
create policy roles_write on public.roles for all to authenticated
  using (app.has_permission(tenant_id, 'settings.manage'))
  with check (app.has_permission(tenant_id, 'settings.manage'));

create policy role_permissions_select on public.role_permissions for select to authenticated
  using (app.is_member(tenant_id));
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (app.has_permission(tenant_id, 'settings.manage'))
  with check (app.has_permission(tenant_id, 'settings.manage'));

-- Branches
create policy branches_select on public.branches for select to authenticated
  using (app.is_member(tenant_id));
create policy branches_write on public.branches for all to authenticated
  using (app.has_permission(tenant_id, 'branches.manage'))
  with check (app.has_permission(tenant_id, 'branches.manage'));

-- Members: you see members of your tenants; staff.manage can add/update/remove.
create policy tenant_members_select on public.tenant_members for select to authenticated
  using (user_id = auth.uid() or app.is_member(tenant_id));
create policy tenant_members_write on public.tenant_members for all to authenticated
  using (app.has_permission(tenant_id, 'staff.manage'))
  with check (app.has_permission(tenant_id, 'staff.manage'));

create policy member_branches_select on public.member_branches for select to authenticated
  using (app.is_member(tenant_id));
create policy member_branches_write on public.member_branches for all to authenticated
  using (app.has_permission(tenant_id, 'staff.manage'))
  with check (app.has_permission(tenant_id, 'staff.manage'));

create policy staff_profiles_select on public.staff_profiles for select to authenticated
  using (app.has_permission(tenant_id, 'staff.view') or member_id = app.current_member_id(tenant_id));
create policy staff_profiles_write on public.staff_profiles for all to authenticated
  using (app.has_permission(tenant_id, 'staff.manage'))
  with check (app.has_permission(tenant_id, 'staff.manage'));

-- Audit logs: readable by owners/managers (settings.manage or reports.view); written by triggers/server.
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    (tenant_id is not null and app.has_permission(tenant_id, 'settings.manage'))
    or app.is_platform_admin()
  );

-- =============================================================================
-- Guard: a member cannot escalate their own role or re-enable themselves.
-- =============================================================================
create or replace function app.guard_member_self_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.user_id = auth.uid() and (
       new.role_id is distinct from old.role_id
       or new.status is distinct from old.status
       or new.branch_restricted is distinct from old.branch_restricted
     ) then
    raise exception 'You cannot change your own role, status or branch access'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger tenant_members_guard before update on public.tenant_members
  for each row execute function app.guard_member_self_change();

-- Guard: every tenant must keep at least one active owner.
create or replace function app.guard_last_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner_role uuid;
  v_remaining int;
begin
  select id into v_owner_role from public.roles where tenant_id = old.tenant_id and key = 'owner';
  if old.role_id = v_owner_role and old.status = 'active'
     and (tg_op = 'DELETE' or new.role_id <> v_owner_role or new.status <> 'active') then
    select count(*) into v_remaining from public.tenant_members
      where tenant_id = old.tenant_id and role_id = v_owner_role and status = 'active' and id <> old.id;
    if v_remaining = 0 and exists (select 1 from public.tenants where id = old.tenant_id) then
      raise exception 'A business must keep at least one active owner' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger tenant_members_last_owner before update or delete on public.tenant_members
  for each row execute function app.guard_last_owner();

-- Guard: system role keys cannot be renamed or deleted.
create or replace function app.guard_system_roles()
returns trigger language plpgsql as $$
begin
  if old.is_system and (tg_op = 'DELETE' or new.key <> old.key or new.is_system = false) then
    -- allow cascade deletion when the tenant itself is being deleted
    if tg_op = 'DELETE' and not exists (select 1 from public.tenants where id = old.tenant_id) then
      return old;
    end if;
    raise exception 'System roles cannot be renamed or removed' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger roles_guard_system before update or delete on public.roles
  for each row execute function app.guard_system_roles();

-- Guard: the owner role always keeps every permission.
create or replace function app.guard_owner_permissions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.roles where id = old.role_id and key = 'owner')
     and exists (select 1 from public.tenants where id = old.tenant_id) then
    raise exception 'Owner permissions cannot be removed' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger role_permissions_guard_owner before delete on public.role_permissions
  for each row execute function app.guard_owner_permissions();
