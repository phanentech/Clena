import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CtaBand({ title = "Ready to run your service business?", body = "Set up in minutes. Your first workflow and services are created for you.", cta = "Start free trial" }: { title?: string; body?: string; cta?: string }) {
  return (
    <section className="px-5 pb-24 sm:px-8">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-navy-900 px-8 py-16 text-white sm:px-14">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-96 rounded-full bg-teal-500/25 blur-3xl" />
        <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
            <p className="mt-2 text-white/70">{body}</p>
          </div>
          <Button asChild size="lg" variant="brand"><Link href="/auth/register">{cta} <ArrowRight /></Link></Button>
        </div>
      </div>
    </section>
  );
}
