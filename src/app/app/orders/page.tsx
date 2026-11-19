import Link from "next/link";
import type { Metadata } from "next";
import { ClipboardList, Plus } from "lucide-react";
import { Badge, Card, EmptyState, OrderTag, PageHeader, StageBadge, Table, Td, Th } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/app/pagination";
import { createClient } from "@/lib/supabase/server";
import { can, requireTenant } from "@/lib/auth/session";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";
import { PAYMENT_LABEL, PAYMENT_TONE, type PaymentStatus } from "@/lib/orders";

export const metadata: Metadata = { title: "Orders" };
const PAGE_SIZE = 30;
type One<T> = T | T[] | null;
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ stage?: string; page?: string; pay?: string }> }) {
  const { membership } = await requireTenant("orders.view");
  const { stage, page: pageParam, pay } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const supabase = await createClient();
  const money = can(membership, "payments.view");

  const { data: stages } = await supabase.from("workflow_stages")
    .select("id, name, color, position, is_terminal, workflows!inner(is_default, applies_to)")
    .eq("tenant_id", membership.tenantId).eq("workflows.is_default", true).eq("workflows.applies_to", "order").order("position");
  const counts = await Promise.all((stages ?? []).map((s) =>
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("tenant_id", membership.tenantId).eq("current_stage_id", s.id).is("cancelled_at", null)));
  const activeIds = (stages ?? []).filter((s) => !s.is_terminal).map((s) => s.id);
  const activeTotal = counts.reduce((n, c, i) => n + (stages![i].is_terminal ? 0 : c.count ?? 0), 0);

  const view = stage === "all" ? "all" : stage && stages?.some((s) => s.id === stage) ? stage : "active";
  let query = supabase.from("orders")
    .select("id, order_number, total, amount_paid, currency, payment_status, expected_at, created_at, completed_at, current_stage_id, is_demo, customers(full_name, phone), branches(name)", { count: "exact" })
    .eq("tenant_id", membership.tenantId).is("cancelled_at", null).order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (view === "active" && activeIds.length) query = query.in("current_stage_id", activeIds);
  else if (view !== "all" && view !== "active") query = query.eq("current_stage_id", view);
  if (pay === "unpaid" && money) query = query.in("payment_status", ["unpaid", "partially_paid"]);
  const { data: orders, count, error } = await query;
  if (error) throw new Error(error.message);
  const stageById = new Map((stages ?? []).map((s) => [s.id, s]));
  const href = (s: string, p?: string) => `/app/orders?stage=${s}${p ? `&pay=${p}` : ""}`;

  return (
    <>
      <PageHeader title="Orders" description={`${activeTotal} in progress`}
        actions={can(membership, "orders.manage") && <Button asChild><Link href="/app/orders/new"><Plus />New order</Link></Button>} />

      <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {[
          { key: "active", label: "In progress", count: activeTotal, color: null },
          ...(stages ?? []).map((s, i) => ({ key: s.id, label: s.name, count: counts[i].count ?? 0, color: s.color })),
          { key: "all", label: "All orders", count: null, color: null },
        ].map((t) => (
          <Link key={t.key} href={href(t.key, pay)}
            className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium",
              view === t.key ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface text-muted hover:text-ink")}>
            {t.color && <span className="size-1.5 rounded-full" style={{ backgroundColor: t.color }} />}
            {t.label}
            {t.count != null && <span className={cn("tnum", view === t.key ? "text-white/70" : "text-faint")}>{t.count}</span>}
          </Link>
        ))}
      </div>

      <Card>
        {money && (
          <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-xs">
            <span className="text-muted">Payment:</span>
            <Link href={href(view)} className={cn("rounded px-2 py-1 font-medium", pay !== "unpaid" ? "bg-subtle text-ink" : "text-muted")}>Any</Link>
            <Link href={href(view, "unpaid")} className={cn("rounded px-2 py-1 font-medium", pay === "unpaid" ? "bg-subtle text-ink" : "text-muted")}>Not fully paid</Link>
            <span className="ml-auto text-muted tnum">{count ?? 0} orders</span>
          </div>
        )}
        {orders.length === 0 ? (
          <EmptyState icon={<ClipboardList />} title="No orders here" description="Orders move through your workflow stages. Try another stage or create an order."
            action={can(membership, "orders.manage") ? <Button asChild><Link href="/app/orders/new"><Plus />New order</Link></Button> : undefined} />
        ) : (
          <Table>
            <thead><tr><Th>Order</Th><Th>Customer</Th><Th className="hidden md:table-cell">Stage</Th><Th className="hidden lg:table-cell">Due</Th>{money && <Th className="text-right">Total</Th>}</tr></thead>
            <tbody>
              {orders.map((o) => {
                const s = stageById.get(o.current_stage_id);
                const overdue = !o.completed_at && o.expected_at && new Date(o.expected_at) < new Date();
                const c = one(o.customers as One<{ full_name: string; phone: string | null }>);
                return (
                  <tr key={o.id} className="hover:bg-canvas/60">
                    <Td className="w-36"><OrderTag number={o.order_number} href={`/app/orders/${o.id}`} /><p className="mt-1 text-[11.5px] text-faint tnum">{formatDateTime(o.created_at)}</p></Td>
                    <Td>
                      <Link href={`/app/orders/${o.id}`} className="font-medium hover:text-teal-600">{c?.full_name}</Link>
                      <p className="text-xs text-muted">{one(o.branches as One<{ name: string }>)?.name}{o.is_demo ? ", sample" : ""}</p>
                      <div className="mt-1 md:hidden">{s && <StageBadge name={s.name} color={s.color} />}</div>
                    </Td>
                    <Td className="hidden md:table-cell">{s && <StageBadge name={s.name} color={s.color} />}</Td>
                    <Td className={cn("hidden tnum lg:table-cell", overdue ? "font-medium text-danger-600" : "text-muted")}>{o.completed_at ? "Done" : o.expected_at ? formatDateTime(o.expected_at) : "—"}</Td>
                    {money && (
                      <Td className="text-right">
                        <p className="font-semibold tnum">{formatMoney(o.total, o.currency)}</p>
                        <Badge tone={PAYMENT_TONE[o.payment_status as PaymentStatus]} className="mt-0.5">{PAYMENT_LABEL[o.payment_status as PaymentStatus]}</Badge>
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} params={{ stage: view, pay }} />
      </Card>
    </>
  );
}
