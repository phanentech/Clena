"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/app/auth/actions";
import { assertPermission, requireTenant } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { zonedToUtc } from "@/lib/time";

const msg = (e: { message: string } | null) => (e ? e.message.replace(/^.*?:\s(?=[A-Z])/, "") : "");

// --- dispatch ---------------------------------------------------------------

export async function assignJob(jobId: string, memberId: string): Promise<FormState> {
  await assertPermission("logistics.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_job", { p_job: jobId, p_member: memberId || null });
  if (error) return { error: msg(error) };
  revalidatePath("/app/dispatch");
  return { success: memberId ? "Assigned" : "Unassigned" };
}

export async function moveInRoute(jobIds: string[]): Promise<FormState> {
  const { membership } = await requireTenant("logistics.manage");
  const supabase = await createClient();
  for (const [i, id] of jobIds.slice(0, 60).entries()) {
    const { error } = await supabase.from("delivery_jobs").update({ route_seq: i + 1 }).eq("id", id).eq("tenant_id", membership.tenantId);
    if (error) return { error: msg(error) };
  }
  revalidatePath("/app/dispatch");
  return { success: "Route order saved" };
}

export async function rescheduleJob(jobId: string, _: FormState, fd: FormData): Promise<FormState> {
  const { membership } = await requireTenant("logistics.manage");
  const local = String(fd.get("when") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return { error: "Choose a date and time" };
  const supabase = await createClient();
  const { data: t } = await supabase.from("tenants").select("timezone").eq("id", membership.tenantId).single();
  const { error } = await supabase.rpc("reschedule_job", { p_job: jobId, p_start: zonedToUtc(local, t?.timezone ?? "Africa/Lagos"), p_note: String(fd.get("note") ?? "") || null });
  if (error) return { error: msg(error) };
  revalidatePath("/app/dispatch");
  return { success: "New attempt scheduled. The customer has been told." };
}

// --- incidents ---------------------------------------------------------------

export async function updateIncident(id: string, _: FormState, fd: FormData): Promise<FormState> {
  await assertPermission("incidents.manage");
  const status = String(fd.get("status") ?? "");
  if (!["open", "investigating", "resolved"].includes(status)) return { error: "Choose a status" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_incident", {
    p_id: id, p_status: status, p_resolution: String(fd.get("resolution") ?? "") || null,
    p_assign: String(fd.get("assign") ?? "") || null, p_notify: fd.get("notify") === "on",
  });
  if (error) return { error: msg(error) };
  revalidatePath("/app/incidents");
  return { success: status === "resolved" ? "Resolved" : "Updated" };
}

// --- partners ----------------------------------------------------------------

const partnerSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Enter the partner's name").max(80),
  contact_name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(200).optional(),
  services: z.string().trim().max(200).optional(),
  cost_per_kg: z.string().optional(),
  turnaround_hours: z.coerce.number().int().min(1, "Turnaround must be at least 1 hour").max(720),
});

export async function savePartner(_: FormState, fd: FormData): Promise<FormState> {
  const { membership } = await requireTenant("settings.manage");
  const p = partnerSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const { id, cost_per_kg, ...f } = p.data;
  const row = { ...f, contact_name: f.contact_name || null, phone: f.phone || null, address: f.address || null, services: f.services || null,
    cost_per_kg: cost_per_kg ? Number(cost_per_kg) : null, tenant_id: membership.tenantId };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("processing_partners").update(row).eq("id", id) : await supabase.from("processing_partners").insert(row);
  if (error) return { error: msg(error) };
  revalidatePath("/app/partners");
  return { success: "Partner saved" };
}

