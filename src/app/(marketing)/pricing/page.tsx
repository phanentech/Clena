import Link from "next/link";
import type { Metadata } from "next";
import { Check } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/cta";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Pricing" };
type Plan = { id: string; code: string; name: string; description: string | null; limits: Record<string, number | null>; features: Record<string, boolean> };
type Price = { plan_id: string; currency: string; monthly_price: number };
type Period = { key: string; label: string; months: number; discount_percent: number };

async function getPricing() {
  if (!isSupabaseConfigured()) return null;
  // Anonymous client: RLS exposes only active plans, prices and periods.
  const supabase = createClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, { auth: { persistSession: false } });
  const [plans, prices, periods] = await Promise.all([
    supabase.from("plans").select("id, code, name, description, limits, features").eq("is_active", true).order("sort_order"),
    supabase.from("plan_prices").select("plan_id, currency, monthly_price").eq("is_active", true),
    supabase.from("billing_periods").select("key, label, months, discount_percent").eq("is_active", true).order("sort_order"),
  ]);
  if (plans.error || prices.error || periods.error) return null;
  return { plans: plans.data as Plan[], prices: prices.data as Price[], periods: periods.data as Period[] };
}

const LIMIT_LABELS: [string, string][] = [["branches", "branch"], ["staff", "team member"], ["orders_per_month", "order / month"], ["customers", "customer"]];
const FEATURE_LABELS: [string, string][] = [["subscriptions", "Customer subscriptions"], ["marketing", "Marketing & loyalty"], ["inventory", "Inventory"], ["ai", "Clena AI assistant"], ["white_label", "White-label branding"], ["custom_domain", "Custom domain"]];

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ currency?: string; period?: string }> }) {
  const sp = await searchParams;
  const data = await getPricing();
  const plans = data?.plans ?? null;
  const currencies = [...new Set((data?.prices ?? []).filter((p) => Number(p.monthly_price) > 0).map((p) => p.currency))];
  const currency = sp.currency && currencies.includes(sp.currency) ? sp.currency : currencies.includes("NGN") ? "NGN" : currencies[0] ?? "NGN";
  const period = data?.periods.find((p) => p.key === sp.period) ?? data?.periods.find((p) => p.key === "annual") ?? data?.periods[0];
  const monthly = (planId: string) => Number(data?.prices.find((p) => p.plan_id === planId && p.currency === currency)?.monthly_price ?? 0);
  return (
    <>
      <PageHero eyebrow="Pricing" title="Simple plans that grow with your business." description="Start with a 14-day free trial on any plan. Prices shown in each plan's billing currency." />
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          {data && (
            <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
              <div className="flex h-9 items-center rounded-lg border border-line p-0.5">
                {currencies.map((c) => <Link key={c} href={`?currency=${c}&period=${period?.key}`} className={`flex h-full items-center rounded-md px-3 text-xs font-semibold ${c === currency ? "bg-navy-900 text-white" : "text-muted"}`}>{c}</Link>)}
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {data.periods.map((p) => (
                  <Link key={p.key} href={`?currency=${currency}&period=${p.key}`} className={`flex h-9 items-center rounded-lg border px-3 text-xs font-medium ${p.key === period?.key ? "border-navy-900 bg-navy-900 text-white" : "border-line text-muted"}`}>
                    {p.label}{Number(p.discount_percent) > 0 && <span className={`ml-1.5 ${p.key === period?.key ? "text-brand-300" : "text-brand-700"}`}>−{Number(p.discount_percent)}%</span>}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {!plans || plans.length === 0 ? (
            <p className="rounded-2xl border border-line bg-canvas p-10 text-center text-muted">Pricing is being finalised. <Link href="/contact" className="font-semibold text-teal-600">Contact us</Link> for a quote.</p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {plans.map((p) => {
                const featured = p.code === "growth";
                const base = monthly(p.id);
                const custom = base === 0;
                const disc = Number(period?.discount_percent ?? 0);
                const perMonth = base * (1 - disc / 100);
                return (
                  <div key={p.code} className={`flex flex-col rounded-3xl border p-7 ${featured ? "border-navy-900 bg-navy-900 text-white shadow-lift" : "border-line bg-surface"}`}>
                    <h2 className="text-lg font-bold">{p.name}</h2>
                    <p className={`mt-1 text-sm ${featured ? "text-white/70" : "text-muted"}`}>{p.description}</p>
                    <p className="mt-6">
                      {custom ? <span className="text-3xl font-extrabold">Custom</span> : (
                        <><span className="text-3xl font-extrabold">{formatMoney(perMonth, currency, { decimals: 0 })}</span><span className={featured ? "text-white/60" : "text-muted"}> a month</span></>
                      )}
                    </p>
                    {!custom && period && period.months > 1 && <p className={`text-xs ${featured ? "text-white/60" : "text-muted"}`}>{formatMoney(perMonth * period.months, currency, { decimals: 0 })} billed {period.label.toLowerCase()}</p>}
                    <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                      {LIMIT_LABELS.map(([k, label]) => {
                        const v = p.limits?.[k];
                        return <li key={k} className="flex gap-2"><Check className="size-4 shrink-0 text-brand-400" />{v == null ? `Unlimited ${label}s` : `${v.toLocaleString()} ${label}${v === 1 ? "" : "s"}`}</li>;
                      })}
                      {FEATURE_LABELS.filter(([k]) => p.features?.[k]).map(([k, label]) => <li key={k} className="flex gap-2"><Check className="size-4 shrink-0 text-brand-400" />{label}</li>)}
                    </ul>
                    <Button asChild className="mt-8" variant={featured ? "brand" : "primary"}>
                      <Link href={custom ? "/contact" : "/auth/register"}>{custom ? "Talk to sales" : "Start free trial"}</Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
      <CtaBand />
    </>
  );
}
