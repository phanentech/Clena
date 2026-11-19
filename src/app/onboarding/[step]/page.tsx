import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Check } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { createClient } from "@/lib/supabase/server";
import { getActiveMembership, requireUser } from "@/lib/auth/session";
import { ONBOARDING_STEPS, stepIndex, type StepSlug } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { fill, getLocale, getMessages } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { AboutStep, BrandingStep, BusinessStep, FinishStep, LocationStep, NotificationsStep, PaymentsStep, ServicesStep, TeamStep } from "../steps";

export const metadata: Metadata = { title: "Set up your business", robots: { index: false } };

export default async function OnboardingStepPage({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  const index = stepIndex(step);
  if (index < 0) notFound();
  const slug = step as StepSlug;
  const user = await requireUser(`/onboarding/${slug}`);
  const membership = await getActiveMembership();
  if (!membership && slug !== "business") redirect("/onboarding/business");
  if (membership && slug === "business") redirect("/onboarding/about");
  if (membership && membership.roleKey !== "owner") redirect("/app/dashboard");

  const supabase = await createClient();
  const tenantId = membership?.tenantId;
  const tenant = tenantId
    ? (await supabase.from("tenants").select("name, slug, currency, settings, branding, onboarding_step, industry").eq("id", tenantId).single()).data
    : null;
  const settings = (tenant?.settings ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const reached = tenant ? Math.max(tenant.onboarding_step - 1, 1) : 0;

  let body: React.ReactNode = null;
  switch (slug) {
    case "business": {
      const { data: industries } = await supabase.from("industry_templates").select("key, name, description").order("sort_order");
      body = <BusinessStep industries={industries ?? []} />;
      break;
    }
    case "about":
      body = <AboutStep initial={settings.profile} />;
      break;
    case "location": {
      const { data: branch } = await supabase.from("branches").select("name, address, city, state, phone, operating_hours").eq("tenant_id", tenantId!).order("created_at").limit(1).maybeSingle();
      body = <LocationStep branch={branch} />;
      break;
    }
    case "services": {
      const { data: services } = await supabase.from("services").select("id, name, pricing_model, base_price, is_active, service_categories(name)").eq("tenant_id", tenantId!).order("sort_order").order("name");
      body = <ServicesStep currency={tenant!.currency} services={(services ?? []).map((s) => ({ ...s, base_price: Number(s.base_price), category: (s.service_categories as unknown as { name: string } | null)?.name ?? null }))} />;
      break;
    }
    case "payments":
      body = <PaymentsStep initial={settings.payments} />;
      break;
    case "notifications":
      body = <NotificationsStep initial={settings.notifications} businessName={tenant!.name} />;
      break;
    case "branding":
      body = <BrandingStep businessName={tenant!.name} initial={tenant!.branding as Record<string, string | null>} />;
      break;
    case "team": {
      const { data: roles } = await supabase.from("roles").select("key, name").eq("tenant_id", tenantId!).neq("key", "owner").order("created_at");
      const { data: pending } = await supabase.from("tenant_invitations").select("email, roles(name)").eq("tenant_id", tenantId!).eq("status", "pending");
      body = <TeamStep roles={roles ?? []} pending={(pending ?? []).map((p) => ({ email: p.email, role: (p.roles as unknown as { name: string } | null)?.name ?? "" }))} />;
      break;
    }
    case "finish": {
      const [{ count: services }, { count: branches }, { count: invites }] = await Promise.all([
        supabase.from("services").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!).eq("is_active", true),
        supabase.from("branches").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!),
        supabase.from("tenant_invitations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!).eq("status", "pending"),
      ]);
      body = <FinishStep name={tenant!.name} services={services ?? 0} branches={branches ?? 0} invites={invites ?? 0} />;
      break;
    }
  }

  const [t, locale] = await Promise.all([getMessages(), getLocale()]);
  const o = t.onboarding;
  const stepText = (s: StepSlug) => o.steps[s];
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-7" />
            <span className="text-[13px] font-semibold">{tenant?.name ?? "New business"}</span>
          </div>
          <div className="flex items-center gap-4 text-[13px]">
            <LanguageSwitcher locale={locale} label={t.common.language} />
            <span className="text-muted tnum">{fill(o.stepOf, { n: index + 1, total: ONBOARDING_STEPS.length })}</span>
            {membership && <Link href="/app/dashboard" className="font-medium text-muted hover:text-ink">{o.finishLater}</Link>}
          </div>
        </div>
        <div className="h-0.5 bg-subtle"><div className="h-full bg-brand-500 transition-[width]" style={{ width: `${((index + 1) / ONBOARDING_STEPS.length) * 100}%` }} /></div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[260px_1fr]">
        <nav aria-label="Setup steps" className="hidden lg:block">
          <ol className="relative space-y-0.5 before:absolute before:bottom-3 before:start-[11px] before:top-3 before:w-px before:bg-line">
            {ONBOARDING_STEPS.map((s, i) => {
              const done = membership ? i < index || i < reached : false;
              const active = i === index;
              const reachable = membership ? i > 0 && i <= Math.max(reached, index) : i === 0;
              const inner = (
                <>
                  <span className={cn("relative z-10 grid size-[23px] shrink-0 place-items-center rounded-full border text-[11px] font-semibold tnum",
                    active ? "border-navy-900 bg-navy-900 text-white" : done ? "border-brand-500 bg-brand-500 text-navy-950" : "border-line-strong bg-canvas text-faint")}>
                    {done && !active ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-[13px] font-medium", active ? "text-ink" : "text-muted")}>{stepText(s.slug)[0]}</span>
                    {active && <span className="block text-xs text-faint">{s.summary}</span>}
                  </span>
                </>
              );
              return (
                <li key={s.slug}>
                  {reachable && !active ? (
                    <Link href={`/onboarding/${s.slug}`} className="flex items-start gap-3 rounded-md py-1.5 hover:bg-subtle/60">{inner}</Link>
                  ) : (
                    <div className="flex items-start gap-3 py-1.5" aria-current={active ? "step" : undefined}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="mt-8 border-t border-line pt-4 text-xs text-muted">{user.email}. {o.saved}</p>
        </nav>

        <main className="max-w-2xl">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em]">{stepText(slug)[0]}</h1>
          <p className="mt-1.5 text-[14px] text-muted">{stepText(slug)[1]}</p>
          <div className="mt-8">{body}</div>
        </main>
      </div>
    </div>
  );
}
