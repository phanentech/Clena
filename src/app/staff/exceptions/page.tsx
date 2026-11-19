import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { OpsShell, staffNav } from "@/components/ops/shell";
import { OpsOrderRow } from "@/components/ops/order-row";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { INCIDENT_KINDS } from "@/lib/ops-shared";
import { formatDateTime } from "@/lib/utils";
import { ordersByIds, staffContext } from "../data";

export const metadata: Metadata = { title: "Exceptions", robots: { index: false } };

/** Orders needing intervention: frozen, with open incidents, or overdue. */
export default async function Exceptions() {
  const ctx = await staffContext();
  const { membership, stages, tz } = ctx;
  const supabase = await createClient();
  const active = stages.filter((s) => !s.is_terminal).map((s) => s.id);
  const [{ data: incidents }, { data: late }, { data: frozen }] = await Promise.all([
    supabase.from("incidents").select("id, kind, severity, description, source, created_at, order_id, orders(order_number)").eq("tenant_id", membership.tenantId)
      .neq("status", "resolved").order("created_at", { ascending: false }).limit(60),
    supabase.from("orders").select("id").eq("tenant_id", membership.tenantId).in("current_stage_id", active).is("cancelled_at", null).lt("expected_at", new Date().toISOString()).limit(60),
    supabase.from("orders").select("id").eq("tenant_id", membership.tenantId).eq("on_hold", true).limit(60),
  ]);
  const ids = [...new Set([...(frozen ?? []).map((o) => o.id), ...(late ?? []).map((o) => o.id)])];
  const orders = await ordersByIds(membership.tenantId, ids, stages);

  return (
    <OpsShell business={membership.tenantName} role={membership.roleName} nav={staffNav({ exceptions: ctx.counts.exceptions, mine: ctx.mine })}>
      <h1 className="mb-3 text-[20px] font-semibold">Exceptions</h1>
      <Card className="mb-3">
        <CardHeader title="Open incidents" description={`${incidents?.length ?? 0} need a decision`} />
        {!incidents?.length ? <EmptyState icon={<CheckCircle2 />} title="No open incidents" /> : (
          <ul className="divide-y divide-line">
            {incidents.map((i) => (
              <li key={i.id}>
                <Link href={i.order_id ? `/staff/orders/${i.order_id}` : "#"} className="block px-4 py-3 text-[13px] active:bg-subtle">
                  <div className="flex items-center gap-2">
                    <p className="flex-1 font-semibold">{INCIDENT_KINDS[i.kind]?.label}{(i.orders as unknown as { order_number: string } | null) && ` · ${(i.orders as unknown as { order_number: string }).order_number}`}</p>
                    <Badge tone={i.severity === "high" ? "danger" : i.severity === "medium" ? "warning" : "neutral"}>{i.severity}</Badge>
                  </div>
                  <p className="mt-0.5 text-muted">{i.description}</p>
                  <p className="text-xs text-faint">{i.source === "customer" ? "From customer · " : i.source === "system" ? "Automatic · " : ""}{formatDateTime(i.created_at)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <h2 className="mb-2 mt-5 text-[15px] font-semibold">Frozen or overdue orders</h2>
      {orders.length === 0 ? <Card><EmptyState icon={<CheckCircle2 />} title="None" description="No frozen or overdue orders." /></Card>
        : <ul className="grid gap-2.5">{orders.map((o) => <li key={o.id}><OpsOrderRow o={o} tz={tz} /></li>)}</ul>}
    </OpsShell>
  );
}
