import type { Metadata } from "next";
import { CartProvider } from "@/components/portal/cart";
import { BrandMark } from "@/components/portal/ui";
import { appName, requireBusiness, themeFor } from "@/lib/portal";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const b = await requireBusiness(slug);
  return {
    title: { default: appName(b), template: `%s · ${appName(b)}` },
    description: b.branding?.tagline ?? `Order and track your ${b.name} services.`,
  };
}

export default async function BusinessAppLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await requireBusiness(slug);
  return (
    <div style={themeFor(business)} className="text-[#0E1A2B]">
      {business.available ? (
        <CartProvider tenantId={business.id}>{children}</CartProvider>
      ) : (
        <div className="grid min-h-dvh place-items-center bg-[#F3F5F9] p-6">
          <div className="max-w-sm text-center">
            <div className="mx-auto mb-4 w-fit rounded-xl [background:linear-gradient(135deg,var(--p-primary),var(--p-secondary))] p-3">
              <BrandMark business={business} size={44} />
            </div>
            <h1 className="text-lg font-semibold">{appName(business)} is unavailable</h1>
            <p className="mt-1 text-sm text-[#5B6B80]">This business isn&apos;t taking orders online right now. Please contact them directly.</p>
          </div>
        </div>
      )}
    </div>
  );
}
