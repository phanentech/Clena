"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_TENANT_COOKIE, assertPermission, requireUser } from "@/lib/auth/session";
import type { FormState } from "@/app/auth/actions";
import { slugify } from "@/lib/utils";
import { nextStep, stepIndex, type StepSlug } from "@/lib/onboarding";

const COUNTRY_DEFAULTS: Record<string, { currency: string; timezone: string }> = {
  NG: { currency: "NGN", timezone: "Africa/Lagos" },
  GH: { currency: "GHS", timezone: "Africa/Accra" },
  KE: { currency: "KES", timezone: "Africa/Nairobi" },
  ZA: { currency: "ZAR", timezone: "Africa/Johannesburg" },
  GB: { currency: "GBP", timezone: "Europe/London" },
  US: { currency: "USD", timezone: "America/New_York" },
};

function errors(e: z.ZodError) {
  const fe: Record<string, string> = {};
  e.issues.forEach((i) => (fe[String(i.path[0])] ??= i.message));
  return { fieldErrors: fe };
}

/** Merge a section into tenants.settings and move the saved step forward. */
async function saveAndContinue(tenantId: string, step: StepSlug, patch: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const supabase = await createClient();
  const { data: t, error } = await supabase.from("tenants").select("settings, onboarding_step").eq("id", tenantId).single();
  if (error) throw new Error(error.message);
  const next = nextStep(step);
  const { error: upErr } = await supabase.from("tenants").update({
    settings: { ...(t.settings as object), ...patch },
    onboarding_step: Math.max(t.onboarding_step ?? 1, stepIndex(next) + 1),
    ...extra,
  }).eq("id", tenantId);
  if (upErr) throw new Error(upErr.message);
  redirect(`/onboarding/${next}`);
}

// 1 — Business -----------------------------------------------------------------
const businessSchema = z.object({
  name: z.string().trim().min(2, "Enter your business name").max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]([a-z0-9-]{1,46}[a-z0-9])$/, "Use 3–48 lowercase letters, numbers or hyphens"),
  industry: z.string().min(1, "Choose your industry"),
  country: z.enum(Object.keys(COUNTRY_DEFAULTS) as [string, ...string[]]),
  phone: z.string().trim().max(30).optional(),
});

export async function saveBusiness(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser("/onboarding");
  const raw = Object.fromEntries(formData);
  const parsed = businessSchema.safeParse({ ...raw, slug: raw.slug || slugify(String(raw.name ?? "")) });
  if (!parsed.success) return errors(parsed.error);
  const { currency, timezone } = COUNTRY_DEFAULTS[parsed.data.country];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_tenant", {
    p_name: parsed.data.name, p_slug: parsed.data.slug, p_industry: parsed.data.industry,
    p_country: parsed.data.country, p_currency: currency, p_timezone: timezone, p_with_template_services: true,
  });
  if (error) {
    if (error.code === "23505") return { fieldErrors: { slug: "That address is already taken. Try another." } };
    return { error: error.message };
  }
  const tenantId = data as string;
  (await cookies()).set(ACTIVE_TENANT_COOKIE, tenantId, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
  if (parsed.data.phone) await supabase.from("tenants").update({ phone: parsed.data.phone }).eq("id", tenantId);
  await supabase.from("tenants").update({ onboarding_step: 2 }).eq("id", tenantId);
  redirect("/onboarding/about");
}

// 2 — About ----------------------------------------------------------------------
export async function saveAbout(_: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await assertPermission("settings.manage");
  const parsed = z.object({
    team_size: z.string().min(1, "Choose your team size"),
    monthly_orders: z.string().min(1, "Choose a rough number"),
    branches_planned: z.coerce.number().int().min(1).max(500),
    channels: z.array(z.string()).min(1, "Choose at least one"),
    current_tools: z.array(z.string()),
    goals: z.array(z.string()).min(1, "Choose at least one").max(3, "Choose up to three"),
  }).safeParse({
    team_size: formData.get("team_size") ?? "",
    monthly_orders: formData.get("monthly_orders") ?? "",
    branches_planned: formData.get("branches_planned") || 1,
    channels: formData.getAll("channels"),
    current_tools: formData.getAll("current_tools"),
    goals: formData.getAll("goals"),
  });
  if (!parsed.success) return errors(parsed.error);
  await saveAndContinue(membership.tenantId, "about", { profile: parsed.data });
  return undefined;
}

