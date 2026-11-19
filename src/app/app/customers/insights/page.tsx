import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MessageCircle, Users } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, Table, Tabs, Td, Th } from "@/components/ui/primitives";
import { requireTenant } from "@/lib/auth/session";
import { hasLaundryOps } from "@/lib/ops";
import { SEGMENT_LABEL } from "@/lib/ops-shared";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, nowMs } from "@/lib/utils";

export const metadata: Metadata = { title: "Customer insights" };

type Row = { customer_id: string; full_name: string; phone: string | null; completed_orders: number; last_completed_at: string | null; avg_interval_days: number | null;
  avg_order_value: number | null; total_spend: number | null; predicted_next_at: string | null; segment: string; reason: string; has_active_order: boolean; subscription_plan: string | null };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ seg?: string }> }) {
  const { membership } = await requireTenant("customers.view");
  if (!(await hasLaundryOps(membership.tenantId))) notFound();
  const { seg = "due" } = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: t }] = await Promise.all([
    supabase.rpc("customer_insights", { p_tenant: membership.tenantId }),
    supabase.from("tenants").select("currency, name").eq("id", membership.tenantId).single(),
  ]);
  const all = (data ?? []) as Row[];
  const soon = nowMs() + 2 * 864e5;
  const due = (r: Row) => !r.has_active_order && r.predicted_next_at && +new Date(r.predicted_next_at) <= soon;
  const filters: Record<string, (r: Row) => boolean> = {
    due: (r) => Boolean(due(r)), vip: (r) => r.segment === "vip", regular: (r) => r.segment === "regular", new: (r) => r.segment === "new",
    at_risk: (r) => r.segment === "at_risk", lapsed: (r) => r.segment === "lapsed", prospect: (r) => r.segment === "prospect",
  };
  const rows = all.filter(filters[seg] ?? filters.due).sort((a, b) => Number(b.total_spend ?? 0) - Number(a.total_spend ?? 0));
  const money = (n: number | null) => formatMoney(Number(n ?? 0), t?.currency ?? "NGN");
  const tab = (key: string, label: string) => ({ key, label, href: `/app/customers/insights?seg=${key}`, count: all.filter(filters[key]).length });
  const wa = (r: Row) => {
    const num = r.phone?.replace(/[^0-9]/g, "");
    if (!num) return null;
    const text = r.segment === "lapsed" || r.segment === "at_risk"
      ? `Hi ${r.full_name.split(" ")[0]}, we miss you at ${t?.name}! Book a pickup this week and we'll take care of the rest.`
      : `Hi ${r.full_name.split(" ")[0]}, it's about time for your next laundry with ${t?.name}. Want us to pick up?`;
    return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  };
  return (
    <>
      <PageHeader title="Customer insights" description="Who's due for a pickup, who's slipping away, and your best customers. Reminders are also sent automatically each morning." back={{ href: "/app/customers", label: "Customers" }} />
      <div className="mb-4 overflow-x-auto"><Tabs active={seg} items={[tab("due", "Due now"), tab("vip", "VIP"), tab("regular", "Regular"), tab("new", "New"), tab("at_risk", "At risk"), tab("lapsed", "Lapsed"), tab("prospect", "No orders")]} /></div>
      <Card>
        {rows.length === 0 ? <EmptyState icon={<Users />} title="No customers in this group" /> : (
          <Table>
            <thead><tr><Th>Customer</Th><Th>Segment</Th><Th>Why</Th><Th className="text-right">Orders</Th><Th className="text-right">Spend</Th><Th>Next expected</Th><Th /></tr></thead>
            <tbody>{rows.slice(0, 200).map((r) => (
              <tr key={r.customer_id}>
                <Td><Link href={`/app/customers/${r.customer_id}`} className="font-medium hover:text-teal-600">{r.full_name}</Link><p className="text-xs text-muted">{r.phone}{r.subscription_plan ? ` · ${r.subscription_plan}` : ""}</p></Td>
                <Td><Badge tone={r.segment === "vip" ? "success" : r.segment === "at_risk" || r.segment === "lapsed" ? "warning" : "info"}>{SEGMENT_LABEL[r.segment] ?? r.segment}</Badge></Td>
                <Td className="max-w-[260px] text-xs text-muted">{r.reason}</Td>
                <Td className="text-right tnum">{r.completed_orders}</Td>
                <Td className="text-right tnum">{money(r.total_spend)}</Td>
                <Td className="text-xs">{r.has_active_order ? "Order in progress" : r.predicted_next_at ? formatDate(r.predicted_next_at) : "—"}</Td>
                <Td>{wa(r) && <a href={wa(r)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-teal-600"><MessageCircle className="size-3.5" />WhatsApp</a>}</Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
