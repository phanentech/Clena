import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, CalendarClock, CircleDollarSign, Database, Plus, UserPlus } from "lucide-react";
import { Card, CardHeader, Delta, EmptyState, OrderTag, PageHeader, Select, Sparkline, StageBadge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { DailyBars } from "@/components/app/charts";
import { StageBoard } from "@/components/app/stage-board";
import { OpsToday } from "@/components/ops/ops-today";
import { hasLaundryOps, queueCounts } from "@/lib/ops";
import { createClient } from "@/lib/supabase/server";
import { can, requireTenant } from "@/lib/auth/session";
import { cn, formatMoney, nowMs } from "@/lib/utils";
import { loadSampleData } from "../settings/sample-data/actions";
import { fill, getLocale, getMessages } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Dashboard" };

type Metrics = {
  currency: string;
  revenue_today: number | null; revenue_month: number | null; revenue_period: number | null; revenue_prev: number | null;
  orders_today: number; orders_period: number; orders_prev: number; avg_order_value: number | null;
  active_orders: number; completed_orders: number; overdue_orders: number; pending_payments: number | null;
  pending_bookings: number; bookings_today: number; new_customers: number; new_customers_prev: number;
  repeat_customers: number; total_customers: number;
  stage_breakdown: { id: string; name: string; color: string; count: number; is_terminal: boolean }[];
  daily: { day: string; orders: number; revenue: number | null }[];
  top_services: { name: string; orders: number; revenue: number | null }[];
};

const RANGES = { "7d": 7, "30d": 30, "90d": 90 } as const;
type One<T> = T | T[] | null;
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string; branch?: string }> }) {
  const { user, membership } = await requireTenant("dashboard.view");
  const params = await searchParams;
  const range = (params.range && params.range in RANGES ? params.range : "30d") as keyof typeof RANGES;
  const supabase = await createClient();
  const [t, locale] = await Promise.all([getMessages(), getLocale()]);
  const d = t.dashboard;

  const [{ data: branches }, { data: tenant }] = await Promise.all([
    supabase.from("branches").select("id, name").eq("tenant_id", membership.tenantId).order("name"),
    supabase.from("tenants").select("timezone").eq("id", membership.tenantId).single(),
  ]);
  const branch = branches?.find((b) => b.id === params.branch)?.id ?? null;
  const tz = tenant?.timezone ?? "UTC";
  const to = new Date();
  const from = new Date(to.getTime() - RANGES[range] * 86_400_000);

  const { data, error } = await supabase.rpc("dashboard_metrics", { p_tenant: membership.tenantId, p_branch: branch, p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) throw new Error(error.message);
  const m = data as Metrics;
  const money = can(membership, "payments.view");
  const cur = m.currency;
  const nowIso = new Date().toISOString();
  const activeStageIds = m.stage_breakdown.filter((s) => !s.is_terminal).map((s) => s.id);
  const terminalIds = m.stage_breakdown.filter((s) => s.is_terminal).map((s) => s.id);
  const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const today = dayKey(new Date());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scope = (q: any) => (branch ? q.eq("branch_id", branch) : q);
  const [overdue, unpaid, recent, todayBookings] = await Promise.all([
    activeStageIds.length
      ? scope(supabase.from("orders").select("id, order_number, expected_at, customers(full_name)").eq("tenant_id", membership.tenantId)
          .in("current_stage_id", activeStageIds).lt("expected_at", nowIso).is("cancelled_at", null)).order("expected_at").limit(5)
      : Promise.resolve({ data: [] }),
    money && terminalIds.length
      ? scope(supabase.from("orders").select("id, order_number, total, amount_paid, currency, customers(full_name)").eq("tenant_id", membership.tenantId)
          .in("current_stage_id", terminalIds).in("payment_status", ["unpaid", "partially_paid"])).order("completed_at", { ascending: false }).limit(5)
      : Promise.resolve({ data: [] }),
    scope(supabase.from("orders").select("id, order_number, total, currency, payment_status, created_at, current_stage_id, customers(full_name)")
      .eq("tenant_id", membership.tenantId).is("cancelled_at", null)).order("created_at", { ascending: false }).limit(8),
    can(membership, "bookings.view")
      ? scope(supabase.from("bookings").select("id, booking_number, scheduled_start, status, customers(full_name), services(name)")
          .eq("tenant_id", membership.tenantId).gte("scheduled_start", new Date(nowMs() - 30 * 3_600_000).toISOString())
          .lt("scheduled_start", new Date(nowMs() + 30 * 3_600_000).toISOString()).neq("status", "cancelled")).order("scheduled_start").limit(30)
      : Promise.resolve({ data: [] }),
  ]);
  const stageById = new Map(m.stage_breakdown.map((s) => [s.id, s]));
  type Row = { id: string; order_number: string; expected_at: string | null; total: number; amount_paid: number; currency: string; payment_status: string; current_stage_id: string; customers: One<{ full_name: string }> };
  const overdueRows = ((overdue.data ?? []) as Row[]).slice(0, 4);
  const unpaidRows = ((unpaid.data ?? []) as Row[]).slice(0, 4);
  const recentRows = (recent.data ?? []) as Row[];
  type Bk = { id: string; booking_number: string; scheduled_start: string; status: string; customers: One<{ full_name: string }>; services: One<{ name: string }> };
  const todaysBookings = ((todayBookings.data ?? []) as Bk[]).filter((b) => dayKey(new Date(b.scheduled_start)) === today).slice(0, 6);
  const noData = m.total_customers === 0 && m.orders_period === 0 && m.active_orders === 0;
  const firstName = user.fullName?.split(" ")[0];
  const revenueSeries = m.daily.map((d) => Number(d.revenue ?? 0));
  const orderSeries = m.daily.map((d) => d.orders);
  const periodLabel = fill(d.lastDays, { n: RANGES[range] });
  const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));

  const rangeHref = (r: string) => `?range=${r}${branch ? `&branch=${branch}` : ""}`;

  const opsCounts = (await hasLaundryOps(membership.tenantId)) && can(membership, "orders.view") ? await queueCounts(membership.tenantId) : null;
  return (
    <>
      <PageHeader
        title={`${d[greeting(tz)]}${firstName ? `, ${firstName}` : ""}`}
        description={new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(new Date())}
        actions={
          <>
            <div className="flex h-9 items-center rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="Period">
              {Object.keys(RANGES).map((r) => (
                <Link key={r} href={rangeHref(r)} className={cn("flex h-full items-center rounded-md px-2.5 text-xs font-medium", r === range ? "bg-navy-900 text-white" : "text-muted hover:text-ink")}>
                  {fill(d.lastDays, { n: RANGES[r as keyof typeof RANGES] })}
                </Link>
              ))}
            </div>
            {(branches?.length ?? 0) > 1 && (
              <form method="get" className="flex gap-1.5">
                <input type="hidden" name="range" value={range} />
                <Select name="branch" defaultValue={branch ?? ""} className="w-40" aria-label="Branch">
                  <option value="">All branches</option>
                  {branches!.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
                <Button type="submit" variant="outline">Apply</Button>
              </form>
            )}
          </>
        }
      />
      {opsCounts && <OpsToday counts={opsCounts} />}

      {noData && (
        <Card className="mb-5">
          <EmptyState icon={<Database />} title="Your dashboard fills up as you work"
            description="Add a customer and create an order, or load sample data to explore Clena with realistic orders, payments and bookings. Sample data can be removed at any time."
            action={<>
              {can(membership, "settings.manage") && <form action={loadSampleData}><SubmitButton pendingLabel="…">{d.loadSample}</SubmitButton></form>}
              {can(membership, "customers.manage") && <Button asChild variant="outline"><Link href="/app/customers/new"><UserPlus />Add a customer</Link></Button>}
            </>} />
        </Card>
      )}

      {/* KPI strip */}
      <Card className="grid grid-cols-2 divide-line lg:grid-cols-4 lg:divide-x [&>*]:border-line max-lg:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:nth-child(odd)]:border-r">
        {money ? (
          <Kpi label={d.collected} value={formatMoney(m.revenue_period, cur, { decimals: 0 })} delta={<Delta current={Number(m.revenue_period)} previous={Number(m.revenue_prev)} label={d.vsPrevious} />}
            spark={<Sparkline values={revenueSeries} className="text-navy-900" />} />
        ) : (
          <Kpi label={d.activeOrders} value={m.active_orders} delta={<span className="text-xs text-faint">{t.nav.orders}</span>} />
        )}
        <Kpi label={d.orders} value={m.orders_period} delta={<Delta current={m.orders_period} previous={m.orders_prev} label={d.vsPrevious} />}
          spark={<Sparkline values={orderSeries} className="text-teal-500" />} />
        {money ? (
          <Kpi label={d.averageOrder} value={formatMoney(m.avg_order_value, cur, { decimals: 0 })} delta={<span className="text-xs text-faint">{formatMoney(m.pending_payments, cur, { decimals: 0 })} {d.outstanding}</span>} />
        ) : (
          <Kpi label={d.overdue} value={m.overdue_orders} delta={<span className="text-xs text-faint">{d.overdue}</span>} />
        )}
        <Kpi label={d.newCustomers} value={m.new_customers} delta={<Delta current={m.new_customers} previous={m.new_customers_prev} label={d.vsPrevious} />} />
      </Card>

      {/* Stage board */}
      <Card className="mt-5">
        <CardHeader title={d.workInProgress} description={`${m.active_orders} active order${m.active_orders === 1 ? "" : "s"} across your workflow`}
          action={<Link href="/app/orders" className="text-xs font-medium text-teal-600 hover:underline">{t.common.allOrders}</Link>} />
        <div className="p-2"><StageBoard stages={m.stage_breakdown} completedInPeriod={m.completed_orders} periodLabel={`Completed, ${periodLabel.toLowerCase()}`} /></div>
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={money ? d.moneyCollected : d.ordersReceived} description={`${periodLabel}, ${d.byDay}`} />
          <div className="px-3 pb-2 pt-3"><DailyBars data={m.daily} metric={money ? "revenue" : "orders"} currency={cur} height={300} /></div>
        </Card>

        <Card>
          <CardHeader title={d.needsAttention} />
          <ul className="divide-y divide-line">
            {overdueRows.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                <AlertTriangle className="size-4 shrink-0 text-danger-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{one(o.customers)?.full_name}</p>
                  <p className="text-xs text-danger-600">Overdue since {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(o.expected_at!))}</p>
                </div>
                <OrderTag number={o.order_number} href={`/app/orders/${o.id}`} />
              </li>
            ))}
            {unpaidRows.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                <CircleDollarSign className="size-4 shrink-0 text-warning-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{one(o.customers)?.full_name}</p>
                  <p className="text-xs text-warning-600 tnum">Completed, {formatMoney(Number(o.total) - Number(o.amount_paid), o.currency)} unpaid</p>
                </div>
                <OrderTag number={o.order_number} href={`/app/orders/${o.id}`} />
              </li>
            ))}
            {m.pending_bookings > 0 && (
              <li>
                <Link href="/app/bookings?status=pending" className="flex items-center gap-3 px-4 py-2.5 hover:bg-subtle">
                  <CalendarClock className="size-4 shrink-0 text-teal-500" />
                  <p className="flex-1 text-[13px] font-medium">{m.pending_bookings} booking{m.pending_bookings === 1 ? "" : "s"} waiting for confirmation</p>
                </Link>
              </li>
            )}
            {!overdueRows.length && !unpaidRows.length && m.pending_bookings === 0 && (
              <li className="px-4 py-10 text-center text-[13px] text-muted">{d.nothing}</li>
            )}
          </ul>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={d.latestOrders} action={can(membership, "orders.manage") ? <Button asChild size="sm" variant="outline"><Link href="/app/orders/new"><Plus />{t.nav.newOrder}</Link></Button> : undefined} />
          {recentRows.length > 0 ? (
            <ul className="divide-y divide-line">
              {recentRows.map((o) => {
                const s = stageById.get(o.current_stage_id);
                return (
                  <li key={o.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5 sm:grid-cols-[auto_1fr_auto_auto]">
                    <OrderTag number={o.order_number} href={`/app/orders/${o.id}`} />
                    <span className="truncate text-[13px] font-medium">{one(o.customers)?.full_name}</span>
                    <span className="hidden sm:block">{s && <StageBadge name={s.name} color={s.color} />}</span>
                    {money && <span className="text-right text-[13px] font-medium tnum">{formatMoney(o.total, o.currency)}</span>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="px-4 py-10 text-center text-[13px] text-muted">No orders yet.</p>}
        </Card>

        <div className="grid gap-5">
          {can(membership, "bookings.view") && (
            <Card>
              <CardHeader title={d.todaysBookings} description={`${m.bookings_today} scheduled`}
                action={<Link href="/app/bookings" className="text-xs font-medium text-teal-600 hover:underline">{d.calendar}</Link>} />
              {todaysBookings.length > 0 ? (
                <ul className="divide-y divide-line">
                  {todaysBookings.map((b) => (
                    <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-11 text-[13px] font-semibold tnum">{time(b.scheduled_start)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{one(b.customers as One<{ full_name: string }>)?.full_name}</p>
                        <p className="truncate text-xs text-muted">{one(b.services as One<{ name: string }>)?.name}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="px-4 py-8 text-center text-[13px] text-muted">No bookings today.</p>}
            </Card>
          )}
          <Card>
            <CardHeader title={d.topServices} description={periodLabel} />
            {m.top_services.length ? (
              <ul className="divide-y divide-line">
                {m.top_services.map((s) => (
                  <li key={s.name} className="flex items-center justify-between gap-3 px-4 py-2 text-[13px]">
                    <span className="truncate font-medium">{s.name}</span>
                    <span className="shrink-0 text-right text-muted tnum">{money && s.revenue != null ? <span className="font-medium text-ink">{formatMoney(s.revenue, cur, { decimals: 0 })}</span> : null}<span className="ml-2">{s.orders} orders</span></span>
                  </li>
                ))}
              </ul>
            ) : <p className="px-4 py-8 text-center text-[13px] text-muted">No orders in this period.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, delta, spark }: { label: string; value: React.ReactNode; delta: React.ReactNode; spark?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 px-4 py-4">
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="mt-1 truncate text-[22px] font-semibold leading-tight tracking-[-0.01em] tnum">{value}</p>
        <div className="mt-1">{delta}</div>
      </div>
      <div className="hidden shrink-0 sm:block">{spark}</div>
    </div>
  );
}

function greeting(timeZone: string): "morning" | "afternoon" | "evening" {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", timeZone, hour12: false }).format(new Date()));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