export async function sendToPartner(_: FormState, fd: FormData): Promise<FormState> {
  const { membership } = await requireTenant("orders.manage");
  const orders = fd.getAll("order").map(String).filter(Boolean);
  const partner = String(fd.get("partner") ?? "");
  if (!partner) return { error: "Choose a partner" };
  if (!orders.length) return { error: "Tick at least one order" };
  const supabase = await createClient();
  const local = String(fd.get("expected") ?? "");
  let expected: string | null = null;
  if (local) {
    const { data: t } = await supabase.from("tenants").select("timezone").eq("id", membership.tenantId).single();
    expected = zonedToUtc(local, t?.timezone ?? "Africa/Lagos");
  }
  const { error } = await supabase.rpc("send_to_partner", { p_partner: partner, p_orders: orders, p_expected: expected, p_notes: String(fd.get("notes") ?? "") || null });
  if (error) return { error: msg(error) };
  revalidatePath("/app/partners");
  return { success: `${orders.length} order${orders.length === 1 ? "" : "s"} sent` };
}

export async function receiveBatch(batchId: string): Promise<FormState> {
  await assertPermission("orders.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_partner_batch", { p_batch: batchId });
  if (error) return { error: msg(error) };
  revalidatePath("/app/partners");
  return { success: "Batch received. Orders are back in quality control." };
}

// --- daily checklist -----------------------------------------------------------

export async function toggleChecklist(day: string, key: string, done: boolean): Promise<FormState> {
  const { membership } = await requireTenant("orders.view");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^[a-z_]{2,40}$/.test(key)) return { error: "Invalid item" };
  const supabase = await createClient();
  const { error } = done
    ? await supabase.from("ops_checklist_marks").upsert({ tenant_id: membership.tenantId, day, item_key: key })
    : await supabase.from("ops_checklist_marks").delete().eq("tenant_id", membership.tenantId).eq("day", day).eq("item_key", key);
  if (error) return { error: msg(error) };
  revalidatePath("/app/checklist");
  return { success: "Saved" };
}

// --- subscriptions --------------------------------------------------------------

const planSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Name the plan").max(60),
  description: z.string().trim().max(300).optional(),
  price: z.coerce.number().min(0, "Price can't be negative"),
  period_days: z.coerce.number().int().min(7).max(366),
  included_kg: z.coerce.number().min(0),
  free_delivery: z.string().optional(),
  is_active: z.string().optional(),
});

export async function savePlan(_: FormState, fd: FormData): Promise<FormState> {
  const { membership } = await requireTenant("settings.manage");
  const p = planSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const { id, free_delivery, is_active, ...f } = p.data;
  const row = { ...f, description: f.description || null, free_delivery: free_delivery === "on", is_active: id ? is_active === "on" : true, tenant_id: membership.tenantId };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("subscription_plans").update(row).eq("id", id) : await supabase.from("subscription_plans").insert(row);
  if (error) return { error: msg(error) };
  revalidatePath("/app/subscriptions");
  return { success: "Plan saved" };
}

