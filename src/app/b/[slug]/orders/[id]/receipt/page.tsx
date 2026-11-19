import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PrintButton } from "@/components/portal/print-button";
import { BrandMark } from "@/components/portal/ui";
import { appName, requireCustomer } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { business, customer } = await requireCustomer(slug);
  const supabase = await createClient();
  const [{ data: o }, { data: pays }, { data: refunds }, { data: adjs }] = await Promise.all([
    supabase.from("orders").select("order_number, created_at, subtotal, tax_total, delivery_fee, service_fee, express_fee, discount_total, total, amount_paid, promo_code, order_items(description, quantity, unit_price, line_total)").eq("id", id).eq("customer_id", customer.id).maybeSingle(),
    supabase.from("payments").select("amount, method, reference, created_at").eq("order_id", id).eq("status", "successful").order("created_at"),
    supabase.from("refunds").select("amount, created_at").eq("order_id", id),
    supabase.from("order_adjustments").select("reason, amount").eq("order_id", id).eq("status", "applied"),
  ]);
  if (!o) notFound();
  const money = (n: number | string) => formatMoney(Number(n), business.currency);
  const when = (v: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: business.timezone }).format(new Date(v));
  let n = 0;
  const row = (k: string, v: string, b?: boolean) => <div key={n++} className={`flex justify-between ${b ? "font-semibold" : ""}`}><span>{k}</span><span className="tabular-nums">{v}</span></div>;
  return (
    <main className="min-h-dvh bg-[#F3F5F9] px-4 py-6 print:bg-white print:p-0">
      <div className="mx-auto max-w-md rounded-[var(--p-radius)] bg-white p-5 shadow-sm print:shadow-none">
        <div className="flex items-center gap-3 border-b border-[#EEF1F5] pb-4">
          <span className="rounded-lg p-1.5 [background:linear-gradient(135deg,var(--p-primary),var(--p-secondary))]"><BrandMark business={business} size={32} /></span>
          <div><p className="font-semibold">{appName(business)}</p><p className="text-[12px] text-[#6B7A90]">{business.address}</p></div>
        </div>
        <div className="mt-4 text-[13px]">
          <p className="text-[16px] font-semibold">Receipt · {o.order_number}</p>
          <p className="text-[#6B7A90]">{customer.full_name} · {when(o.created_at)}</p>
        </div>
        <div className="mt-4 grid gap-1.5 border-b border-dashed border-[#DCE2EB] pb-3 text-[13px]">
          {(o.order_items ?? []).map((it) => row(`${Number(it.quantity)} × ${it.description}`, money(it.line_total)))}
        </div>
        <div className="mt-3 grid gap-1.5 text-[13px]">
          {row("Services", money(o.subtotal))}
          {Number(o.tax_total) > 0 && row("Tax", money(o.tax_total))}
          {Number(o.service_fee) > 0 && row("Service charge", money(o.service_fee))}
          {Number(o.express_fee) > 0 && row("Express", money(o.express_fee))}
          {Number(o.delivery_fee) > 0 && row("Collection & delivery", money(o.delivery_fee))}
          {(adjs ?? []).map((a) => row(a.reason, money(a.amount)))}
          {Number(o.discount_total) > 0 && row(`Discount${o.promo_code ? ` (${o.promo_code})` : ""}`, `−${money(o.discount_total)}`)}
          <div className="border-t border-[#EEF1F5] pt-2">{row("Total", money(o.total), true)}</div>
          {(pays ?? []).map((p) => row(`Paid · ${p.method.replaceAll("_", " ")}${p.reference ? ` (${p.reference})` : ""}`, money(p.amount)))}
          {(refunds ?? []).map((r) => row("Refunded", `−${money(r.amount)}`))}
          {row("Balance", money(Math.max(Number(o.total) - Number(o.amount_paid), 0)), true)}
        </div>
        <p className="mt-5 text-center text-[11.5px] text-[#8A96A8]">Thank you for choosing {business.name}.</p>
      </div>
      <div className="mx-auto mt-4 max-w-md print:hidden"><PrintButton backHref={`/b/${slug}/orders/${id}`} /></div>
    </main>
  );
}
