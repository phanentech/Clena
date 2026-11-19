"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPlatform } from "@/lib/auth/session";
import { processEmailOutbox } from "@/lib/email";
import type { FormState } from "@/app/auth/actions";

const ok = (success: string): FormState => ({ success });
const fail = (error: string): FormState => ({ error });
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => (str(f, k) === "" ? null : Number(str(f, k)));
const list = (f: FormData, k: string) => str(f, k).split(",").map((s) => s.trim()).filter(Boolean);

async function guarded<T>(perm: string, fn: (db: Awaited<ReturnType<typeof createClient>>) => Promise<T>): Promise<T | FormState> {
  try {
    await assertPlatform(perm);
    return await fn(await createClient());
  } catch (e) {
    return fail((e as Error).message);
  }
}

// ---------------------------------------------------------------- Organizations
export async function setTenantStatus(_: FormState, f: FormData): Promise<FormState> {
  return guarded("tenants.manage", async (db) => {
    const status = z.enum(["active", "trial", "past_due", "suspended", "cancelled"]).parse(str(f, "status"));
    const { data, error } = await db.rpc("platform_set_tenant_status", {
      p_tenant: z.uuid().parse(str(f, "tenantId")), p_status: status,
      p_reason: str(f, "reason") || null, p_note: str(f, "note") || null, p_notify: f.get("notify") === "on",
    });
    if (error) return fail(error.message);
    let mail = "";
    const queued = (data as { emails_queued: number }).emails_queued;
    if (queued > 0) {
      try {
        const r = await processEmailOutbox();
        mail = r.sent ? ` Email sent to ${r.sent} owner${r.sent === 1 ? "" : "s"}.` : r.skipped ? " Email queued, but no email provider is configured yet." : " Email will be retried.";
      } catch {
        mail = " Email queued; it will be sent when the server's email settings are complete.";
      }
    }
    revalidatePath("/platform/organizations");
    return ok(`Status changed to ${status.replace("_", " ")}.${mail}`);
  }) as Promise<FormState>;
}

export async function extendTrial(_: FormState, f: FormData): Promise<FormState> {
  return guarded("tenants.manage", async (db) => {
    const days = z.coerce.number().int().min(1).max(365).parse(str(f, "days"));
    const tenantId = z.uuid().parse(str(f, "tenantId"));
    const { data: sub } = await db.from("tenant_subscriptions").select("id, current_period_end").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1).single();
    if (!sub) return fail("No subscription found");
    const base = Math.max(new Date(sub.current_period_end).getTime(), new Date().getTime());
    const { error } = await db.from("tenant_subscriptions").update({ current_period_end: new Date(base + days * 86_400_000).toISOString() }).eq("id", sub.id);
    if (error) return fail(error.message);
    revalidatePath(`/platform/organizations/${tenantId}`);
    return ok(`Extended by ${days} days.`);
  }) as Promise<FormState>;
}

// ---------------------------------------------------------------- AI models
export async function saveAiModel(_: FormState, f: FormData): Promise<FormState> {
  return guarded("ai.manage", async (db) => {
    const id = z.uuid().parse(str(f, "id"));
    if (f.get("is_default") === "on") await db.from("ai_models").update({ is_default: false }).neq("id", id);
    const { error } = await db.from("ai_models").update({
      is_enabled: f.get("is_enabled") === "on", is_default: f.get("is_default") === "on",
      min_plan_code: str(f, "min_plan_code") || null,
      input_price_per_mtok: num(f, "input_price"), output_price_per_mtok: num(f, "output_price"),
      context_window: num(f, "context_window"),
    }).eq("id", id);
    if (error) return fail(error.message);
    revalidatePath("/platform/ai-models");
    return ok("Saved");
  }) as Promise<FormState>;
}

export async function addAiModel(_: FormState, f: FormData): Promise<FormState> {
  return guarded("ai.manage", async (db) => {
    const p = z.object({ provider: z.string().min(2).max(40), model_id: z.string().min(2).max(120), display_name: z.string().min(2).max(80) })
      .safeParse({ provider: str(f, "provider").toLowerCase(), model_id: str(f, "model_id"), display_name: str(f, "display_name") });
    if (!p.success) return fail("Enter the provider, model ID and display name.");
    const { error } = await db.from("ai_models").insert({ ...p.data, capabilities: list(f, "capabilities"), sort_order: 500 });
    if (error) return fail(error.code === "23505" ? "That model is already in the catalogue." : error.message);
    revalidatePath("/platform/ai-models");
    return ok(`${p.data.display_name} added.`);
  }) as Promise<FormState>;
}

