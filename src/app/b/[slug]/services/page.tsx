import type { Metadata } from "next";
import { PortalScreen } from "@/components/portal/ui";
import { ServicesBrowser } from "@/components/portal/services-browser";
import { requireCustomer } from "@/lib/portal";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ add?: string }> }) {
  const { slug } = await params;
  const { add } = await searchParams;
  const { business } = await requireCustomer(slug);
  return (
    <PortalScreen business={business} title="Explore services" subtitle="Add what you need. You'll review prices and times before you order." wide>
      <ServicesBrowser slug={slug} services={business.services} categories={business.categories} currency={business.currency} industry={business.industry} highlight={add} />
    </PortalScreen>
  );
}
