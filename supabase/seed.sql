-- =============================================================================
-- DEMO DATA — D'WashGuy (first tenant, laundry & dry cleaning)
-- Everything here is flagged is_demo = true and can be removed with
--   select public.clear_demo_data((select id from public.tenants where slug = 'dwashguy'));
-- Runs on `supabase db reset` (local) — do NOT run against production unless
-- you intend to create the demo tenant there.
--
-- To make yourself the owner after signing up, run (SQL editor, as postgres):
--   select app.attach_owner('dwashguy', 'you@example.com');
-- =============================================================================

do $$
declare
  v_tenant uuid;
  v_branch uuid;
begin
  if exists (select 1 from public.tenants where slug = 'dwashguy') then
    raise notice 'Demo tenant already exists, skipping';
    return;
  end if;

  insert into public.tenants (name, slug, industry, country, currency, timezone, plan_id, is_demo, status,
                              email, phone, address, branding, onboarding_step, onboarding_completed_at)
  values ('D''WashGuy', 'dwashguy', 'laundry', 'NG', 'NGN', 'Africa/Lagos',
          (select id from public.plans where code = 'growth'), true, 'active',
          'hello@dwashguy.example', '+234 800 000 0000', 'Lekki Phase 1, Lagos',
          '{"primary_color":"#0B1B33","accent_color":"#12C08A","show_powered_by":true}', 13, now())
  returning id into v_tenant;

  perform app.bootstrap_tenant(v_tenant, 'laundry', true);

  insert into public.branches (tenant_id, name, code, address, city, state, country, phone, operating_hours)
  values (v_tenant, 'Lekki Phase 1', 'LK1', '12 Admiralty Way', 'Lekki', 'Lagos', 'NG', '+234 800 000 0001',
          '{"mon":[["08:00","19:00"]],"tue":[["08:00","19:00"]],"wed":[["08:00","19:00"]],"thu":[["08:00","19:00"]],"fri":[["08:00","19:00"]],"sat":[["09:00","17:00"]],"sun":[]}')
  returning id into v_branch;

  insert into public.branches (tenant_id, name, code, address, city, state, country)
  values (v_tenant, 'Yaba', 'YB1', '5 Herbert Macaulay Way', 'Yaba', 'Lagos', 'NG');

  -- realistic customers, orders, payments and bookings (all flagged is_demo)
  perform public.load_demo_data(v_tenant, 48, 220);

  insert into public.tenant_subscriptions (tenant_id, plan_id, status, current_period_end)
  values (v_tenant, (select id from public.plans where code = 'growth'), 'active', now() + interval '1 year');
end $$;