export async function saveAiProviderKey(_: FormState, f: FormData): Promise<FormState> {
  return guarded("ai.manage", async () => {
    const provider = z.string().min(2).max(40).parse(str(f, "provider"));
    const key = str(f, "api_key");
    if (key.length < 10) return fail("Paste the full API key.");
    const admin = createAdminClient();
    const { error } = await admin.from("ai_provider_secrets").upsert({ provider, api_key: key, base_url: str(f, "base_url") || null, updated_at: new Date().toISOString() });
    if (error) return fail(error.message);
    revalidatePath("/platform/ai-models");
    return ok(`API key saved for ${provider}. It is stored server-side and never shown again.`);
  }) as Promise<FormState>;
}

// ---------------------------------------------------------------- Branding & platform
export async function savePlatformSettings(_: FormState, f: FormData): Promise<FormState> {
  return guarded("platform.settings", async (db) => {
    const branding = {
      product_name: str(f, "product_name") || "Clena", tagline: str(f, "tagline"),
      primary_color: str(f, "primary_color") || "#0B1B33", accent_color: str(f, "accent_color") || "#12C08A",
      support_email: str(f, "support_email"), support_phone: str(f, "support_phone") || null, website: str(f, "website"),
    };
    const defaults = {
      trial_days: z.coerce.number().int().min(0).max(90).parse(str(f, "trial_days") || "14"),
      grace_period_days: z.coerce.number().int().min(0).max(60).parse(str(f, "grace_period_days") || "7"),
      default_currency: str(f, "default_currency") || "NGN", default_language: str(f, "default_language") || "en",
      currencies: list(f, "currencies").map((c) => c.toUpperCase()), languages: f.getAll("languages").map(String),
    };
    for (const [key, value] of [["branding", branding], ["defaults", defaults]] as const) {
      const { error } = await db.from("platform_settings").upsert({ key, value, updated_at: new Date().toISOString() });
      if (error) return fail(error.message);
    }
    revalidatePath("/platform/branding");
    return ok("Platform settings saved.");
  }) as Promise<FormState>;
}

// ---------------------------------------------------------------- Plans
export async function savePlan(_: FormState, f: FormData): Promise<FormState> {
  return guarded("plans.manage", async (db) => {
    const id = z.uuid().parse(str(f, "id"));
    const limits: Record<string, number | null> = {};
    for (const k of ["branches", "staff", "customers", "orders_per_month", "storage_mb", "automations", "ai_requests_per_month", "whatsapp_messages_per_month"]) {
      limits[k] = num(f, `limit_${k}`);
    }
    const features: Record<string, boolean> = {};
    for (const k of ["inventory", "marketing", "subscriptions", "ai", "white_label", "custom_domain"]) features[k] = f.get(`feature_${k}`) === "on";
    const { error } = await db.from("plans").update({ name: str(f, "name"), description: str(f, "description"), limits, features, is_active: f.get("is_active") === "on" }).eq("id", id);
    if (error) return fail(error.message);
    for (const [k, v] of f.entries()) {
      const m = /^price_([A-Z]{3})$/.exec(k);
      if (m && String(v).trim() !== "") {
        const { error: pe } = await db.from("plan_prices").upsert({ plan_id: id, currency: m[1], monthly_price: Number(v), is_active: true }, { onConflict: "plan_id,currency" });
        if (pe) return fail(pe.message);
      }
    }
    revalidatePath("/platform/plans");
    revalidatePath("/pricing");
    return ok("Plan saved.");
  }) as Promise<FormState>;
}

export async function savePeriods(_: FormState, f: FormData): Promise<FormState> {
  return guarded("plans.manage", async (db) => {
    const keys = f.getAll("period_key").map(String);
    for (const k of keys) {
      const { error } = await db.from("billing_periods").update({
        label: str(f, `label_${k}`), discount_percent: z.coerce.number().min(0).max(90).parse(str(f, `discount_${k}`) || "0"), is_active: f.get(`active_${k}`) === "on",
      }).eq("key", k);
      if (error) return fail(error.message);
    }
    revalidatePath("/platform/plans");
    return ok("Billing periods saved.");
  }) as Promise<FormState>;
}

export async function addCurrency(_: FormState, f: FormData): Promise<FormState> {
  return guarded("plans.manage", async (db) => {
    const cur = str(f, "currency").toUpperCase();
    if (!/^[A-Z]{3}$/.test(cur)) return fail("Use a 3-letter ISO currency code, e.g. GHS.");
    const { data: plans } = await db.from("plans").select("id");
    const { error } = await db.from("plan_prices").upsert((plans ?? []).map((p) => ({ plan_id: p.id, currency: cur, monthly_price: 0, is_active: false })), { onConflict: "plan_id,currency", ignoreDuplicates: true });
    if (error) return fail(error.message);
    revalidatePath("/platform/plans");
    return ok(`${cur} added. Set a price on each plan to publish it.`);
  }) as Promise<FormState>;
}

