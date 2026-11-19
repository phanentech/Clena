import Link from "next/link";
import {
  ArrowRight, BarChart3, Bell, Building, Building2, Car, CheckCircle2, CreditCard, Home, Layers, MapPin, Shirt, ShieldCheck, Smartphone, Users, Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo";
import { INDUSTRY_PAGES } from "./industries/data";
import { CtaBand } from "@/components/marketing/cta";
import { getMessages } from "@/lib/i18n/server";

const ICONS = { Shirt, Car, Home, Building2, Building } as const;

const FEATURES = [
  { icon: Workflow, title: "Workflows that fit your trade", body: "Laundry, car wash or cleaning — start from an industry template, then rename, reorder and recolour every stage." },
  { icon: Users, title: "Customers & CRM", body: "Profiles, preferences, notes, consent and full order history in one timeline." },
  { icon: CreditCard, title: "Payments you can trust", body: "Paystack, Flutterwave, transfer and cash — verified on the server, reconciled per order." },
  { icon: MapPin, title: "Pickup & delivery", body: "Assign drivers, plan routes and capture proof of pickup and delivery." },
  { icon: Bell, title: "WhatsApp, SMS & email", body: "Tell customers when their order is ready, using templates you control." },
  { icon: BarChart3, title: "Live business insight", body: "Revenue, workload and customer trends from your real records — by branch." },
];

export default async function HomePage() {
  const t = await getMessages();
  return (
    <>
      <section className="relative overflow-hidden bg-navy-900 pb-24 pt-36 text-white sm:pb-32 sm:pt-44">
        <div aria-hidden className="pointer-events-none absolute -bottom-56 right-[-10%] h-[520px] w-[900px] rounded-[50%] bg-teal-500/25 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80">
              <span className="size-1.5 rounded-full bg-brand-400" /> {t.marketing.eyebrow}
            </p>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              {t.marketing.heroA} <span className="text-brand-gradient">{t.marketing.heroHighlight}</span> {t.marketing.heroB}
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/70">{t.marketing.heroBody}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="brand"><Link href="/auth/register">{t.common.startTrial} <ArrowRight /></Link></Button>
              <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10"><Link href="/demo">{t.common.bookDemo}</Link></Button>
            </div>
            <p className="mt-5 text-sm text-white/50">{t.common.trialNote}</p>
          </div>

          {/* Product preview (illustrative UI, no figures) */}
          <div className="relative">
            <div className="rounded-3xl border border-white/10 bg-white p-5 text-ink shadow-2xl shadow-navy-950/40">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <div className="flex items-center gap-2"><LogoMark className="size-6" /><span className="text-sm font-semibold">Order ORD-00128</span></div>
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">Ready</span>
              </div>
              <ol className="mt-5 space-y-3">
                {["Received", "Washing", "Ironing", "Quality Check", "Ready", "Out for Delivery"].map((s, i) => (
                  <li key={s} className="flex items-center gap-3 text-sm">
                    <span className={`grid size-6 place-items-center rounded-full ${i < 5 ? "bg-brand-500 text-navy-950" : "border border-line text-muted"}`}>
                      {i < 5 ? <CheckCircle2 className="size-3.5" /> : <span className="text-[10px]">{i + 1}</span>}
                    </span>
                    <span className={i < 5 ? "font-medium" : "text-muted"}>{s}</span>
                    {i === 4 && <span className="ml-auto text-xs text-teal-600">WhatsApp sent to customer</span>}
                  </li>
                ))}
              </ol>
            </div>
            <div className="relative z-10 -mt-6 ml-auto mr-6 hidden w-60 rounded-2xl border border-line bg-white p-4 text-ink shadow-lift sm:block lg:-mr-6">
              <p className="text-xs font-semibold text-muted">One platform</p>
              <ul className="mt-2 space-y-2 text-sm">
                {INDUSTRY_PAGES.slice(0, 4).map((i) => {
                  const Icon = ICONS[i.icon as keyof typeof ICONS];
                  return <li key={i.slug} className="flex items-center gap-2"><Icon className="size-4 text-teal-500" />{i.title}</li>;
                })}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-teal-600">{t.marketing.featuresKicker}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t.marketing.featuresTitle}</h2>
          </div>
          <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <div className="grid size-11 place-items-center rounded-xl bg-navy-900 text-brand-400"><f.icon className="size-5" /></div>
                <h3 className="mt-5 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-canvas py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.marketing.industriesTitle}</h2>
          <p className="mt-3 max-w-2xl text-muted">{t.marketing.industriesBody}</p>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INDUSTRY_PAGES.map((i) => {
              const Icon = ICONS[i.icon as keyof typeof ICONS];
              return (
                <Link key={i.slug} href={`/industries/${i.slug}`} className="group rounded-2xl border border-line bg-surface p-6 transition-shadow hover:shadow-lift">
                  <Icon className="size-6 text-teal-500" />
                  <h3 className="mt-4 font-semibold">{i.title}</h3>
                  <p className="mt-2 text-sm text-muted">{i.summary}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-teal-600">{t.marketing.seeHow} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-3">
          {[
            { icon: ShieldCheck, title: "Your data stays yours", body: "Every business is isolated at the database level. Staff only see what their role allows." },
            { icon: Smartphone, title: "Made for phones", body: "Staff, drivers and customers get task-first mobile screens, not a shrunken desktop." },
            { icon: Layers, title: "Grows with you", body: "Add branches, team members and modules like inventory, marketing and subscriptions as you scale." },
          ].map((f) => (
            <div key={f.title} className="flex gap-4">
              <f.icon className="mt-0.5 size-6 shrink-0 text-brand-600" />
              <div><h3 className="font-semibold">{f.title}</h3><p className="mt-1.5 text-sm text-muted">{f.body}</p></div>
            </div>
          ))}
        </div>
      </section>

      <CtaBand title={t.marketing.ctaTitle} body={t.marketing.ctaBody} cta={t.common.startTrial} />
    </>
  );
}
