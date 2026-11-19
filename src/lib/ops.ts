import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** Whether the business has the laundry operations module switched on. */
export const hasLaundryOps = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("tenant_modules").select("module_key").eq("tenant_id", tenantId).eq("module_key", "laundry_ops").maybeSingle();
  return Boolean(data);
});

export type Stage = { id: string; key: string; name: string; color: string; position: number; is_terminal: boolean; allowed_roles: string[] };

export const getStages = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("workflow_stages").select("id, key, name, color, position, is_terminal, allowed_roles, workflow_id")
    .eq("tenant_id", tenantId).order("position");
  return (data ?? []) as (Stage & { workflow_id: string })[];
});

export async function queueCounts(tenantId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("ops_queue_counts", { p_tenant: tenantId });
  return (data ?? {}) as Record<string, number>;
}

/** member id -> display name for the business's team. */
export async function memberNames(tenantId: string) {
  const supabase = await createClient();
  const { data: members } = await supabase.from("tenant_members").select("id, user_id, roles(key, name)").eq("tenant_id", tenantId).eq("status", "active");
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const byUser = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string | null]));
  return new Map((members ?? []).map((m) => [m.id, {
    name: byUser.get(m.user_id) ?? "Team member",
    role: (m.roles as unknown as { key: string; name: string } | null)?.key ?? "",
    roleName: (m.roles as unknown as { key: string; name: string } | null)?.name ?? "",
  }]));
}

export const myMemberId = cache(async (tenantId: string, userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("tenant_members").select("id").eq("tenant_id", tenantId).eq("user_id", userId).maybeSingle();
  return data?.id ?? null;
});
