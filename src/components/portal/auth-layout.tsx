import Link from "next/link";
import type { Business } from "@/lib/portal-shared";
import { appName } from "@/lib/portal-shared";
import { BrandMark, PCard } from "./ui";

/** Branded sign-in / sign-up frame: the business's colours and logo, Clena underneath. */
export function PortalAuthLayout({ business, title, subtitle, children }: { business: Business; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#F3F5F9]">
      <div className="relative overflow-hidden pb-24 pt-10 text-white [background:linear-gradient(135deg,var(--p-primary)_0%,var(--p-primary)_40%,var(--p-secondary)_140%)]">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-[var(--p-secondary)] opacity-40 blur-3xl" />
        <div className="relative mx-auto max-w-md px-5 text-center">
          <Link href={`/b/${business.slug}`} className="mx-auto flex w-fit items-center gap-2.5">
            <BrandMark business={business} size={40} />
            <span className="text-[17px] font-semibold">{appName(business)}</span>
          </Link>
          <h1 className="mt-7 text-[26px] font-semibold tracking-[-0.015em]">{title}</h1>
          <p className="mt-1 text-[14px] text-white/75">{subtitle}</p>
        </div>
      </div>
      <div className="relative mx-auto -mt-16 max-w-md px-5 pb-12">
        <PCard className="p-5 sm:p-6">{children}</PCard>
        <p className="mt-6 text-center text-[11px] text-[#9AA5B5]">Powered by <Link href="/" className="font-semibold text-[#6B7A90]">Clena</Link></p>
      </div>
    </div>
  );
}
