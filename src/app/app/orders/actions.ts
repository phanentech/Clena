"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertPermission, getActiveMembership, getUser } from "@/lib/auth/session";
import type { FormState } from "@/app/auth/actions";

const orderSchema = z.object({
  customerId: z.uuid("Choose a customer"),
  branchId: z.uuid("Choose a branch"),
  expectedAt: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
  discount: z.coerce.number().min(0, "Discount cannot be negative").default(0),
  items: z
    .array(z.object({ serviceId: z.uuid(), quantity: z.coerce.number().positive("Quantity must be more than 0").max(10000) }))
    .min(1, "Add at least one service"),
});

export async function createOrder(_: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await assertPermission("orders.manage");
  const serviceIds = formData.getAll("serviceId").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const items = serviceIds
    .map((serviceId, i) => ({ serviceId, quantity: quantities[i] }))
    .filter((i) => i.serviceId && Number(i.quantity) > 0);

  const parsed = orderSchema.safeParse({
    customerId: formData.get("customerId"),
    branchId: formData.get("branchId"),
    expectedAt: formData.get("expectedAt") || undefined,
    notes: formData.get("notes") || undefined,
    discount: formData.get("discount") || 0,
    items,
  });
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    parsed.error.issues.forEach((i) => (fe[String(i.path[0])] ??= i.message));
    return { fieldErrors: fe };
  }

  const supabase = await createClient();
  // Prices are computed inside create_order from the services table — never from the browser.
  const { data, error } = await supabase.rpc("create_order", {
    p_tenant: membership.tenantId,
    p_branch: parsed.data.branchId,
    p_customer: parsed.data.customerId,
    p_items: parsed.data.items.map((i) => ({ service_id: i.serviceId, quantity: i.quantity })),
    p_notes: parsed.data.notes ?? null,
    p_expected_at: parsed.data.expectedAt ? new Date(parsed.data.expectedAt).toISOString() : null,
    p_discount: parsed.data.discount,
  });
  if (error) return { error: error.message };
  revalidatePath("/app/orders");
  redirect(`/app/orders/${data}`);
}

export async function moveOrderStage(orderId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser();
  const membership = await getActiveMembership();
  if (!user || !membership) return { error: "Your session has expired." };
  if (!membership.permissions.includes("orders.update_status") && !membership.permissions.includes("orders.manage")) {
    return { error: "You do not have permission to update orders." };
  }
  const stageId = z.uuid().safeParse(formData.get("stageId"));
  if (!stageId.success) return { error: "Choose a stage" };
  const note = z.string().trim().max(500).optional().parse(formData.get("note") || undefined);

  const supabase = await createClient();
  const { error } = await supabase.rpc("move_order_stage", { p_order: z.uuid().parse(orderId), p_stage: stageId.data, p_note: note ?? null });
  if (error) return { error: error.message };
  revalidatePath(`/app/orders/${orderId}`);
  revalidatePath("/app/orders");
  revalidatePath("/staff");
  return { success: "Status updated" };
}

const paymentSchema = z.object({
  amount: z.coerce.number().positive("Enter an amount"),
  method: z.enum(["cash", "bank_transfer", "pos", "manual"]),
  note: z.string().trim().max(500).optional(),
});

/** Offline payments only. Online (Paystack/Flutterwave) are recorded by the verified webhook path. */
export async function recordPayment(orderId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await assertPermission("payments.record");
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: { amount: parsed.error.issues[0].message } };

  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("id, customer_id, currency, total, amount_paid")
    .eq("id", z.uuid().parse(orderId)).eq("tenant_id", membership.tenantId).single();
  if (!order) return { error: "Order not found" };
  const balance = Number(order.total) - Number(order.amount_paid);
  if (parsed.data.amount > balance + 0.001) return { fieldErrors: { amount: "Amount is more than the outstanding balance" } };

  const { error } = await supabase.from("payments").insert({
    tenant_id: membership.tenantId,
    order_id: order.id,
    customer_id: order.customer_id,
    amount: parsed.data.amount,
    currency: order.currency,
    method: parsed.data.method,
    status: "successful",
    reference: `PAY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    note: parsed.data.note ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/app/orders/${orderId}`);
  return { success: "Payment recorded" };
}
