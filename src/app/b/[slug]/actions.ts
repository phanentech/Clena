"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { requireBusiness, requireCustomer } from "@/lib/portal";
import { safeNext } from "@/lib/utils";
import { zonedToUtc } from "@/lib/time";

export type PState = { error?: string; success?: string } | undefined;

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : publicEnv.appUrl;
}
const msg = (e: { message?: string } | null | undefined, fallback = "Something went wrong. Try again.") => e?.message || fallback;

// --- accounts --------------------------------------------------------------

export async function portalSignOut(slug: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/b/${slug}`);
}

export async function portalSignIn(slug: string, _: PState, fd: FormData): Promise<PState> {
  const p = z.object({ email: z.email("Enter a valid email address"), password: z.string().min(1, "Enter your password"), next: z.string().optional() })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: p.data.email, password: p.data.password });
  if (error) return { error: error.code === "email_not_confirmed" ? "Confirm your email first. Check your inbox." : "Incorrect email or password." };
  redirect(safeNext(p.data.next, `/b/${slug}`));
}

export async function portalSignUp(slug: string, _: PState, fd: FormData): Promise<PState> {
  const business = await requireBusiness(slug);
  const p = z.object({
    full_name: z.string().trim().min(2, "Enter your full name").max(120),
    phone: z.string().trim().max(30).optional(),
    email: z.email("Enter a valid email address"),
    password: z.string().min(8, "Use at least 8 characters for your password").regex(/[0-9]/, "Include a number in your password"),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  if (!business.portal.signup_enabled) return { error: `${business.name} isn't accepting new sign-ups. Ask them to add you.` };
  const supabase = await createClient();
  const next = `/b/${slug}/join/complete`;
  const { data, error } = await supabase.auth.signUp({
    email: p.data.email,
    password: p.data.password,
    options: {
      data: { full_name: p.data.full_name, phone: p.data.phone ?? null, join_slug: slug, account_type: "customer" },
      emailRedirectTo: `${await origin()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    if (error.code === "user_already_exists") return { error: "An account with this email already exists. Sign in instead." };
    return { error: error.message };
  }
  if (!data.session) return { success: `We sent a link to ${p.data.email}. Open it to finish joining ${business.name}.` };
  const { error: jErr } = await supabase.rpc("join_business", { p_slug: slug, p_full_name: p.data.full_name, p_phone: p.data.phone ?? null });
  if (jErr) return { error: jErr.message };
  redirect(`/b/${slug}`);
}

export async function joinBusinessAction(slug: string, _: PState, fd: FormData): Promise<PState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_business", {
    p_slug: slug, p_full_name: String(fd.get("full_name") ?? ""), p_phone: String(fd.get("phone") ?? "") || null,
  });
  if (error) return { error: error.message };
  redirect(`/b/${slug}`);
}

// --- ordering --------------------------------------------------------------

const orderInput = z.object({
  items: z.array(z.object({ service_id: z.uuid(), quantity: z.number().positive().max(1000) })).min(1, "Your basket is empty").max(30),
  promo: z.string().trim().max(24).optional().nullable(),
  mode: z.enum(["pickup_delivery", "drop_off"]),
});

export type Quote = {
  lines: { service_id: string; name: string; quantity: number; unit_price: number; line_total: number; pricing_model: string }[];
  subtotal: number; tax: number; delivery_fee: number; service_fee: number; discount: number; total: number;
  promo_code: string | null; promo_error: string | null; promo_title: string | null; below_minimum: boolean; min_order: number; currency: string;
};

export async function quoteOrder(slug: string, input: unknown): Promise<{ quote?: Quote; error?: string }> {
  const ctx = await requireCustomer(slug);
  const p = orderInput.safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quote_my_order", {
    p_tenant: ctx.business.id, p_items: p.data.items, p_promo: p.data.promo || null, p_mode: p.data.mode,
  });
  if (error) return { error: msg(error) };
  return { quote: data as Quote };
}

export async function placeOrder(slug: string, input: unknown): Promise<{ id?: string; error?: string }> {
  const ctx = await requireCustomer(slug);
  const p = orderInput.extend({
    pickup_address: z.uuid().optional().nullable(),
    delivery_address: z.uuid().optional().nullable(),
    pickup_local: z.string().optional().nullable(),
    delivery_local: z.string().optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
  }).safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message };
  const tz = ctx.business.timezone || "Africa/Lagos";
  let pickupAt: string | null = null, deliveryAt: string | null = null;
  try {
    pickupAt = p.data.pickup_local ? zonedToUtc(p.data.pickup_local, tz) : null;
    deliveryAt = p.data.delivery_local ? zonedToUtc(p.data.delivery_local, tz) : null;
  } catch {
    return { error: "Choose valid times" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_my_order", {
    p_tenant: ctx.business.id, p_items: p.data.items, p_mode: p.data.mode,
    p_pickup_address: p.data.pickup_address ?? null, p_delivery_address: p.data.delivery_address ?? null,
    p_pickup_at: pickupAt, p_delivery_at: deliveryAt, p_promo: p.data.promo || null, p_notes: p.data.notes ?? null,
  });
  if (error) return { error: msg(error) };
  revalidatePath(`/b/${slug}`, "layout");
  return { id: (data as { id: string }).id };
}

export async function cancelOrder(slug: string, orderId: string, _: PState, fd: FormData): Promise<PState> {
  await requireCustomer(slug);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_my_order", { p_order: orderId, p_reason: String(fd.get("reason") ?? "") || null });
  if (error) return { error: msg(error) };
  revalidatePath(`/b/${slug}/orders/${orderId}`);
  return { success: "Order cancelled" };
}

// --- profile & addresses ---------------------------------------------------

export async function updateProfile(slug: string, _: PState, fd: FormData): Promise<PState> {
  const ctx = await requireCustomer(slug);
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_profile", {
    p_tenant: ctx.business.id,
    p_full_name: String(fd.get("full_name") ?? ""),
    p_phone: String(fd.get("phone") ?? "") || null,
    p_whatsapp: fd.get("whatsapp") === "on",
    p_sms: fd.get("sms") === "on",
    p_email: fd.get("email_updates") === "on",
    p_payment_method: String(fd.get("payment_method") ?? "") || null,
  });
  if (error) return { error: msg(error) };
  revalidatePath(`/b/${slug}/profile`);
  return { success: "Saved" };
}

const addressSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1, "Give the address a name, like Home").max(40),
  line1: z.string().trim().min(3, "Enter the street address").max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  landmark: z.string().trim().max(120).optional(),
  is_default: z.string().optional(),
});

export async function saveAddress(slug: string, _: PState, fd: FormData): Promise<PState & { id?: string }> {
  const ctx = await requireCustomer(slug);
  const p = addressSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  const { id, is_default, ...fields } = p.data;
  const row = { ...fields, line2: fields.line2 || null, city: fields.city || null, state: fields.state || null, landmark: fields.landmark || null, country: ctx.business.country };
  const makeDefault = is_default === "on";
  if (makeDefault) {
    await supabase.from("customer_addresses").update({ is_default: false }).eq("customer_id", ctx.customer.id);
  }
  let savedId = id;
  if (id) {
    const { error } = await supabase.from("customer_addresses").update({ ...row, ...(makeDefault ? { is_default: true } : {}) }).eq("id", id).eq("customer_id", ctx.customer.id);
    if (error) return { error: msg(error) };
  } else {
    const { count } = await supabase.from("customer_addresses").select("id", { count: "exact", head: true }).eq("customer_id", ctx.customer.id);
    const { data, error } = await supabase.from("customer_addresses")
      .insert({ ...row, tenant_id: ctx.business.id, customer_id: ctx.customer.id, is_default: makeDefault || !count })
      .select("id").single();
    if (error) return { error: msg(error) };
    savedId = data.id;
  }
  revalidatePath(`/b/${slug}`, "layout");
  return { success: "Address saved", id: savedId };
}

export async function deleteAddress(slug: string, id: string) {
  const ctx = await requireCustomer(slug);
  const supabase = await createClient();
  await supabase.from("customer_addresses").delete().eq("id", id).eq("customer_id", ctx.customer.id);
  revalidatePath(`/b/${slug}/profile`);
}

// --- support chat ----------------------------------------------------------

export async function sendMessage(slug: string, _: PState, fd: FormData): Promise<PState> {
  const ctx = await requireCustomer(slug);
  const body = String(fd.get("body") ?? "").trim();
  if (!body) return { error: "Type a message" };
  if (body.length > 2000) return { error: "Keep messages under 2,000 characters" };
  const orderId = String(fd.get("order_id") ?? "") || null;
  const supabase = await createClient();
  const { error } = await supabase.from("customer_messages").insert({
    tenant_id: ctx.business.id, customer_id: ctx.customer.id, sender: "customer", body, order_id: orderId, author_id: ctx.user.id,
  });
  if (error) return { error: msg(error) };
  revalidatePath(`/b/${slug}/support`);
  return { success: "sent" };
}
