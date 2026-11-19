import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/cta";
import { INDUSTRY_PAGES } from "./data";

export const metadata: Metadata = { title: "Industries" };

export default function IndustriesPage() {
  return (
    <>
      <PageHero eyebrow="Industries" title="Configured for your trade, not just laundry." description="Choose a template to start. Every workflow stage, service and price stays editable." />
      <section className="py-20">
        <div className="mx-auto grid max-w-7xl gap-4 px-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-3">
          {INDUSTRY_PAGES.map((i) => (
            <Link key={i.slug} href={`/industries/${i.slug}`} className="group rounded-2xl border border-line p-6 hover:shadow-lift">
              <h2 className="font-semibold">{i.title}</h2>
              <p className="mt-2 text-sm text-muted">{i.summary}</p>
              <p className="mt-4 flex flex-wrap gap-1.5">{i.stages.slice(0, 4).map((s) => <span key={s} className="rounded-full bg-canvas px-2 py-0.5 text-xs">{s}</span>)}<span className="text-xs text-muted">…</span></p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-teal-600">Explore <ArrowRight className="size-4" /></span>
            </Link>
          ))}
        </div>
      </section>
      <CtaBand />
    </>
  );
}
