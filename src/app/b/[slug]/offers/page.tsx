import type { Metadata } from "next";
import { OfferCard } from "@/components/portal/offer-card";
import { PCard, PortalScreen } from "@/components/portal/ui";
import { requireCustomer } from "@/lib/portal";

export const metadata: Metadata = { title: "Offers" };

export default async function OffersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { business } = await requireCustomer(slug);
  const featured = business.offers.filter((o) => o.is_featured);
  const rest = business.offers.filter((o) => !o.is_featured);
  return (
    <PortalScreen business={business} title="My offers" subtitle="Copy a code and enter it when you review your order.">
      {business.offers.length === 0 ? (
        <PCard className="p-8 text-center">
          <p className="text-[15px] font-semibold">No offers right now</p>
          <p className="mt-1 text-[13px] text-[#6B7A90]">New offers from {business.name} will show up here.</p>
        </PCard>
      ) : (
        <>
          {featured.length > 0 && (
            <>
              <h2 className="mb-3 text-[17px] font-semibold">Featured</h2>
              <div className="grid gap-3 sm:grid-cols-2">{featured.map((o) => <OfferCard key={o.id} offer={o} currency={business.currency} />)}</div>
            </>
          )}
          {rest.length > 0 && (
            <>
              <h2 className={featured.length ? "mb-3 mt-7 text-[17px] font-semibold" : "mb-3 text-[17px] font-semibold"}>{featured.length ? "More offers" : "Available offers"}</h2>
              <div className="grid gap-3 sm:grid-cols-2">{rest.map((o) => <OfferCard key={o.id} offer={o} currency={business.currency} />)}</div>
            </>
          )}
        </>
      )}
    </PortalScreen>
  );
}
