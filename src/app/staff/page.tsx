import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { PortalShell } from "@/components/app/portal-shell";
import { Card, EmptyState, StageBadge } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { can, requireTenant } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/utils";
import { NextStageButton } from "./next-stage";

export const metadata: Metadata = { title: "My tasks", robots: { index: false } };

/** Task-first staff view: active orders, one tap to move to the next stage. */
export default async function StaffHome() {
  const { membership } = await requireTenant("orders.view");
  const supabase = await createClient();
  const { data: stages } = await supabase
    .from("workflow_stages")
    .select("id, name, color, position, is_terminal, workflow_id, allowed_roles")
    .eq("tenant_id", membership.tenantId)
    .order("position");
  const activeStageIds = (stages ?? []).filter((s) => !s.is_terminal).map((s) => s.id);
  const { data: orders, error } = activeStageIds.length
    ? await supabase.from("orders")
        .select("id, order_number, expected_at, current_stage_id, workflow_id, customers(full_name), order_items(description, quantity)")
        .eq("tenant_id", membership.tenantId).in("current_stage_id", activeStageIds).is("cancelled_at", null)
        .order("expected_at", { ascending: true, nullsFirst: false }).limit(100)
    : { data: [], error: null };
  if (error) throw new Error(error.message);
  const byId = new Map((stages ?? []).map((s) => [s.id, s]));
  const canMove = can(membership, "orders.update_status") || can(membership, "orders.manage");

  return (
    <PortalShell title="Today's work" subtitle={`${membership.tenantName} · ${orders.length} active order${orders.length === 1 ? "" : "s"}`}>
      {orders.length === 0 ? (
        <Card><EmptyState icon={<CheckCircle2 />} title="All caught up" description="No active orders right now." /></Card>
      ) : (
        <ul className="grid gap-3">
          {orders.map((o) => {
            const stage = byId.get(o.current_stage_id)!;
            const next = (stages ?? []).find((s) => s.workflow_id === o.workflow_id && s.position === stage.position + 1);
            const allowed = next && (next.allowed_roles.length === 0 || next.allowed_roles.includes(membership.roleKey));
            const overdue = o.expected_at && new Date(o.expected_at) < new Date();
            const items = o.order_items as unknown as { description: string; quantity: number }[];
            return (
              <li key={o.id}>
                <Card className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/app/orders/${o.id}`} className="font-semibold">{o.order_number}</Link>
                      <p className="truncate text-sm text-muted">{(o.customers as unknown as { full_name: string } | null)?.full_name}</p>
                    </div>
                    <StageBadge name={stage.name} color={stage.color} />
                  </div>
                  <p className="mt-2 text-sm">{items.map((i) => `${Number(i.quantity)} × ${i.description}`).join(", ")}</p>
                  {o.expected_at && <p className={`mt-1 text-xs ${overdue ? "font-semibold text-danger-600" : "text-muted"}`}>Due {formatDateTime(o.expected_at)}</p>}
                  {canMove && next && allowed && <div className="mt-3"><NextStageButton orderId={o.id} stageId={next.id} label={`Move to ${next.name}`} /></div>}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </PortalShell>
  );
}