// ---------------------------------------------------------------- Billing
export async function confirmInvoice(_: FormState, f: FormData): Promise<FormState> {
  return guarded("billing.manage", async (db) => {
    const approve = str(f, "decision") === "approve";
    const { error } = await db.rpc("platform_confirm_invoice", { p_invoice: z.uuid().parse(str(f, "id")), p_approve: approve, p_note: str(f, "note") || null });
    if (error) return fail(error.message);
    revalidatePath("/platform/billing");
    return ok(approve ? "Payment confirmed. The subscription has been extended." : "Payment rejected.");
  }) as Promise<FormState>;
}

export async function saveGateway(_: FormState, f: FormData): Promise<FormState> {
  return guarded("billing.manage", async (db) => {
    const key = str(f, "key");
    const { error } = await db.from("payment_gateways").update({
      is_enabled: f.get("is_enabled") === "on", mode: str(f, "mode") === "live" ? "live" : "test",
      public_key: str(f, "public_key") || null, supported_currencies: list(f, "currencies").map((c) => c.toUpperCase()), updated_at: new Date().toISOString(),
    }).eq("key", key);
    if (error) return fail(error.message);
    const secret = str(f, "secret_key"), hook = str(f, "webhook_secret");
    if (secret || hook) {
      const admin = createAdminClient();
      const { data: cur } = await admin.from("payment_gateway_secrets").select("secret_key, webhook_secret").eq("gateway_key", key).maybeSingle();
      const { error: se } = await admin.from("payment_gateway_secrets").upsert({
        gateway_key: key, secret_key: secret || cur?.secret_key || null, webhook_secret: hook || cur?.webhook_secret || null, updated_at: new Date().toISOString(),
      });
      if (se) return fail(se.message);
    }
    revalidatePath("/platform/billing");
    return ok("Gateway saved.");
  }) as Promise<FormState>;
}

export async function addBankAccount(_: FormState, f: FormData): Promise<FormState> {
  return guarded("billing.manage", async (db) => {
    const p = z.object({
      bank_name: z.string().min(2), account_name: z.string().min(2), account_number: z.string().min(4).max(40), currency: z.string().regex(/^[A-Z]{3}$/),
    }).safeParse({ bank_name: str(f, "bank_name"), account_name: str(f, "account_name"), account_number: str(f, "account_number"), currency: str(f, "currency").toUpperCase() });
    if (!p.success) return fail("Enter the bank, account name, account number and a 3-letter currency.");
    const { error } = await db.from("platform_bank_accounts").insert({
      ...p.data, country: str(f, "country") || null, swift_code: str(f, "swift_code") || null, iban: str(f, "iban") || null,
      routing_number: str(f, "routing_number") || null, sort_code: str(f, "sort_code") || null, instructions: str(f, "instructions") || null,
    });
    if (error) return fail(error.message);
    revalidatePath("/platform/billing");
    return ok("Bank account added. Businesses paying by transfer will see it.");
  }) as Promise<FormState>;
}

export async function toggleBankAccount(_: FormState, f: FormData): Promise<FormState> {
  return guarded("billing.manage", async (db) => {
    const { error } = await db.from("platform_bank_accounts").update({ is_active: str(f, "active") === "true" }).eq("id", z.uuid().parse(str(f, "id")));
    if (error) return fail(error.message);
    revalidatePath("/platform/billing");
    return ok("Updated");
  }) as Promise<FormState>;
}

// ---------------------------------------------------------------- Marketing (coupons)
export async function createCoupon(_: FormState, f: FormData): Promise<FormState> {
  return guarded("marketing.manage", async (db) => {
    const kind = z.enum(["percent", "fixed", "free_months", "trial_extension"]).parse(str(f, "kind"));
    const code = str(f, "code").toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return fail("Codes use 3–40 letters, numbers, hyphens or underscores.");
    const value = Number(str(f, "value"));
    if (!(value > 0) || (kind === "percent" && value > 100)) return fail(kind === "percent" ? "Enter a percentage between 1 and 100." : "Enter a value greater than zero.");
    const tenantIds = f.getAll("tenant_ids").map(String).filter(Boolean);
    const planIds = f.getAll("plan_ids").map(String).filter(Boolean);
    const periods = f.getAll("period_keys").map(String).filter(Boolean);
    const { error } = await db.from("coupons").insert({
      code, name: str(f, "name") || code, description: str(f, "description") || null, kind, value,
      currency: kind === "fixed" ? str(f, "currency").toUpperCase() || "NGN" : null,
      max_redemptions: num(f, "max_redemptions"), per_tenant_limit: num(f, "per_tenant_limit") ?? 1,
      starts_at: str(f, "starts_at") ? new Date(str(f, "starts_at")).toISOString() : null,
      expires_at: str(f, "expires_at") ? new Date(str(f, "expires_at")).toISOString() : null,
      tenant_ids: tenantIds.length ? tenantIds : null, plan_ids: planIds.length ? planIds : null, period_keys: periods.length ? periods : null,
      new_businesses_only: f.get("new_businesses_only") === "on", partner_id: str(f, "partner_id") || null,
    });
    if (error) return fail(error.code === "23505" ? "That code already exists." : error.message);
    revalidatePath("/platform/marketing");
    return ok(`Coupon ${code} created.`);
  }) as Promise<FormState>;
}

