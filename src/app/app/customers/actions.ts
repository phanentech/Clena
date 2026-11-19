"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/auth/session";
import type { FormState } from "@/app/auth/actions";

const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .refine((v) => v === "" || /^\+?[0-9]{7,15}$/.test(v), "Enter a valid phone number");

const customerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the customer's name").max(120),
  phone,
  email: z.union([z.literal(""), z.email("Enter a valid email")]),
  customerType: z.enum(["individual", "business"]),
  companyName: z.string().trim().max(120).optional(),
  tags: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  addressLine1: z.string().trim().max(240).optional(),
  city: z.string().trim().max(80).optional(),
  whatsappOptIn: z.literal("on").optional(),
  marketingOptIn: z.literal("on").optional(),
});

export async function createCustomer(_: FormState, formData: FormData): Promise<FormState> {
  const { user, membership } = await assertPermission("customers.manage");
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    parsed.error.issues.forEach((i) => (fe[String(i.path[0])] ??= i.message));
    return { fieldErrors: fe };
  }
  const d = parsed.data;
  if (!d.phone && !d.email) return { fieldErrors: { phone: "Add a phone number or email so you can reach them" } };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      tenant_id: membership.tenantId, // RLS verifies the caller can manage customers in this tenant
      full_name: d.fullName,
      phone: d.phone || null,
      email: d.email || null,
      customer_type: d.customerType,
      company_name: d.customerType === "business" ? d.companyName || null : null,
      tags: d.tags ? d.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) : [],
      notes: d.notes || null,
      whatsapp_opt_in: d.whatsappOptIn === "on",
      marketing_opt_in: d.marketingOptIn === "on",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { fieldErrors: { phone: "A customer with this phone number already exists" } };
    return { error: error.message };
  }
  if (d.addressLine1) {
    await supabase.from("customer_addresses").insert({
      tenant_id: membership.tenantId,
      customer_id: data.id,
      line1: d.addressLine1,
      city: d.city || null,
      is_default: true,
    });
  }
  revalidatePath("/app/customers");
  redirect(`/app/customers/${data.id}`);
}

export async function addCustomerNote(customerId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { user, membership } = await assertPermission("customers.manage");
  const body = z.string().trim().min(1, "Write a note").max(4000).safeParse(formData.get("body"));
  if (!body.success) return { fieldErrors: { body: body.error.issues[0].message } };
  const supabase = await createClient();
  const { error } = await supabase.from("customer_notes").insert({
    tenant_id: membership.tenantId,
    customer_id: z.uuid().parse(customerId),
    body: body.data,
    author_id: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath(`/app/customers/${customerId}`);
  return { success: "Note added" };
}
