import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Truck } from "lucide-react";
import { AssignSelect, RescheduleForm, RouteOrder } from "@/components/ops/manage";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Tabs } from "@/components/ui/primitives";
import { requireTenant } from "@/lib/auth/session";
import { hasLaundryOps, memberNames } from "@/lib/ops";
import { FAILED_REASONS, JOB_STATUS } from "@/lib/ops-shared";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, nowMs } from "@/lib/utils";

export const metadata: Metadata = { title: "Dispatch" };

type J = { id: string; kind: "pickup" | "delivery"; status: string; attempt: number; driver_member_id: string | null; route_seq: number | null; scheduled_start: string | null;
  order_id: string; order_number: string; customer_name: string; customer_phone: string | null; address: string | null; zone_name: string | null; amount_due: number | null; failed_reason: string | null; failed_note: string | null };

export default async function DispatchPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { membership } = await requireTenant("logistics.manage");
  if (!(await hasLaundryOps(membership.tenantId))) notFound();
  const { view = "today" } = await searchParams;
  const supabase = await createClient();
  const { data: t } = await supabase.from("tenants").select("timezone, currency").eq("id", membership.tenantId).single();
  const tz = t?.timezone ?? "Africa/Lagos";
  const end = new Date(); end.setHours(23, 59, 59, 999);
  let q = supabase.from("delivery_jobs").select("id, kind, status, attempt, driver_member_id, route_seq, scheduled_start, order_id, order_number, customer_name, customer_phone, address, zone_name, amount_due, failed_reason, failed_note")
    .eq("tenant_id", membership.tenantId);
  if (view === "failed") q = q.eq("status", "failed").gte("completed_at", new Date(nowMs() - 7 * 864e5).toISOString());
  else if (view === "upcoming") q = q.in("status", ["unassigned", "assigned"]).gt("scheduled_start", end.toISOString());
  else q = q.in("status", ["unassigned", "assigned", "en_route"]).or(`scheduled_start.is.null,scheduled_start.lte.${end.toISOString()}`);
  const [{ data }, names, { data: avail }, { count: failedCount }] = await Promise.all([
    q.order("route_seq", { ascending: true, nullsFirst: false }).order("scheduled_start", { ascending: true }).limit(200),
    memberNames(membership.tenantId),
    supabase.from("driver_status").select("member_id, is_available").eq("tenant_id", membership.tenantId),
    supabase.from("delivery_jobs").select("id", { count: "exact", head: true }).eq("tenant_id", membership.tenantId).eq("status", "failed").gte("completed_at", new Date(nowMs() - 7 * 864e5).toISOString()),
  ]);
  const jobs = (data ?? []) as J[];
  const online = new Map((avail ?? []).map((a) => [a.member_id, a.is_available]));
  const drivers = [...names.entries()]
    .filter(([, m]) => ["driver", "owner", "manager", "ops_manager", "supervisor"].includes(m.role))
    .map(([id, m]) => ({ id, name: m.name, role: m.role, available: Boolean(online.get(id)) }))
    .sort((a, b) => Number(b.role === "driver") - Number(a.role === "driver") || Number(b.available) - Number(a.available));
  const when = (v: string | null) => (v ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(v)) : "Any time");
  const localNext = (() => { const d = new Date(nowMs() + 864e5); const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); return `${p}T10:00`; })();

  // group by driver for the route view
  const groups = new Map<string, J[]>();
  for (const j of jobs) { const k = j.driver_member_id ?? "unassigned"; groups.set(k, [...(groups.get(k) ?? []), j]); }
  const order = ["unassigned", ...drivers.map((d) => d.id)].filter((k) => groups.has(k));

  return (
    <>
      <PageHeader title="Dispatch" description="Assign pickups and deliveries, set the order of each route and reschedule failed attempts." />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <Tabs active={view} items={[{ key: "today", label: "Today", href: "/app/dispatch" }, { key: "upcoming", label: "Upcoming", href: "/app/dispatch?view=upcoming" }, { key: "failed", label: "Failed", href: "/app/dispatch?view=failed", count: failedCount }]} />
      </div>
      <Card className="mb-5">
        <CardHeader title="Drivers" description={`${drivers.filter((d) => d.available).length} available now`} />
        <div className="flex flex-wrap gap-2 p-4 pt-0">
          {drivers.length === 0 && <p className="text-sm text-muted">Invite a team member with the Driver role from Team.</p>}
          {drivers.map((d) => (
            <span key={d.id} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[13px]">
              <span className={`size-2 rounded-full ${d.available ? "bg-brand-500" : "bg-line-strong"}`} />{d.name}
              <span className="text-xs text-muted">{(groups.get(d.id) ?? []).length} job{(groups.get(d.id) ?? []).length === 1 ? "" : "s"}</span>
            </span>
          ))}
        </div>
      </Card>
      {jobs.length === 0 ? <Card><EmptyState icon={<Truck />} title={view === "failed" ? "No failed attempts this week" : "Nothing to dispatch"} /></Card> : view === "failed" ? (
        <div className="grid gap-3">
          {jobs.map((j) => (
            <Card key={j.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold capitalize">{j.kind} · <Link href={`/app/orders/${j.order_id}`} className="text-teal-600">{j.order_number}</Link> · attempt {j.attempt}</p>
                  <p className="text-sm text-muted">{j.customer_name} · {j.address}</p>
                  <p className="mt-1 text-sm"><Badge tone="danger">{FAILED_REASONS[j.failed_reason ?? "other"]}</Badge> {j.failed_note}</p>
                </div>
                <p className="text-xs text-muted">{j.driver_member_id ? names.get(j.driver_member_id)?.name : ""}</p>
              </div>
              <div className="mt-3"><RescheduleForm jobId={j.id} defaultLocal={localNext} /></div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-5">
          {order.map((k) => {
            const list = groups.get(k)!;
            const ids = list.map((j) => j.id);
            return (
              <Card key={k}>
                <CardHeader title={k === "unassigned" ? "Unassigned" : `${names.get(k)?.name ?? "Driver"}'s route`} description={`${list.length} stop${list.length === 1 ? "" : "s"}`} />
                <ul className="divide-y divide-line">
                  {list.map((j, i) => (
                    <li key={j.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                      {k !== "unassigned" ? <RouteOrder ids={ids} index={i} /> : <span className="hidden sm:block" />}
                      <div className="min-w-0 text-[13px]">
                        <p className="font-semibold"><span className="capitalize">{j.kind}</span> · <Link href={`/app/orders/${j.order_id}`} className="text-teal-600">{j.order_number}</Link> <Badge tone={j.status === "en_route" ? "info" : "neutral"} className="ms-1">{JOB_STATUS[j.status]}</Badge></p>
                        <p className="truncate text-muted">{j.customer_name} · {j.address ?? "No address"}{j.zone_name ? ` · ${j.zone_name}` : ""}</p>
                        <p className="text-xs text-faint">{when(j.scheduled_start)}{Number(j.amount_due) > 0 ? ` · collect ${formatMoney(Number(j.amount_due), t?.currency ?? "NGN")}` : ""}</p>
                      </div>
                      <AssignSelect jobId={j.id} value={j.driver_member_id} drivers={drivers} disabled={j.status === "en_route"} />
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
