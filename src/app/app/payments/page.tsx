import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { Badge, Card, EmptyState, OrderTag, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/app/pagination";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/session";
import { formatDateTime, formatMoney, nowMs } from "@/lib/utils";

export const metadata: Metadata = { title: "Payments" };
const PAGE_SIZE = 30;
const METHOD_LABEL: Record<string, string> = { cash: "Cash", bank_transfer: "Bank transfer", pos: "POS", manual: "Manual", paystack: "Paystack", flutterwave: "Flutterwave" };
const RANGE_DAYS: Record<string, number> = { "7": 7, "30": 30, "90": 90, "365": 365 };
type One<T> = T | T[] | null;
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ method?: string; days?: string; page?: string }> }) {
  const { membership } = await requireTenant("payments.view");
  const sp = await searchParams;
  const method = sp.method && sp.method in METHOD_LABEL ? sp.method : "";
  const days = sp.days && sp.days in RANGE_DAYS ? sp.days : "30";
  const page = Math.max(1, Number(sp.page) || 1);
  const since = new Date(nowMs() - RANGE_DAYS[days] * 86_400_000).toISOString();
  const supabase = await createClient();

  let list = supabase.from("payments")
    .select("id, amount, currency, method, status, reference, created_at, note, orders(id, order_number), customers(full_name)", { count: "exact" })
    .eq("tenant_id", membership.tenantId).gte("created_at", since).order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (method) list = list.eq("method", method);
  let sums = supabase.from("payments").select("amount, method").eq("tenant_id", membership.tenantId).eq("status", "successful").gte("created_at", since);
  if (method) sums = sums.eq("method", method);

  const [{ data: payments, count, error }, { data: all }, { data: tenant }, { data: outstanding }] = await Promise.all([
    list, sums,
    supabase.from("tenants").select("currency").eq("id", membership.tenantId).single(),
    supabase.from("orders").select("total, amount_paid").eq("tenant_id", membership.tenantId).in("payment_status", ["unpaid", "partially_paid"]).is("cancelled_at", null),
  ]);
  if (error) throw new Error(error.message);
  const cur = tenant?.currency ?? "NGN";
  const total = (all ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const byMethod = new Map<string, number>();
  (all ?? []).forEach((p) => byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + Number(p.amount)));
  const owed = (outstanding ?? []).reduce((s, o) => s + Number(o.total) - Number(o.amount_paid), 0);

  return (
    <>
      <PageHeader title="Payments" description="Every payment recorded against an order. Online payments appear once the provider confirms them." />

      <Card className="mb-5 grid divide-y divide-line sm:grid-cols-[1fr_1fr_2fr] sm:divide-x sm:divide-y-0">
        <div className="px-4 py-4"><p className="text-xs text-muted">Collected, last {days} days</p><p className="mt-1 text-[22px] font-semibold tnum">{formatMoney(total, cur)}</p></div>
        <div className="px-4 py-4"><p className="text-xs text-muted">Owed by customers now</p><p className="mt-1 text-[22px] font-semibold tnum text-warning-600">{formatMoney(owed, cur)}</p></div>
        <div className="px-4 py-4">
          <p className="text-xs text-muted">By method</p>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-subtle">
            {[...byMethod.entries()].sort((a, b) => b[1] - a[1]).map(([m, v], i) => (
              <span key={m} style={{ width: `${(v / (total || 1)) * 100}%`, backgroundColor: ["#0B1B33", "#1E88A8", "#12C08A", "#8794A6", "#B26A00", "#4F3B8A"][i % 6] }} title={METHOD_LABEL[m]} />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted tnum">
            {[...byMethod.entries()].sort((a, b) => b[1] - a[1]).map(([m, v], i) => (
              <li key={m} className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ backgroundColor: ["#0B1B33", "#1E88A8", "#12C08A", "#8794A6", "#B26A00", "#4F3B8A"][i % 6] }} />{METHOD_LABEL[m]} {Math.round((v / (total || 1)) * 100)}%</li>
            ))}
          </ul>
        </div>
      </Card>

      <Card>
        <form method="get" className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Select name="days" defaultValue={days} className="w-40" aria-label="Period">
            <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option>
          </Select>
          <Select name="method" defaultValue={method} className="w-44" aria-label="Method">
            <option value="">All methods</option>
            {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Button type="submit" variant="outline">Apply</Button>
          <span className="ml-auto text-xs text-muted tnum">{count ?? 0} payments</span>
        </form>
        {!payments?.length ? (
          <EmptyState icon={<Wallet />} title="No payments in this period" description="Record cash, transfer or POS payments from an order's page." />
        ) : (
          <Table>
            <thead><tr><Th>Date</Th><Th>Customer</Th><Th className="hidden md:table-cell">Order</Th><Th className="hidden sm:table-cell">Method</Th><Th className="hidden lg:table-cell">Reference</Th><Th className="text-right">Amount</Th></tr></thead>
            <tbody>
              {payments.map((p) => {
                const o = one(p.orders as One<{ id: string; order_number: string }>);
                return (
                  <tr key={p.id} className="hover:bg-canvas/60">
                    <Td className="whitespace-nowrap text-muted tnum">{formatDateTime(p.created_at)}</Td>
                    <Td className="font-medium">{one(p.customers as One<{ full_name: string }>)?.full_name ?? "—"}</Td>
                    <Td className="hidden md:table-cell">{o ? <OrderTag number={o.order_number} href={`/app/orders/${o.id}`} /> : "—"}</Td>
                    <Td className="hidden sm:table-cell">{METHOD_LABEL[p.method]}</Td>
                    <Td className="hidden text-xs text-muted lg:table-cell">{p.reference}</Td>
                    <Td className="text-right">
                      <span className="font-semibold tnum">{formatMoney(p.amount, p.currency)}</span>
                      {p.status !== "successful" && <Badge tone={p.status === "failed" ? "danger" : "warning"} className="ml-2">{p.status}</Badge>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} params={{ method, days }} />
      </Card>
    </>
  );
}
