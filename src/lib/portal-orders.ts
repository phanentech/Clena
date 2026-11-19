import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PortalStage = { id: string; name: string; color: string; position: number; is_terminal: boolean; workflow_id: string };
export type PortalOrder = {
  id: string; order_number: string; created_at: string; expected_at: string | null; pickup_at: string | null;
  current_stage_id: string; workflow_id: string; total: number; amount_paid: number; currency: string;
  payment_status: string; cancelled_at: string | null; pickup_required: boolean; delivery_required: boolean;
  items: { description: string; quantity: number; pricing_model: string }[];
  stages: PortalStage[]; stageIndex: number; stageName: string; done: boolean;
};

/**
 * Orders of the signed-in customer. Row Level Security limits this to their own
 * orders, and customers only ever see the stages the business marked as visible.
 */
export async function getMyOrders(tenantId: string, opts: { limit?: number; ids?: string[] } = {}): Promise<PortalOrder[]> {
  const supabase = await createClient();
  let q = supabase
    .from("orders")
    .select("id, order_number, created_at, expected_at, pickup_at, current_stage_id, workflow_id, total, amount_paid, currency, payment_status, cancelled_at, pickup_required, delivery_required, order_items(description, quantity, pricing_model), order_status_history(to_stage_id, created_at)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 60);
  if (opts.ids) q = q.in("id", opts.ids);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const wfIds = [...new Set((data ?? []).map((o) => o.workflow_id))];
  const { data: stages } = wfIds.length
    ? await supabase.from("workflow_stages").select("id, name, color, position, is_terminal, workflow_id").in("workflow_id", wfIds).order("position")
    : { data: [] as PortalStage[] };
  const byWf = new Map<string, PortalStage[]>();
  for (const s of stages ?? []) byWf.set(s.workflow_id, [...(byWf.get(s.workflow_id) ?? []), s as PortalStage]);

  return (data ?? []).map((o) => {
    const list = byWf.get(o.workflow_id) ?? [];
    let idx = list.findIndex((s) => s.id === o.current_stage_id);
    if (idx < 0) {
      // current stage is internal: show the furthest visible stage reached so far
      const reached = new Set((o.order_status_history ?? []).map((h) => h.to_stage_id));
      idx = list.reduce((acc, s, i) => (reached.has(s.id) ? i : acc), 0);
    }
    const stage = list[idx];
    return {
      ...o,
      total: Number(o.total), amount_paid: Number(o.amount_paid),
      items: (o.order_items ?? []).map((i) => ({ ...i, quantity: Number(i.quantity) })),
      stages: list, stageIndex: Math.max(idx, 0), stageName: stage?.name ?? "Received",
      done: Boolean(stage?.is_terminal) || Boolean(o.cancelled_at),
    } as PortalOrder;
  });
}

export function itemSummary(items: PortalOrder["items"]) {
  if (!items.length) return "";
  const kg = items.filter((i) => i.pricing_model === "per_kg").reduce((s, i) => s + i.quantity, 0);
  const pieces = items.filter((i) => i.pricing_model === "per_item").reduce((s, i) => s + i.quantity, 0);
  const parts = [kg ? `${kg} kg` : null, pieces ? `${pieces} item${pieces === 1 ? "" : "s"}` : null].filter(Boolean);
  return parts.length ? parts.join(" + ") : `${items.length} service${items.length === 1 ? "" : "s"}`;
}
