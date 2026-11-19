import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { HBars } from "@/components/app/charts";
import { createClient } from "@/lib/supabase/server";
import { can, requireTenant } from "@/lib/auth/session";
import { cn, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

type Report = {
  orders: number; sales: number | null; collected: number | null; outstanding: number | null; avg_order_value: number | null;
  customers_served: number; avg_turnaround_hours: number | null;
  by_service: { name: string; orders: number; quantity: number; revenue: number | null }[];
  by_branch: { name: string; orders: number; revenue: number | null }[];
  by_method: { method: string; payments: number; amount: number }[] | null;
  top_customers: { id: string; name: string; orders: number; revenue: number | null }[];
  by_weekday: { dow: number; orders: number }[];
};
const PERIODS = { "30": "Last 30 days", "90": "Last 90 days", "365": "Last 12 months" } as const;
const METHOD_LABEL: Record<string, string> = { cash: "Cash", bank_transfer: "Bank transfer", pos: "POS", manual: "Manual", paystack: "Paystack", flutterwave: "Flutterwave" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { membership } = await requireTenant("reports.view");
  const sp = await searchParams;
  const days = (sp.days && sp.days in PERIODS ? sp.days : "30") as keyof typeof PERIODS;
  const supabase = await createClient();
  const to = new Date();
  const from = new Date(to.getTime() - Number(days) * 86_400_000);
  const [{ data, error }, { data: tenant }] = await Promise.all([
    supabase.rpc("report_summary", { p_tenant: membership.tenantId, p_from: from.toISOString(), p_to: to.toISOString() }),
    supabase.from("tenants").select("currency").eq("id", membership.tenantId).single(),
  ]);
  if (error) throw new Error(error.message);
  const r = data as Report;
  const cur = tenant?.currency ?? "NGN";
  const money = can(membership, "payments.view");
  const collectionRate = r.sales ? Math.round(((r.collected ?? 0) / r.sales) * 100) : null;
  const maxDow = Math.max(...r.by_weekday.map((d) => d.orders), 1);
  const dow = WEEKDAYS.map((label, i) => ({ label, orders: r.by_weekday.find((d) => d.dow === i + 1)?.orders ?? 0 }));

  return (
    <>
      <PageHeader title="Reports" description={`${PERIODS[days]}, from your live orders and payments.`}
        actions={
          <div className="flex h-9 items-center rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="Period">
            {Object.entries(PERIODS).map(([k, v]) => (
              <Link key={k} href={`?days=${k}`} className={cn("flex h-full items-center rounded-md px-2.5 text-xs font-medium", k === days ? "bg-navy-900 text-white" : "text-muted hover:text-ink")}>{v}</Link>
            ))}
          </div>
        } />

      <Card className="grid grid-cols-2 lg:grid-cols-5 [&>div]:border-line [&>div]:px-4 [&>div]:py-4 lg:divide-x max-lg:[&>div]:border-b">
        {money && <div><p className="text-xs text-muted">Sales</p><p className="mt-1 text-xl font-semibold tnum">{formatMoney(r.sales, cur)}</p></div>}
        {money && <div><p className="text-xs text-muted">Collected</p><p className="mt-1 text-xl font-semibold tnum">{formatMoney(r.collected, cur)}</p>{collectionRate != null && <p className="text-xs text-faint">{collectionRate}% of sales</p>}</div>}
        <div><p className="text-xs text-muted">Orders</p><p className="mt-1 text-xl font-semibold tnum">{r.orders}</p>{money && <p className="text-xs text-faint">{formatMoney(r.avg_order_value, cur)} average</p>}</div>
        <div><p className="text-xs text-muted">Customers served</p><p className="mt-1 text-xl font-semibold tnum">{r.customers_served}</p></div>
        <div><p className="text-xs text-muted">Average turnaround</p><p className="mt-1 text-xl font-semibold tnum">{r.avg_turnaround_hours != null ? (r.avg_turnaround_hours >= 48 ? `${(r.avg_turnaround_hours / 24).toFixed(1)} days` : `${r.avg_turnaround_hours} h`) : "—"}</p><p className="text-xs text-faint">Order in to completed</p></div>
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title={money ? "Sales by service" : "Orders by service"} />
          <div className="p-4">{r.by_service.length ? <HBars data={r.by_service.slice(0, 8)} currency={cur} valueKey={money ? "revenue" : "orders"} /> : <p className="py-8 text-center text-[13px] text-muted">No orders in this period.</p>}</div>
        </Card>
        <Card>
          <CardHeader title="Busiest days" description="Orders received by weekday" />
          <div className="flex h-[248px] items-end gap-3 px-5 pb-4 pt-6">
            {dow.map((d) => (
              <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-medium tnum">{d.orders}</span>
                <span className="w-full max-w-10 rounded-t bg-teal-500" style={{ height: `${(d.orders / maxDow) * 150}px`, opacity: d.orders === maxDow ? 1 : 0.55 }} />
                <span className="text-xs text-muted">{d.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Top customers" />
          <Table>
            <thead><tr><Th>Customer</Th><Th className="text-right">Orders</Th>{money && <Th className="text-right">Spent</Th>}</tr></thead>
            <tbody>
              {r.top_customers.map((c) => (
                <tr key={c.id}><Td><Link href={`/app/customers/${c.id}`} className="font-medium hover:text-teal-600">{c.name}</Link></Td><Td className="text-right tnum">{c.orders}</Td>{money && <Td className="text-right font-medium tnum">{formatMoney(c.revenue, cur)}</Td>}</tr>
              ))}
              {!r.top_customers.length && <tr><Td colSpan={3} className="py-8 text-center text-muted">No customers in this period.</Td></tr>}
            </tbody>
          </Table>
        </Card>
        <div className="grid gap-5">
          <Card>
            <CardHeader title="By branch" />
            <ul className="divide-y divide-line">
              {r.by_branch.map((b) => (
                <li key={b.name} className="flex justify-between px-4 py-2.5 text-[13px]"><span className="font-medium">{b.name}</span><span className="text-muted tnum">{b.orders} orders{money ? `, ${formatMoney(b.revenue, cur)}` : ""}</span></li>
              ))}
            </ul>
          </Card>
          {money && r.by_method && (
            <Card>
              <CardHeader title="Collected by method" />
              <ul className="divide-y divide-line">
                {r.by_method.map((m) => (
                  <li key={m.method} className="flex justify-between px-4 py-2.5 text-[13px]"><span className="font-medium">{METHOD_LABEL[m.method] ?? m.method}</span><span className="text-muted tnum">{formatMoney(m.amount, cur)}</span></li>
                ))}
                {!r.by_method.length && <li className="px-4 py-6 text-center text-[13px] text-muted">No payments in this period.</li>}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
