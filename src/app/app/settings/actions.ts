"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import type { FormState } from "@/app/auth/actions";

const businessSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.union([z.literal(""), z.email("Enter a valid email")]),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(240).optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code"),
  timezone: z.string().trim().refine((tz) => {
    try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
  }, "Unknown time zone"),
});

export async function updateBusiness(_: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await assertPermission("settings.manage");
  const parsed = businessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    parsed.error.issues.forEach((i) => (fe[String(i.path[0])] ??= i.message));
    return { fieldErrors: fe };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("tenants").update({
    name: parsed.data.name,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
    address: parsed.data.address || null,
    currency: parsed.data.currency,
    timezone: parsed.data.timezone,
  }).eq("id", membership.tenantId);
  if (error) return { error: error.message };
  revalidatePath("/app", "layout");
  return { success: "Business details saved" };
}

export async function setRolePermission(roleId: string, permission: string, enabled: boolean) {
  const { membership } = await assertPermission("settings.manage");
  const perm = z.enum(PERMISSIONS).parse(permission);
  const supabase = await createClient();
  const { data: role } = await supabase.from("roles").select("id, key").eq("id", z.uuid().parse(roleId)).eq("tenant_id", membership.tenantId).single();
  if (!role) throw new Error("Role not found");
  if (role.key === "owner") throw new Error("Owner permissions cannot be changed");
  const { error } = enabled
    ? await supabase.from("role_permissions").upsert({ tenant_id: membership.tenantId, role_id: role.id, permission_key: perm })
    : await supabase.from("role_permissions").delete().eq("role_id", role.id).eq("permission_key", perm);
  if (error) throw new Error(error.message);
  revalidatePath("/app/settings");
}
