import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/session";
import { myMemberId } from "@/lib/ops";
import type { OpsNavItem } from "@/components/ops/ops-nav";

export type Job = {
  id: string; kind: "pickup" | "delivery"; status: string; attempt: number; order_number: string; customer_name: string; customer_phone: string | null;
  address: string | null; landmark: string | null; zone_name: string | null; instructions: string | null; items_summary: string | null;
  amount_due: number | null; scheduled_start: string | null; scheduled_end: string | null; route_seq: number | null; completed_at: string | null;
  failed_reason: string | null; proof_type: string | null; collected_item_count: number | null; collected_bag_codes: string[] | null;
};
export const JOB_COLS = "id, kind, status, attempt, order_number, customer_name, customer_phone, address, landmark, zone_name, instructions, items_summary, amount_due, scheduled_start, scheduled_end, route_seq, completed_at, failed_reason, proof_type, collected_item_count, collected_bag_codes";

export async function driverContext() {
  const { user, membership } = await requireTenant("logistics.view");
  const supabase = await createClient();
  const memberId = await myMemberId(membership.tenantId, user.id);
  const [{ data: t }, { data: status }] = await Promise.all([
    supabase.from("tenants").select("timezone, currency").eq("id", membership.tenantId).single(),
    supabase.from("driver_status").select("is_available").eq("tenant_id", membership.tenantId).eq("member_id", memberId ?? "").maybeSingle(),
  ]);
  return { user, membership, memberId, tz: t?.timezone ?? "Africa/Lagos", currency: t?.currency ?? "NGN", available: Boolean(status?.is_available) };
}

export const driverNav: OpsNavItem[] = [
  { href: "/driver", label: "Jobs", icon: "Truck", exact: true },
  { href: "/driver/done", label: "Completed", icon: "ListChecks" },
];
