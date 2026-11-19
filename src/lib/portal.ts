import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMemberships, getUser, type SessionUser } from "@/lib/auth/session";
import { CLENA_THEME, HEX, onColor, type Business, type PortalSettings } from "@/lib/portal-shared";

export * from "@/lib/portal-shared";

export const getBusiness = cache(async (slug: string): Promise<Business | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_business", { p_slug: slug });
  if (error) throw new Error(error.message);
  if (!data) return null;
  const b = data as Business;
  return {
    ...b,
    branding: b.branding ?? {},
    services: (b.services ?? []).map((s) => ({ ...s, price: Number(s.price), tax_rate: Number(s.tax_rate) })),
    offers: (b.offers ?? []).map((o) => ({ ...o, value: Number(o.value), min_order: Number(o.min_order) })),
    zones: (b.zones ?? []).map((z) => ({ ...z, delivery_fee: Number(z.delivery_fee), min_order: Number(z.min_order) })),
    plans: (b.plans ?? []).map((p) => ({ ...p, price: Number(p.price), included_kg: Number(p.included_kg) })),
    portal: b.portal
      ? { ...b.portal, delivery_fee: Number(b.portal.delivery_fee), service_charge_pct: Number(b.portal.service_charge_pct), min_order: Number(b.portal.min_order) }
      : (b.portal as unknown as PortalSettings),
  };
});

export async function requireBusiness(slug: string) {
  const b = await getBusiness(slug);
  if (!b) notFound();
  return b;
}

export function themeFor(b: Pick<Business, "branding">) {
  const br = b.branding ?? {};
  const primary = br.primary_color && HEX.test(br.primary_color) ? br.primary_color : CLENA_THEME.primary;
  const secondary = br.secondary_color && HEX.test(br.secondary_color) ? br.secondary_color : CLENA_THEME.secondary;
  const accent = br.accent_color && HEX.test(br.accent_color) ? br.accent_color : CLENA_THEME.accent;
  const radius = br.corner_style === "square" ? "8px" : br.corner_style === "soft" ? "14px" : "20px";
  return {
    "--p-primary": primary,
    "--p-secondary": secondary,
    "--p-accent": accent,
    "--p-on-primary": onColor(primary),
    "--p-on-accent": onColor(accent),
    "--p-radius": radius,
  } as React.CSSProperties;
}

export type PortalContext = {
  business: Business;
  user: SessionUser;
  customer: { id: string; full_name: string; phone: string | null; email: string | null; preferences: Record<string, unknown>;
              whatsapp_opt_in: boolean; sms_opt_in: boolean; email_opt_in: boolean };
};

export type PortalGate =
  | { state: "signed_out" }
  | { state: "ok"; ctx: PortalContext }
  | { state: "other_business"; otherName: string; otherSlug: string }
  | { state: "staff" }
  | { state: "not_joined"; user: SessionUser };

/**
 * Who is looking at this business's app? A customer login belongs to exactly
 * one business (enforced in the database); this only decides what to show.
 */
export const portalGate = cache(async (slug: string): Promise<PortalGate> => {
  const business = await requireBusiness(slug);
  const user = await getUser();
  if (!user) return { state: "signed_out" };
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("customers")
    .select("id, tenant_id, full_name, phone, email, preferences, whatsapp_opt_in, sms_opt_in, email_opt_in, tenants(name, slug)")
    .eq("user_id", user.id)
    .limit(1);
  const row = rows?.[0];
  if (row && row.tenant_id === business.id) {
    return { state: "ok", ctx: { business, user, customer: { ...row, preferences: (row.preferences ?? {}) as Record<string, unknown> } } };
  }
  if (row) {
    const t = row.tenants as unknown as { name: string; slug: string } | null;
    return { state: "other_business", otherName: t?.name ?? "another business", otherSlug: t?.slug ?? "" };
  }
  if ((await getMemberships()).length > 0) return { state: "staff" };
  return { state: "not_joined", user };
});

/** For pages that need a signed-in customer of THIS business. */
export async function requireCustomer(slug: string): Promise<PortalContext> {
  const gate = await portalGate(slug);
  if (gate.state === "ok") return gate.ctx;
  if (gate.state === "signed_out") redirect(`/b/${slug}/login?next=${encodeURIComponent(`/b/${slug}`)}`);
  redirect(`/b/${slug}`);
}

