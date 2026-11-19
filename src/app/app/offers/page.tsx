import type { Metadata } from "next";
import { TicketPercent } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { requireTenant } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/utils";
import { OfferForm, OfferRowActions } from "./offer-form";

export const metadata: Metadata = { title: "Offers" };

export default async function OffersPage() {
  const { membership } = await requireTenant("settings.manage");
  const supabase = await createClient();
  const [{ data: offers }, { data: t }] = await Promise.all([
    supabase.from("tenant_offers").select("*").eq("tenant_id", membership.tenantId).order("created_at", { ascending: false }),
    supabase.from("tenants").select("currency").eq("id", membership.tenantId).single(),
  ]);
  const currency = t?.currency ?? "NGN";
  const describe = (o: { kind: string; value: number }) =>
    o.kind === "percent" ? `${Number(o.value)}% off` : o.kind === "fixed" ? `${formatMoney(o.value, currency, { decimals: 0 })} off` : "Free delivery";
  return (
    <>
      <PageHeader title="Offers" description="Promo codes your customers see in your app and enter when they order. Discounts are checked and applied automatically." />
      <div className="grid gap-5 xl:grid-cols-[1fr_440px]">
        <Card>
          <CardHeader title="Your offers" description={`${offers?.length ?? 0} offer${offers?.length === 1 ? "" : "s"}`} />
          {!offers?.length ? (
            <EmptyState icon={<TicketPercent />} title="No offers yet" description="Create a welcome offer to turn first visits into first orders." />
          ) : (
            <Table>
              <thead><tr><Th>Code</Th><Th>Offer</Th><Th>Rules</Th><Th className="text-right">Used</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.id}>
                    <Td><span className="rounded-md border border-dashed border-line-strong px-1.5 py-0.5 text-xs font-semibold tnum">{o.code}</span></Td>
                    <Td><p className="font-medium">{o.title}</p><p className="text-xs text-muted">{describe(o)}</p></Td>
                    <Td className="text-xs text-muted">
                      {[Number(o.min_order) > 0 && `Min ${formatMoney(o.min_order, currency, { decimals: 0 })}`, o.first_order_only && "First order", o.once_per_customer && "Once each", o.ends_at && `Ends ${formatDate(o.ends_at)}`].filter(Boolean).join(" · ") || "None"}
                    </Td>
                    <Td className="text-right tnum">{o.redeemed_count}{o.max_redemptions ? ` / ${o.max_redemptions}` : ""}</Td>
                    <Td>{o.is_active ? <Badge tone="success">Active</Badge> : <Badge>Paused</Badge>}{o.is_featured && <Badge tone="info" className="ml-1">Featured</Badge>}</Td>
                    <Td><OfferRowActions id={o.id} active={o.is_active} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card className="self-start">
          <CardHeader title="New offer" />
          <OfferForm currency={currency} />
        </Card>
      </div>
    </>
  );
}
