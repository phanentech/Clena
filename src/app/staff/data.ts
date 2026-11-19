import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/session";
import { getStages, hasLaundryOps, myMemberId, queueCounts } from "@/lib/ops";
import type { OpsOrder } from "@/components/ops/order-row";

export async function staffContext() {
  const { user, membership } = await requireTenant("orders.view");
  const [module, stages, memberId] = await Promise.all([hasLaundryOps(membership.tenantId), getStages(membership.tenantId), myMemberId(membership.tenantId, user.id)]);
  const supabase = await createClient();
  const [{ data: t }, counts, { count: mine }] = await Promise.all([
    supabase.from("tenants").select("timezone").eq("id", membership.tenantId).single(),
    module ? queueCounts(membership.tenantId) : Promise.resolve({} as Record<string, number>),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("tenant_id", membership.tenantId)
      .eq("assigned_member_id", memberId ?? "00000000-0000-0000-0000-000000000000").is("cancelled_at", null).is("completed_at", null),
  ]);
  return { user, membership, memberId, module, stages, tz: t?.timezone ?? "Africa/Lagos", counts, mine: mine ?? 0 };
}

const ORDER_COLS = "id, order_number, expected_at, is_express, on_hold, pickup_required, received_item_count, received_weight_kg, current_stage_id, customers(full_name), order_bags(released_at)";

export async function ordersInStages(tenantId: string, stageIds: string[], stages: { id: string; name: string; color: string; key: string }[], limit = 80) {
  if (!stageIds.length) return [] as OpsOrder[];
  const supabase = await createClient();
  const { data, error } = await supabase.from("orders").select(ORDER_COLS).eq("tenant_id", tenantId).in("current_stage_id", stageIds)
    .is("cancelled_at", null).order("is_express", { ascending: false }).order("expected_at", { ascending: true, nullsFirst: false }).limit(limit);
  if (error) throw new Error(error.message);
  const byId = new Map(stages.map((s) => [s.id, s]));
  return (data ?? []).map((o) => ({ ...o, customers: o.customers as unknown as OpsOrder["customers"], stage: byId.get(o.current_stage_id)! })) as OpsOrder[];
}

export async function ordersByIds(tenantId: string, ids: string[], stages: { id: string; name: string; color: string; key: string }[]) {
  if (!ids.length) return [] as OpsOrder[];
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select(ORDER_COLS).eq("tenant_id", tenantId).in("id", ids);
  const byId = new Map(stages.map((s) => [s.id, s]));
  return (data ?? []).map((o) => ({ ...o, customers: o.customers as unknown as OpsOrder["customers"], stage: byId.get(o.current_stage_id)! })) as OpsOrder[];
}
