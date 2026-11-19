import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { can, requireTenant } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";
import { PRICING_UNIT } from "@/lib/orders";
import { ServiceForm, ToggleServiceButton } from "./forms";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage() {
  const { membership } = await requireTenant("services.view");
  const supabase = await createClient();
  const [{ data: services, error }, { data: categories }, { data: tenant }] = await Promise.all([
    supabase.from("services").select("id, name, description, pricing_model, base_price, tax_rate, duration_minutes, is_active, service_categories(name)")
      .eq("tenant_id", membership.tenantId).order("sort_order").order("name"),
    supabase.from("service_categories").select("name").eq("tenant_id", membership.tenantId).order("sort_order"),
    supabase.from("tenants").select("currency").eq("id", membership.tenantId).single(),
  ]);
  if (error) throw new Error(error.message);
  const currency = tenant?.currency ?? "NGN";
  const manage = can(membership, "services.manage");

  return (
    <>
      <PageHeader title="Services" description="Your price list. Orders are always priced from here." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className={manage ? "lg:col-span-2" : "lg:col-span-3"}>
          {services.length === 0 ? (
            <EmptyState icon={<Sparkles />} title="No services yet" description="Add the services you sell and how you price them." />
          ) : (
            <Table>
              <thead><tr><Th>Service</Th><Th className="hidden sm:table-cell">Category</Th><Th className="text-right">Price</Th><Th>Status</Th>{manage && <Th><span className="sr-only">Actions</span></Th>}</tr></thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id} className={s.is_active ? "" : "opacity-60"}>
                    <Td><p className="font-semibold">{s.name}</p>{s.duration_minutes && <p className="text-xs text-muted">~{formatDuration(s.duration_minutes)}</p>}</Td>
                    <Td className="hidden text-muted sm:table-cell">{(s.service_categories as unknown as { name: string } | null)?.name ?? "—"}</Td>
                    <Td className="text-right"><span className="font-medium">{s.pricing_model === "quote" ? "On quote" : formatMoney(s.base_price, currency)}</span>
                      {PRICING_UNIT[s.pricing_model] && s.pricing_model !== "quote" && <span className="block text-xs text-muted">{PRICING_UNIT[s.pricing_model]}</span>}</Td>
                    <Td><Badge tone={s.is_active ? "success" : "neutral"}>{s.is_active ? "Active" : "Hidden"}</Badge></Td>
                    {manage && <Td className="text-right"><ToggleServiceButton id={s.id} active={s.is_active} /></Td>}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        {manage && (
          <Card>
            <CardHeader title="Add a service" />
            <div className="p-5"><ServiceForm categories={(categories ?? []).map((c) => c.name)} currency={currency} /></div>
          </Card>
        )}
      </div>
    </>
  );
}

function formatDuration(min: number) {
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} day${min >= 2880 ? "s" : ""}`;
}
