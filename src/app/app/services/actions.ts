"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/auth/session";
import type { FormState } from "@/app/auth/actions";

const serviceSchema = z.object({
  name: z.string().trim().min(2, "Enter a service name").max(120),
  category: z.string().trim().max(80).optional(),
  description: z.string().trim().max(1000).optional(),
  pricingModel: z.enum(["fixed", "per_item", "per_kg", "per_vehicle", "per_room", "per_hour", "per_sqm", "quote"]),
  basePrice: z.coerce.number().min(0, "Price cannot be negative").max(100_000_000),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  durationMinutes: z.union([z.literal(""), z.coerce.number().int().positive()]).optional(),
});

export async function createService(_: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await assertPermission("services.manage");
  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    parsed.error.issues.forEach((i) => (fe[String(i.path[0])] ??= i.message));
    return { fieldErrors: fe };
  }
  const d = parsed.data;
  const supabase = await createClient();
  let categoryId: string | null = null;
  if (d.category) {
    const { data: cat, error: catErr } = await supabase
      .from("service_categories")
      .upsert({ tenant_id: membership.tenantId, name: d.category }, { onConflict: "tenant_id,name" })
      .select("id")
      .single();
    if (catErr) return { error: catErr.message };
    categoryId = cat.id;
  }
  const { error } = await supabase.from("services").insert({
    tenant_id: membership.tenantId,
    category_id: categoryId,
    name: d.name,
    description: d.description || null,
    pricing_model: d.pricingModel,
    base_price: d.basePrice,
    tax_rate: d.taxRate,
    duration_minutes: typeof d.durationMinutes === "number" ? d.durationMinutes : null,
  });
  if (error) return { error: error.message };
  revalidatePath("/app/services");
  return { success: `${d.name} added` };
}

export async function toggleService(serviceId: string, active: boolean) {
  const { membership } = await assertPermission("services.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("services").update({ is_active: active })
    .eq("id", z.uuid().parse(serviceId)).eq("tenant_id", membership.tenantId);
  if (error) throw new Error(error.message);
  revalidatePath("/app/services");
}