// 3 — Location ---------------------------------------------------------------------
const time = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");
export async function saveLocation(_: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await assertPermission("branches.manage");
  const parsed = z.object({
    name: z.string().trim().min(2, "Name this branch").max(80),
    address: z.string().trim().min(3, "Enter the street address").max(240),
    city: z.string().trim().min(2, "Enter the city").max(80),
    state: z.string().trim().max(80).optional(),
    phone: z.string().trim().max(30).optional(),
    weekday_open: time, weekday_close: time,
    sat_open: time.optional().or(z.literal("")), sat_close: time.optional().or(z.literal("")),
    sun_open: time.optional().or(z.literal("")), sun_close: time.optional().or(z.literal("")),
    sat_closed: z.literal("on").optional(), sun_closed: z.literal("on").optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errors(parsed.error);
  const d = parsed.data;
  const wk: [string, string][] = [[d.weekday_open, d.weekday_close]];
  const hours = {
    mon: wk, tue: wk, wed: wk, thu: wk, fri: wk,
    sat: d.sat_closed || !d.sat_open || !d.sat_close ? [] : [[d.sat_open, d.sat_close]],
    sun: d.sun_closed || !d.sun_open || !d.sun_close ? [] : [[d.sun_open, d.sun_close]],
  };
  const supabase = await createClient();
  const { data: tenant } = await supabase.from("tenants").select("country").eq("id", membership.tenantId).single();
  const { data: existing } = await supabase.from("branches").select("id").eq("tenant_id", membership.tenantId).order("created_at").limit(1).maybeSingle();
  const row = { name: d.name, address: d.address, city: d.city, state: d.state || null, phone: d.phone || null, operating_hours: hours, country: tenant?.country ?? null };
  const { error } = existing
    ? await supabase.from("branches").update(row).eq("id", existing.id)
    : await supabase.from("branches").insert({ ...row, tenant_id: membership.tenantId });
  if (error) return { error: error.message };
  await saveAndContinue(membership.tenantId, "location", {}, { address: `${d.address}, ${d.city}` });
  return undefined;
}

// 4 — Services ---------------------------------------------------------------------
export async function saveServices(_: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await assertPermission("services.manage");
  const supabase = await createClient();
  const ids = formData.getAll("service_id").map(String);
  for (const id of ids) {
    const price = Number(formData.get(`price_${id}`));
    const active = formData.get(`active_${id}`) === "on";
    if (!Number.isFinite(price) || price < 0) return { error: "Prices must be zero or more." };
    const { error } = await supabase.from("services").update({ base_price: price, is_active: active })
      .eq("id", z.uuid().parse(id)).eq("tenant_id", membership.tenantId);
    if (error) return { error: error.message };
  }
  const newNames = formData.getAll("new_name").map((v) => String(v).trim());
  const newPrices = formData.getAll("new_price").map(Number);
  const newModels = formData.getAll("new_model").map(String);
  const models = ["fixed", "per_item", "per_kg", "per_vehicle", "per_room", "per_hour", "per_sqm", "quote"];
  for (let i = 0; i < newNames.length; i++) {
    if (!newNames[i]) continue;
    if (newNames[i].length < 2 || !Number.isFinite(newPrices[i]) || newPrices[i] < 0 || !models.includes(newModels[i])) {
      return { error: `Check the name and price for "${newNames[i]}".` };
    }
    const { error } = await supabase.from("services").insert({
      tenant_id: membership.tenantId, name: newNames[i], base_price: newPrices[i], pricing_model: newModels[i],
    });
    if (error) return { error: error.message };
  }
  const { count } = await supabase.from("services").select("id", { count: "exact", head: true }).eq("tenant_id", membership.tenantId).eq("is_active", true);
  if (!count) return { error: "Offer at least one service so you can create orders." };
  await saveAndContinue(membership.tenantId, "services", {});
  return undefined;
}

// 5 — Payments ---------------------------------------------------------------------
export async function savePayments(_: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await assertPermission("settings.manage");
  const parsed = z.object({
    methods: z.array(z.string()).min(1, "Choose at least one way to get paid"),
    bank_name: z.string().trim().max(80).optional(),
    account_name: z.string().trim().max(120).optional(),
    account_number: z.string().trim().regex(/^\d{0,20}$/, "Digits only").optional(),
    deposit: z.enum(["none", "50", "100"]),
  }).safeParse({ ...Object.fromEntries(formData), methods: formData.getAll("methods") });
  if (!parsed.success) return errors(parsed.error);
  await saveAndContinue(membership.tenantId, "payments", { payments: parsed.data });
  return undefined;
}

// 6 — Notifications ---------------------------------------------------------------
export async function saveNotifications(_: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await assertPermission("settings.manage");
  const parsed = z.object({
    channels: z.array(z.enum(["whatsapp", "sms", "email"])),
    events: z.array(z.string()),
    sender_name: z.string().trim().max(40).optional(),
  }).safeParse({ channels: formData.getAll("channels"), events: formData.getAll("events"), sender_name: formData.get("sender_name") || undefined });
  if (!parsed.success) return errors(parsed.error);
  await saveAndContinue(membership.tenantId, "notifications", { notifications: parsed.data });
  return undefined;
}

// 7 — Branding ----------------------------------------------------------------------
export async function saveBranding(_: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await assertPermission("settings.manage");
  const parsed = z.object({
    primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    tagline: z.string().trim().max(80).optional(),
    receipt_footer: z.string().trim().max(200).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errors(parsed.error);
  const supabase = await createClient();
  const { data: t } = await supabase.from("tenants").select("branding").eq("id", membership.tenantId).single();
  await saveAndContinue(membership.tenantId, "branding", {}, {
    branding: { ...(t?.branding as object), primary_color: parsed.data.primary_color, tagline: parsed.data.tagline ?? null, receipt_footer: parsed.data.receipt_footer ?? null },
  });
  return undefined;
}

// 8 — Team -----------------------------------------------------------------------------
export async function saveTeam(_: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await assertPermission("staff.manage");
  const emails = formData.getAll("email").map((v) => String(v).trim().toLowerCase());
  const roles = formData.getAll("role").map(String);
  const supabase = await createClient();
  const { data: roleRows } = await supabase.from("roles").select("id, key").eq("tenant_id", membership.tenantId);
  const roleId = new Map((roleRows ?? []).map((r) => [r.key, r.id]));
  for (let i = 0; i < emails.length; i++) {
    if (!emails[i]) continue;
    if (!z.email().safeParse(emails[i]).success) return { error: `"${emails[i]}" is not a valid email address.` };
    const rid = roleId.get(roles[i]);
    if (!rid || roles[i] === "owner") return { error: "Choose a role for each person." };
    const { error } = await supabase.from("tenant_invitations").insert({ tenant_id: membership.tenantId, email: emails[i], role_id: rid });
    if (error && error.code !== "23505") return { error: error.message };
  }
  await saveAndContinue(membership.tenantId, "team", {});
  return undefined;
}

// 9 — Finish -----------------------------------------------------------------------------
export async function finishOnboarding(formData: FormData) {
  const { membership } = await assertPermission("settings.manage");
  const supabase = await createClient();
  if (formData.get("start") === "sample") {
    const { error } = await supabase.rpc("load_demo_data", { p_tenant: membership.tenantId });
    if (error) throw new Error(error.message);
  }
  const { error } = await supabase.from("tenants")
    .update({ onboarding_completed_at: new Date().toISOString(), onboarding_step: 10 })
    .eq("id", membership.tenantId);
  if (error) throw new Error(error.message);
  redirect("/app/dashboard");
}
