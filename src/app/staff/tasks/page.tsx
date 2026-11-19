import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, Truck } from "lucide-react";
import { OpsShell, staffNav } from "@/components/ops/shell";
import { OpsOrderRow } from "@/components/ops/order-row";
import { Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/session";
import { INCIDENT_KINDS } from "@/lib/ops-shared";
import { formatDateTime } from "@/lib/utils";
import { ordersByIds, staffContext } from "../data";

export const metadata: Metadata = { title: "My tasks", robots: { index: false } };

/** Work assigned to me: orders, incidents to resolve, and driver jobs if I drive. */
export default async function MyTasks() {
  const ctx = await staffContext();
  const { membership, memberId, stages, tz } = ctx;
  const supabase = await createClient();
  const none = "00000000-0000-0000-0000-000000000000";
  const [{ data: mine }, { data: incidents }] = await Promise.all([
    supabase.from("orders").select("id").eq("tenant_id", membership.tenantId).eq("assigned_member_id", memberId ?? none).is("cancelled_at", null).is("completed_at", null).limit(50),
    supabase.from("incidents").select("id, kind, description, created_at, order_id, orders(order_number)").eq("tenant_id", membership.tenantId)
      .eq("assigned_member_id", memberId ?? none).neq("status", "resolved").order("created_at"),
  ]);
  const orders = await ordersByIds(membership.tenantId, (mine ?? []).map((o) => o.id), stages);

  return (
    <OpsShell business={membership.tenantName} role={membership.roleName} nav={staffNav({ exceptions: ctx.counts.exceptions, mine: ctx.mine })}>
      <h1 className="mb-3 text-[20px] font-semibold">My tasks</h1>
      {can(membership, "logistics.view") && (
        <Link href="/driver" className="mb-3 flex items-center gap-3 rounded-xl border border-line bg-surface p-3.5 text-[14px] font-semibold"><Truck className="size-5 text-teal-600" />Open my driver jobs</Link>
      )}
      {(incidents ?? []).length > 0 && (
        <Card className="mb-3">
          <CardHeader title="Incidents assigned to me" />
          <ul className="divide-y divide-line">
            {(incidents ?? []).map((i) => (
              <li key={i.id}>
                <Link href={i.order_id ? `/staff/orders/${i.order_id}` : "/staff/exceptions"} className="block px-4 py-3 text-[13px]">
                  <p className="font-semibold">{INCIDENT_KINDS[i.kind]?.label} {(i.orders as unknown as { order_number: string } | null)?.order_number && `· ${(i.orders as unknown as { order_number: string }).order_number}`}</p>
                  <p className="text-muted">{i.description}</p>
                  <p className="text-xs text-faint">{formatDateTime(i.created_at)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {orders.length === 0 && !(incidents ?? []).length ? (
        <Card><EmptyState icon={<CheckCircle2 />} title="Nothing assigned to you" description="Your manager assigns orders and incidents to you. Use the queues for shared work." /></Card>
      ) : <ul className="grid gap-2.5">{orders.map((o) => <li key={o.id}><OpsOrderRow o={o} tz={tz} /></li>)}</ul>}
    </OpsShell>
  );
}
