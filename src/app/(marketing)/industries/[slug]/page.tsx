import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/cta";
import { INDUSTRY_PAGES } from "../data";

export const dynamicParams = false;
export function generateStaticParams() {
  return INDUSTRY_PAGES.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = INDUSTRY_PAGES.find((i) => i.slug === slug);
  return { title: page ? `Clena for ${page.title}` : "Industries" };
}

export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = INDUSTRY_PAGES.find((i) => i.slug === slug);
  if (!page) notFound();
  return (
    <>
      <PageHero eyebrow={page.title} title={page.headline} description={page.summary} />
      <section className="py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold">Your workflow, out of the box</h2>
            <p className="mt-2 text-muted">These stages are created when you sign up. Rename, reorder or add your own any time.</p>
            <ol className="mt-8 space-y-3">
              {page.stages.map((s, i) => (
                <li key={s} className="flex items-center gap-3">
                  <span className="grid size-7 place-items-center rounded-full bg-navy-900 text-xs font-semibold text-white">{i + 1}</span>
                  <span className="font-medium">{s}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-6">
            <div className="rounded-2xl border border-line p-6">
              <h3 className="font-semibold">Pricing your way</h3>
              <ul className="mt-3 space-y-2 text-sm">{page.pricing.map((p) => <li key={p} className="flex gap-2"><CheckCircle2 className="size-4 text-brand-600" />{p}</li>)}</ul>
            </div>
            {page.highlights.map((h) => (
              <div key={h.title} className="rounded-2xl border border-line p-6"><h3 className="font-semibold">{h.title}</h3><p className="mt-1.5 text-sm text-muted">{h.body}</p></div>
            ))}
            <Button asChild size="lg" variant="brand"><Link href="/auth/register">Start with this template <ArrowRight /></Link></Button>
          </div>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