export async function activateSubscription(subId: string, _: FormState, fd: FormData): Promise<FormState> {
  await assertPermission("subscriptions.manage");
  const method = String(fd.get("method") ?? "");
  if (!["cash", "bank_transfer", "pos"].includes(method)) return { error: "Choose how they paid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("activate_subscription", { p_sub: subId, p_method: method, p_reference: String(fd.get("reference") ?? "") || null });
  if (error) return { error: msg(error) };
  revalidatePath("/app/subscriptions");
  return { success: "Payment recorded and plan activated" };
}

// --- refunds and points --------------------------------------------------------------

export async function refundPayment(paymentId: string, _: FormState, fd: FormData): Promise<FormState> {
  await assertPermission("payments.record");
  const amount = Number(fd.get("amount"));
  if (!(amount > 0)) return { error: "Enter the amount to refund" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("refund_payment", {
    p_payment: paymentId, p_amount: amount, p_method: String(fd.get("method") ?? "bank_transfer"),
    p_reason: String(fd.get("reason") ?? ""), p_reference: String(fd.get("reference") ?? "") || null,
  });
  if (error) return { error: msg(error) };
  revalidatePath("/app/payments");
  revalidatePath("/app/orders", "layout");
  return { success: "Refund recorded. The order balance is updated." };
}

export async function adjustPoints(customerId: string, _: FormState, fd: FormData): Promise<FormState> {
  await assertPermission("marketing.manage");
  const points = Math.trunc(Number(fd.get("points")));
  if (!points) return { error: "Enter points to add or remove (e.g. 50 or -50)" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_points", { p_customer: customerId, p_points: points, p_note: String(fd.get("note") ?? "") || "Manual adjustment" });
  if (error) return { error: msg(error) };
  revalidatePath(`/app/customers/${customerId}`);
  return { success: "Points updated" };
}

// --- operations settings --------------------------------------------------------------

const num = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === "" ? null : Number(v));

export async function saveOpsSettings(_: FormState, fd: FormData): Promise<FormState> {
  const { membership } = await requireTenant("settings.manage");
  const supabase = await createClient();
  const { data: t } = await supabase.from("tenants").select("settings").eq("id", membership.tenantId).single();
  const settings = (t?.settings ?? {}) as Record<string, Record<string, unknown>>;
  const nums = ["slot_capacity", "express_surcharge_pct", "express_hours", "standard_hours", "reminder_default_days", "processing_cost_per_kg", "delivery_cost_per_job", "marketing_spend_month",
    "points_per_100", "point_value", "min_redeem", "referral_points", "referee_points", "milestone_every", "milestone_points"].map((k) => [k, num(fd.get(k))] as const);
  if (nums.some(([, v]) => v !== null && (!Number.isFinite(v) || v < 0))) return { error: "Numbers can't be negative" };
  const n = Object.fromEntries(nums);
  if (n.express_hours !== null && n.standard_hours !== null && n.express_hours! >= n.standard_hours!) return { error: "Express must be faster than standard turnaround" };
  const proof = String(fd.get("proof_required") ?? "any");
  const portal = { ...(settings.portal ?? {}), slot_capacity: n.slot_capacity ?? 0, express_enabled: fd.get("express_enabled") === "on",
    express_surcharge_pct: n.express_surcharge_pct ?? 0, express_hours: n.express_hours ?? 24, standard_hours: n.standard_hours ?? 48 };
  const ops = { ...(settings.ops ?? {}), qc_required: fd.get("qc_required") === "on", weigh_before_processing: fd.get("weigh_before_processing") === "on",
    auto_complete_when_paid: fd.get("auto_complete_when_paid") === "on", proof_required: ["any", "otp", "signature", "photo"].includes(proof) ? proof : "any",
    reminder_default_days: n.reminder_default_days ?? 14, processing_cost_per_kg: n.processing_cost_per_kg, delivery_cost_per_job: n.delivery_cost_per_job, marketing_spend_month: n.marketing_spend_month };
  const loyalty = { ...(settings.loyalty ?? {}), enabled: fd.get("loyalty_enabled") === "on", points_per_100: n.points_per_100 ?? 1, point_value: n.point_value ?? 1,
    min_redeem: n.min_redeem ?? 100, referral_points: n.referral_points ?? 0, referee_points: n.referee_points ?? 0, milestone_every: n.milestone_every ?? 0, milestone_points: n.milestone_points ?? 0 };
  const { error } = await supabase.from("tenants").update({ settings: { ...settings, portal, ops, loyalty } }).eq("id", membership.tenantId);
  if (error) return { error: msg(error) };
  revalidatePath("/app/settings/operations");
  return { success: "Operations settings saved" };
}

const zoneSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Name the area").max(60),
  areas: z.string().trim().max(400).optional(),
  delivery_fee: z.coerce.number().min(0),
  min_order: z.coerce.number().min(0),
});

export async function saveZone(_: FormState, fd: FormData): Promise<FormState> {
  const { membership } = await requireTenant("settings.manage");
  const p = zoneSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const { id, ...f } = p.data;
  const supabase = await createClient();
  const row = { ...f, areas: f.areas || null, tenant_id: membership.tenantId };
  const { error } = id ? await supabase.from("service_zones").update(row).eq("id", id) : await supabase.from("service_zones").insert(row);
  if (error) return { error: msg(error) };
  revalidatePath("/app/settings/operations");
  return { success: "Area saved" };
}

export async function toggleZone(id: string, active: boolean): Promise<FormState> {
  await assertPermission("settings.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("service_zones").update({ is_active: active }).eq("id", id);
  if (error) return { error: msg(error) };
  revalidatePath("/app/settings/operations");
  return { success: active ? "Area on" : "Area off" };
}
