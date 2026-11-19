"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/auth/session";
import type { FormState } from "@/app/auth/actions";

export async function addBranch(_: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await assertPermission("branches.manage");
  const parsed = z.object({
    name: z.string().trim().min(2, "Name the branch").max(80),
    address: z.string().trim().min(3, "Enter the address").max(240),
    city: z.string().trim().min(2, "Enter the city").max(80),
    phone: z.string().trim().max(30).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    parsed.error.issues.forEach((i) => (fe[String(i.path[0])] ??= i.message));
    return { fieldErrors: fe };
  }
  const supabase = await createClient();
  const { data: first } = await supabase.from("branches").select("operating_hours, country").eq("tenant_id", membership.tenantId).order("created_at").limit(1).maybeSingle();
  const { error } = await supabase.from("branches").insert({
    tenant_id: membership.tenantId, ...parsed.data, phone: parsed.data.phone || null,
    operating_hours: first?.operating_hours ?? {}, country: first?.country ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/app/settings/branches");
  return { success: `${parsed.data.name} added. It uses the same opening hours as your first branch.` };
}
