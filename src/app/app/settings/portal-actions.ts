"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/auth/session";
import type { FormState } from "@/app/auth/actions";

const HEX = /^#[0-9a-fA-F]{6}$/;
const num = (min: number, max: number) => z.coerce.number().min(min).max(max);

/** Customer app: public link, sign-ups, fees, times and contact details. */
export async function saveCustomerApp(_: FormState, fd: FormData): Promise<FormState> {
  const { membership } = await assertPermission("settings.manage");
  const p = z.object({
    slug: z.string().trim().toLowerCase(),
    welcome_title: z.string().trim().max(90).optional(),
    welcome_text: z.string().trim().max(300).optional(),
    delivery_fee: num(0, 10_000_000),
    service_charge_pct: num(0, 50),
    min_order: num(0, 10_000_000),
    pickup_lead_hours: num(0, 72),
    slot_start_hour: num(0, 22),
    slot_end_hour: num(2, 24),
    support_phone: z.string().trim().max(30).optional(),
    support_whatsapp: z.string().trim().max(30).optional(),
    support_email: z.union([z.literal(""), z.email("Enter a valid support email")]).optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  if (p.data.slot_end_hour - p.data.slot_start_hour < 2) return { error: "Opening hours need at least one 2-hour slot" };
  const supabase = await createClient();
  const { data: t } = await supabase.from("tenants").select("slug, settings").eq("id", membership.tenantId).single();
  if (!t) return { error: "Business not found" };
  if (p.data.slug !== t.slug) {
    const { error } = await supabase.rpc("set_business_slug", { p_tenant: membership.tenantId, p_slug: p.data.slug });
    if (error) return { error: error.message };
  }
  const settings = (t.settings ?? {}) as Record<string, unknown>;
  const portal = {
    ...((settings.portal as Record<string, unknown>) ?? {}),
    signup_enabled: fd.get("signup_enabled") === "on",
    pickup_enabled: fd.get("pickup_enabled") === "on",
    drop_off_enabled: fd.get("drop_off_enabled") === "on",
    welcome_title: p.data.welcome_title || null,
    welcome_text: p.data.welcome_text || null,
    delivery_fee: p.data.delivery_fee,
    service_charge_pct: p.data.service_charge_pct,
    min_order: p.data.min_order,
    pickup_lead_hours: p.data.pickup_lead_hours,
    slot_start_hour: p.data.slot_start_hour,
    slot_end_hour: p.data.slot_end_hour,
    support_phone: p.data.support_phone || null,
    support_whatsapp: p.data.support_whatsapp || null,
    support_email: p.data.support_email || null,
  };
  if (!portal.pickup_enabled && !portal.drop_off_enabled) return { error: "Turn on pickup & delivery, drop-off, or both" };
  const { error } = await supabase.from("tenants").update({ settings: { ...settings, portal } }).eq("id", membership.tenantId);
  if (error) return { error: error.message };
  revalidatePath("/app/settings/customer-app");
  revalidatePath("/b", "layout");
  return { success: "Customer app saved" };
}

/** Brand: logo, colours, name and style used across the customer app. */
export async function saveBranding(_: FormState, fd: FormData): Promise<FormState> {
  const { membership } = await assertPermission("settings.manage");
  const p = z.object({
    app_name: z.string().trim().max(60).optional(),
    tagline: z.string().trim().max(80).optional(),
    primary_color: z.string().regex(HEX, "Choose a main colour"),
    secondary_color: z.string().regex(HEX, "Choose a second colour"),
    accent_color: z.string().regex(HEX, "Choose a highlight colour"),
    corner_style: z.enum(["rounded", "soft", "square"]),
    receipt_footer: z.string().trim().max(200).optional(),
    logo_data: z.string().max(400_000, "Logo is too large. Use an image under 250 KB.").optional(),
    remove_logo: z.string().optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const logo = p.data.logo_data;
  if (logo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo)) return { error: "Upload a PNG, JPG or WebP logo" };
  const supabase = await createClient();
  const { data: t } = await supabase.from("tenants").select("branding").eq("id", membership.tenantId).single();
  const current = (t?.branding ?? {}) as Record<string, unknown>;
  const branding = {
    ...current,
    app_name: p.data.app_name || null,
    tagline: p.data.tagline || null,
    primary_color: p.data.primary_color,
    secondary_color: p.data.secondary_color,
    accent_color: p.data.accent_color,
    corner_style: p.data.corner_style,
    receipt_footer: p.data.receipt_footer || null,
    show_powered_by: fd.get("show_powered_by") === "on",
    logo_data: p.data.remove_logo === "1" ? null : (logo || current.logo_data || null),
  };
  const { error } = await supabase.from("tenants").update({ branding }).eq("id", membership.tenantId);
  if (error) return { error: error.message };
  revalidatePath("/app", "layout");
  revalidatePath("/b", "layout");
  return { success: "Brand saved" };
}

// --- offers ----------------------------------------------------------------

const offerSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,23}$/, "Codes use 3–24 letters, numbers, - or _"),
  title: z.string().trim().min(2, "Give the offer a title").max(60),
  description: z.string().trim().max(200).optional(),
  kind: z.enum(["percent", "fixed", "free_delivery"]),
  value: z.coerce.number().min(0),
  min_order: z.coerce.number().min(0).default(0),
  max_redemptions: z.string().optional(),
  ends_at: z.string().optional(),
});

