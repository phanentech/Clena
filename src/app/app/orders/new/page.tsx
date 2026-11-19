import Link from "next/link";
import type { Metadata } from "next";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/session";
import { OrderForm } from "./form";
import { MapPin, Sparkles, UserPlus } from "lucide-react";

export const metadata: Metadata = { title: "New order" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { membership } = await requireTenant("orders.manage");
  const { customer } = await searchParams;
  const supabase = await createClient();
  const [{ data: customers }, { data: branches }, { data: services }, { data: tenant }] = await Promise.all([
    supabase.from("customers").select("id, full_name, phone").eq("tenant_id", membership.tenantId).is("archived_at", null).order("full_name").limit(500),
    supabase.from("branches").select("id, name").eq("tenant_id", membership.tenantId).eq("is_active", true).order("name"),
    supabase.from("services").select("id, name, pricing_model, base_price, tax_rate").eq("tenant_id", membership.tenantId).eq("is_active", true).order("sort_order").order("name"),
    supabase.from("tenants").select("currency").eq("id", membership.tenantId).single(),
  ]);

  const missing = !branches?.length
    ? { icon: <MapPin />, title: "Add a branch first", description: "Orders belong to a branch.", href: "/app/settings/branches", cta: "Add branch" }
    : !services?.length
      ? { icon: <Sparkles />, title: "Add a service first", description: "Orders are priced from your services.", href: "/app/services", cta: "Go to services" }
      : !customers?.length
        ? { icon: <UserPlus />, title: "Add a customer first", description: "Every order belongs to a customer.", href: "/app/customers/new", cta: "Add customer" }
        : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/app/orders", label: "Orders" }} title="New order" description="Prices are calculated from your service list when the order is saved." />
      <Card className="p-6">
        {missing ? (
          <EmptyState icon={missing.icon} title={missing.title} description={missing.description}
            action={<Button asChild><Link href={missing.href}>{missing.cta}</Link></Button>} />
        ) : (
          <OrderForm customers={customers!} branches={branches!} services={services!.map((s) => ({ ...s, base_price: Number(s.base_price), tax_rate: Number(s.tax_rate) }))}
            currency={tenant?.currency ?? "NGN"} defaultCustomer={customers!.some((c) => c.id === customer) ? customer : undefined} />
        )}
      </Card>
    </div>
  );
}
