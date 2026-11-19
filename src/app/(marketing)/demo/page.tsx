import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/marketing/page-hero";

export const metadata: Metadata = { title: "Book a demo" };
const EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "hello@clena.app";

export default function DemoPage() {
  const subject = encodeURIComponent("Clena demo request");
  const body = encodeURIComponent("Business name:\nIndustry:\nNumber of branches:\nPreferred date/time:\nPhone:\n");
  return (
    <>
      <PageHero eyebrow="Demo" title="See Clena running your workflow." description="We'll walk through orders, workflow stages, payments and the customer portal using your own services." />
      <section className="py-20">
        <div className="mx-auto grid max-w-4xl gap-6 px-5 sm:grid-cols-2 sm:px-8">
          <div className="rounded-2xl border border-line p-7">
            <CalendarCheck className="size-6 text-teal-500" />
            <h2 className="mt-4 text-lg font-semibold">Request a guided demo</h2>
            <p className="mt-2 text-sm text-muted">Send us a few details and we&apos;ll confirm a time within one business day.</p>
            <Button asChild className="mt-6" variant="navy"><a href={`mailto:${EMAIL}?subject=${subject}&body=${body}`}>Email us your details</a></Button>
          </div>
          <div className="rounded-2xl border border-line bg-canvas p-7">
            <h2 className="text-lg font-semibold">Or try it yourself</h2>
            <p className="mt-2 text-sm text-muted">Create a free trial business. Clena sets up your industry&apos;s workflow and starter services automatically.</p>
            <Button asChild className="mt-6" variant="brand"><Link href="/auth/register">Start free trial <ArrowRight /></Link></Button>
          </div>
        </div>
      </section>
    </>
  );
}