export async function saveOffer(_: FormState, fd: FormData): Promise<FormState> {
  const { membership } = await assertPermission("settings.manage");
  const p = offerSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  if (d.kind === "percent" && (d.value < 1 || d.value > 100)) return { error: "Percent off must be between 1 and 100" };
  if (d.kind === "fixed" && d.value <= 0) return { error: "Enter the amount off" };
  const row = {
    code: d.code, title: d.title, description: d.description || null, kind: d.kind,
    value: d.kind === "free_delivery" ? 0 : d.value, min_order: d.min_order,
    max_redemptions: d.max_redemptions ? Number(d.max_redemptions) || null : null,
    ends_at: d.ends_at ? new Date(`${d.ends_at}T23:59:59`).toISOString() : null,
    first_order_only: fd.get("first_order_only") === "on",
    once_per_customer: fd.get("once_per_customer") === "on",
    is_featured: fd.get("is_featured") === "on",
  };
  const supabase = await createClient();
  const { error } = d.id
    ? await supabase.from("tenant_offers").update(row).eq("id", d.id).eq("tenant_id", membership.tenantId)
    : await supabase.from("tenant_offers").insert({ ...row, tenant_id: membership.tenantId });
  if (error) return { error: error.code === "23505" ? "You already have an offer with that code" : error.message };
  revalidatePath("/app/offers");
  revalidatePath("/b", "layout");
  return { success: d.id ? "Offer updated" : "Offer created" };
}

export async function toggleOffer(id: string, active: boolean) {
  const { membership } = await assertPermission("settings.manage");
  const supabase = await createClient();
  await supabase.from("tenant_offers").update({ is_active: active }).eq("id", z.uuid().parse(id)).eq("tenant_id", membership.tenantId);
  revalidatePath("/app/offers");
  revalidatePath("/b", "layout");
}

export async function deleteOffer(id: string) {
  const { membership } = await assertPermission("settings.manage");
  const supabase = await createClient();
  await supabase.from("tenant_offers").delete().eq("id", z.uuid().parse(id)).eq("tenant_id", membership.tenantId);
  revalidatePath("/app/offers");
  revalidatePath("/b", "layout");
}

// --- customer messages -----------------------------------------------------

export async function replyToCustomer(customerId: string, _: FormState, fd: FormData): Promise<FormState> {
  const { membership, user } = await assertPermission("customers.manage");
  const body = String(fd.get("body") ?? "").trim();
  if (!body) return { error: "Type a reply" };
  const supabase = await createClient();
  const { error } = await supabase.from("customer_messages").insert({
    tenant_id: membership.tenantId, customer_id: z.uuid().parse(customerId), sender: "business", body, author_id: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath(`/app/messages/${customerId}`);
  revalidatePath("/app/messages");
  return { success: "sent" };
}
