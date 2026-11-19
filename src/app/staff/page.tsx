import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, MapPin, PackageOpen, Phone, Truck } from "lucide-react";
import { OpsShell, staffNav } from "@/components/ops/shell";
import { OpsOrderRow } from "@/components/ops/order-row";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { memberNames } from "@/lib/ops";
import { JOB_STATUS, QUEUES } from "@/lib/ops-shared";
import { cn } from "@/lib/utils";
import { ordersInStages, staffContext } from "./data";

export const metadata: Metadata = { title: "Operations", robots: { index: false } };

/** Work queues: today's jobs, then each processing step in the order work flows. */
export default async function StaffQueues({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await staffContext();
  const { membership, stages, tz, counts, module } = ctx;
  const { q } = await searchParams;

  // Businesses without the laundry module get one tab per active stage.
  const tabs = module
    ? [{ key: "today", label: "Today", count: (counts.pickups_today ?? 0) + (counts.deliveries_today ?? 0) },
       ...QUEUES.map((x) => ({ key: x.key, label: x.label, count: counts[x.countKey] ?? 0 }))]
    : stages.filter((s) => !s.is_terminal).map((s) => ({ key: s.key, label: s.name, count: null as number | null }));
  const active = tabs.find((t) => t.key === q)?.key ?? tabs[0]?.key;

  let body: React.ReactNode;
  if (module && active === "today") {
    const supabase = await createClient();
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const { data: jobs } = await supabase.from("delivery_jobs")
      .select("id, kind, status, order_id, order_number, customer_name, customer_phone, address, zone_name, scheduled_start, driver_member_id, attempt")
      .eq("tenant_id", membership.tenantId).in("status", ["unassigned", "assigned", "en_route"]).lte("scheduled_start", end.toISOString())
      .order("scheduled_start");
    const names = await memberNames(membership.tenantId);
    const time = (v: string | null) => (v ? new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short", timeZone: tz }).format(new Date(v)) : "");
    body = !jobs?.length ? (
      <Card><EmptyState icon={<CheckCircle2 />} title="No pickups or deliveries left today" description="New bookings appear here as they come in." /></Card>
    ) : (
      <ul className="grid gap-2.5">
        {jobs.map((j) => (
          <li key={j.id}>
            <Link href={`/staff/orders/${j.order_id}`} className="block rounded-xl border border-line bg-surface p-3.5 active:bg-subtle">
              <div className="flex items-center gap-2">
                <span className={cn("grid size-8 place-items-center rounded-lg", j.kind === "pickup" ? "bg-teal-50 text-teal-600" : "bg-brand-50 text-brand-700")}>
                  {j.kind === "pickup" ? <PackageOpen className="size-4" /> : <Truck className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold">{j.kind === "pickup" ? "Pickup" : "Delivery"} · {j.order_number}{j.attempt > 1 && ` · attempt ${j.attempt}`}</p>
                  <p className="text-xs text-muted">{time(j.scheduled_start)}</p>
                </div>
                <Badge tone={j.status === "unassigned" ? "warning" : j.status === "en_route" ? "info" : "neutral"}>{JOB_STATUS[j.status]}</Badge>
              </div>
              <p className="mt-2 text-[13.5px] font-medium">{j.customer_name}</p>
              <p className="mt-0.5 flex items-start gap-1 text-xs text-muted"><MapPin className="mt-0.5 size-3.5 shrink-0" />{j.address}{j.zone_name && ` · ${j.zone_name}`}</p>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="text-muted">{j.driver_member_id ? `Driver: ${names.get(j.driver_member_id)?.name ?? "—"}` : "No driver yet"}</span>
                {j.customer_phone && <span className="inline-flex items-center gap-1 text-teal-600"><Phone className="size-3.5" />{j.customer_phone}</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    );
  } else {
    const keys = module ? QUEUES.find((x) => x.key === active)?.stages ?? [] : [active];
    const ids = stages.filter((s) => keys.includes(s.key)).map((s) => s.id);
    let orders = await ordersInStages(membership.tenantId, ids, stages);
    // pickup orders not yet collected belong to the driver, not the receiving desk
    if (module && active === "receiving") orders = orders.filter((o) => o.stage.key === "picked_up" || !o.pickup_required);
    body = orders.length === 0
      ? <Card><EmptyState icon={<CheckCircle2 />} title="Nothing in this queue" description="All caught up." /></Card>
      : <ul className="grid gap-2.5">{orders.map((o) => <li key={o.id}><OpsOrderRow o={o} tz={tz} /></li>)}</ul>;
  }

  return (
    <OpsShell business={membership.tenantName} role={membership.roleName} nav={staffNav({ exceptions: counts.exceptions, mine: ctx.mine })}>
      <div className="-mx-3 mb-4 flex gap-2 overflow-x-auto px-3 pb-1" role="tablist" aria-label="Queues">
        {tabs.map((t) => (
          <Link key={t.key} href={`/staff?q=${t.key}`} role="tab" aria-selected={t.key === active}
            className={cn("flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[13px] font-semibold",
              t.key === active ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface text-muted")}>
            {t.label}
            {t.count != null && <span className={cn("rounded-full px-1.5 text-[11px] tnum", t.key === active ? "bg-white/20" : "bg-subtle")}>{t.count}</span>}
          </Link>
        ))}
      </div>
      {body}
    </OpsShell>
  );
}
