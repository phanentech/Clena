"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/auth/session";
import { CHECKOUT_GATEWAYS, initializePayment, type CheckoutGateway } from "@/lib/payments/gateways";
import type { FormState } from "@/app/auth/actions";

export type Quote = {
  monthly_price: number; months: number; subtotal: number; period_discount_percent: number; period_discount: number;
  coupon_code: string | null; coupon_name: string | null; coupon_kind: string | null; coupon_discount: number; bonus_months: number; total: number; currency: string;
};

export async function getQuote(input: { planId: string; period: string; currency: string; coupon?: string }): Promise<{ quote?: Quote; error?: string }> {
  const { membership } = await assertPermission("billing.manage");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quote_subscription", {
    p_tenant: membership.tenantId, p_plan: z.uuid().parse(input.planId), p_period: input.period, p_currency: input.currency, p_coupon: input.coupon?.trim() || null,
  });
  if (error) return { error: error.message };
  return { quote: data as Quote };
}

export async function checkout(_: FormState, f: FormData): Promise<FormState> {
  const { user, membership } = await assertPermission("billing.manage");
  const gateway = String(f.get("gateway") ?? "");
  const supabase = await createClient();
  const { data: invoiceId, error } = await supabase.rpc("start_saas_checkout", {
    p_tenant: membership.tenantId, p_plan: z.uuid().parse(f.get("planId")), p_period: String(f.get("period")),
    p_currency: String(f.get("currency")), p_gateway: gateway, p_coupon: String(f.get("coupon") ?? "").trim() || null,
  });
  if (error) return { error: error.message };
  if (gateway === "bank_transfer") redirect(`/app/settings/plan/invoice/${invoiceId}`);

  if (!CHECKOUT_GATEWAYS.includes(gateway as CheckoutGateway)) return { error: "That payment method isn't available yet. Choose another." };
  const { data: inv } = await supabase.from("saas_invoices").select("id, number, total, currency, tenant_id").eq("id", invoiceId as string).single();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  let url: string;
  try {
    url = await initializePayment(gateway as CheckoutGateway, { ...inv!, total: Number(inv!.total) }, user.email ?? "", `${origin}/api/billing/callback?gateway=${gateway}`);
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect(url);
}

export async function submitTransfer(_: FormState, f: FormData): Promise<FormState> {
  await assertPermission("billing.manage");
  const supabase = await createClient();
  const id = z.uuid().parse(f.get("invoiceId"));
  const { error } = await supabase.rpc("submit_bank_transfer", { p_invoice: id, p_reference: String(f.get("reference") ?? ""), p_note: String(f.get("note") ?? "") || null });
  if (error) return { error: error.message };
  revalidatePath("/app/settings/plan");
  return { success: "Thanks. We'll confirm your transfer, usually within one business day, and extend your subscription." };
}

export async function applyTrialCoupon(_: FormState, f: FormData): Promise<FormState> {
  const { membership } = await assertPermission("billing.manage");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_trial_coupon", { p_tenant: membership.tenantId, p_code: String(f.get("code") ?? "") });
  if (error) return { error: error.message };
  revalidatePath("/app/settings/plan");
  return { success: `Trial extended to ${new Date(data as string).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.` };
}
