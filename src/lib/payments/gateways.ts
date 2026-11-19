import "server-only";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/** Gateways with a working checkout integration. Others can be configured but stay unavailable at checkout. */
export const CHECKOUT_GATEWAYS = ["paystack", "flutterwave", "stripe"] as const;
export type CheckoutGateway = (typeof CHECKOUT_GATEWAYS)[number];

type Invoice = { id: string; number: string; total: number; currency: string; tenant_id: string };

async function secretsFor(gateway: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("payment_gateway_secrets").select("secret_key, webhook_secret").eq("gateway_key", gateway).maybeSingle();
  if (!data?.secret_key) throw new Error(`${gateway} is not fully configured. Add its secret key in the platform console.`);
  return data as { secret_key: string; webhook_secret: string | null };
}

/** Smallest currency unit (kobo, cents). */
const minor = (amount: number) => Math.round(amount * 100);

export async function initializePayment(gateway: CheckoutGateway, invoice: Invoice, payerEmail: string, callbackUrl: string): Promise<string> {
  const { secret_key } = await secretsFor(gateway);
  if (gateway === "paystack") {
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret_key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: payerEmail, amount: minor(invoice.total), currency: invoice.currency, reference: invoice.number, callback_url: callbackUrl, metadata: { invoice_id: invoice.id, tenant_id: invoice.tenant_id } }),
    });
    const body = await res.json();
    if (!res.ok || !body.status) throw new Error(body.message ?? "Paystack could not start the payment");
    return body.data.authorization_url as string;
  }
  if (gateway === "flutterwave") {
    const res = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret_key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tx_ref: invoice.number, amount: invoice.total, currency: invoice.currency, redirect_url: callbackUrl, customer: { email: payerEmail }, meta: { invoice_id: invoice.id }, customizations: { title: "Clena subscription" } }),
    });
    const body = await res.json();
    if (!res.ok || body.status !== "success") throw new Error(body.message ?? "Flutterwave could not start the payment");
    return body.data.link as string;
  }
  // Stripe Checkout
  const form = new URLSearchParams({
    mode: "payment",
    success_url: `${callbackUrl}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: callbackUrl.replace("/api/billing/callback", "/app/settings/plan"),
    client_reference_id: invoice.id,
    customer_email: payerEmail,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": invoice.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(minor(invoice.total)),
    "line_items[0][price_data][product_data][name]": `Clena subscription ${invoice.number}`,
    "metadata[invoice_id]": invoice.id,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST", headers: { Authorization: `Bearer ${secret_key}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? "Stripe could not start the payment");
  return body.url as string;
}

export type Verified = { ok: boolean; amount: number; currency: string; reference: string; invoiceId?: string };

/** Ask the provider directly whether a payment succeeded. Never trust redirects alone. */
export async function verifyPayment(gateway: CheckoutGateway, reference: string): Promise<Verified> {
  const { secret_key } = await secretsFor(gateway);
  if (gateway === "paystack") {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret_key}` } });
    const body = await res.json();
    const d = body.data ?? {};
    return { ok: res.ok && d.status === "success", amount: (d.amount ?? 0) / 100, currency: d.currency, reference: d.reference, invoiceId: d.metadata?.invoice_id };
  }
  if (gateway === "flutterwave") {
    const res = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret_key}` } });
    const body = await res.json();
    const d = body.data ?? {};
    return { ok: res.ok && d.status === "successful", amount: Number(d.amount ?? 0), currency: d.currency, reference: d.tx_ref, invoiceId: d.meta?.invoice_id };
  }
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret_key}` } });
  const d = await res.json();
  return { ok: res.ok && d.payment_status === "paid", amount: (d.amount_total ?? 0) / 100, currency: String(d.currency ?? "").toUpperCase(), reference: d.id, invoiceId: d.metadata?.invoice_id };
}

/** Marks the invoice paid after verification; the database rejects wrong amounts and is idempotent. */
export async function confirmVerified(v: Verified, fallbackInvoiceNumber?: string) {
  const admin = createAdminClient();
  let invoiceId = v.invoiceId;
  if (!invoiceId && fallbackInvoiceNumber) {
    const { data } = await admin.from("saas_invoices").select("id").eq("number", fallbackInvoiceNumber).maybeSingle();
    invoiceId = data?.id;
  }
  if (!invoiceId) throw new Error("Payment does not match an invoice");
  const { error } = await admin.rpc("gateway_confirm_invoice", { p_invoice: invoiceId, p_reference: v.reference, p_amount: v.amount, p_currency: v.currency });
  if (error) throw new Error(error.message);
  return invoiceId;
}

export async function verifyWebhookSignature(gateway: CheckoutGateway, rawBody: string, headers: Headers) {
  const { secret_key, webhook_secret } = await secretsFor(gateway);
  if (gateway === "paystack") {
    const expected = crypto.createHmac("sha512", secret_key).update(rawBody).digest("hex");
    const got = headers.get("x-paystack-signature") ?? "";
    return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  }
  if (gateway === "flutterwave") {
    const got = headers.get("verif-hash") ?? "";
    return Boolean(webhook_secret) && got.length === webhook_secret!.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(webhook_secret!));
  }
  const sig = headers.get("stripe-signature") ?? "";
  const parts = Object.fromEntries(sig.split(",").map((p) => p.split("=") as [string, string]));
  if (!webhook_secret || !parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = crypto.createHmac("sha256", webhook_secret).update(`${parts.t}.${rawBody}`).digest("hex");
  return parts.v1.length === expected.length && crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
}
