import type { Metadata } from "next";
import { PortalScreen } from "@/components/portal/ui";
import { ReviewOrder } from "@/components/portal/review-order";
import { requireCustomer } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Review order" };

export default async function ReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { business, customer } = await requireCustomer(slug);
  const supabase = await createClient();
  const [{ data: cust }] = await Promise.all([supabase.from("customers").select("loyalty_points").eq("id", customer.id).single()]);
  const { data: addresses } = await supabase.from("customer_addresses").select("id, label, line1, line2, city, is_default, zone_id")
    .eq("customer_id", customer.id).order("is_default", { ascending: false }).order("created_at");
  return (
    <PortalScreen business={business} title="Review order" back={`/b/${slug}/services`} wide>
      <ReviewOrder slug={slug} services={business.services} portal={business.portal} currency={business.currency}
        timezone={business.timezone || "Africa/Lagos"} industry={business.industry} addresses={addresses ?? []}
        zones={business.zones} loyalty={business.loyalty} pointsBalance={cust?.loyalty_points ?? 0} />
    </PortalScreen>
  );
}