export async function toggleCoupon(_: FormState, f: FormData): Promise<FormState> {
  return guarded("marketing.manage", async (db) => {
    const { error } = await db.from("coupons").update({ is_active: str(f, "active") === "true" }).eq("id", z.uuid().parse(str(f, "id")));
    if (error) return fail(error.message);
    revalidatePath("/platform/marketing");
    return ok("Updated");
  }) as Promise<FormState>;
}

// ---------------------------------------------------------------- Help desk
export async function replyTicket(_: FormState, f: FormData): Promise<FormState> {
  return guarded("helpdesk.manage", async (db) => {
    const body = str(f, "body");
    if (!body) return fail("Write a reply.");
    const { data: me } = await db.auth.getUser();
    const id = z.uuid().parse(str(f, "ticketId"));
    const internal = f.get("internal") === "on";
    const { error } = await db.from("support_messages").insert({ ticket_id: id, author_id: me.user!.id, from_platform: true, is_internal: internal, body });
    if (error) return fail(error.message);
    const status = str(f, "status");
    await db.from("support_tickets").update({ status: status || (internal ? undefined : "pending"), assigned_to: me.user!.id }).eq("id", id);
    revalidatePath(`/platform/helpdesk/${id}`);
    return ok(internal ? "Internal note added." : "Reply sent.");
  }) as Promise<FormState>;
}

// ---------------------------------------------------------------- Partners
export async function createPartner(_: FormState, f: FormData): Promise<FormState> {
  return guarded("partners.manage", async (db) => {
    const p = z.object({ name: z.string().min(2), email: z.email(), referral_code: z.string().regex(/^[A-Z0-9_-]{3,30}$/), commission_percent: z.coerce.number().min(0).max(100) })
      .safeParse({ name: str(f, "name"), email: str(f, "email"), referral_code: str(f, "referral_code").toUpperCase(), commission_percent: str(f, "commission_percent") || "10" });
    if (!p.success) return fail("Enter a name, a valid email, a referral code (letters and numbers) and a commission.");
    const { error } = await db.from("partners").insert({ ...p.data, company: str(f, "company") || null, phone: str(f, "phone") || null, country: str(f, "country") || null });
    if (error) return fail(error.code === "23505" ? "That referral code is taken." : error.message);
    revalidatePath("/platform/partners");
    return ok(`${p.data.name} added as a partner.`);
  }) as Promise<FormState>;
}

// ---------------------------------------------------------------- Roles & users
export async function setPlatformRolePermission(_: FormState, f: FormData): Promise<FormState> {
  return guarded("users.manage", async (db) => {
    const role = str(f, "role"), perm = str(f, "permission");
    if (role === "super_admin") return fail("Super admins always have every permission.");
    const { error } = f.get("enabled") === "true"
      ? await db.from("platform_role_permissions").upsert({ role_key: role, permission_key: perm })
      : await db.from("platform_role_permissions").delete().eq("role_key", role).eq("permission_key", perm);
    if (error) return fail(error.message);
    revalidatePath("/platform/roles");
    return ok("Saved");
  }) as Promise<FormState>;
}

export async function setUserPlatformRole(_: FormState, f: FormData): Promise<FormState> {
  return guarded("users.manage", async (db) => {
    const { error } = await db.rpc("platform_set_user_role", { p_user: z.uuid().parse(str(f, "userId")), p_role: str(f, "role") || null });
    if (error) return fail(error.message);
    revalidatePath("/platform/users");
    return ok("Access updated.");
  }) as Promise<FormState>;
}

// ---------------------------------------------------------------- Modules
export async function setTenantModule(_: FormState, f: FormData): Promise<FormState> {
  return guarded("tenants.manage", async (db) => {
    const enabled = f.get("enabled") === "on";
    const tenant = z.uuid().parse(str(f, "tenantId"));
    const { error } = await db.rpc("platform_set_module", { p_tenant: tenant, p_module: "laundry_ops", p_enabled: enabled });
    if (error) return fail(error.message);
    revalidatePath(`/platform/organizations/${tenant}`);
    return ok(enabled ? "Laundry operations switched on. Roles, stages, areas and plans were set up; existing orders were kept." : "Laundry operations switched off. Data is kept and returns if you switch it back on.");
  }) as Promise<FormState>;
}
