import Link from "next/link";
import type { Metadata } from "next";
import { Receipt, Wallet } from "lucide-react";
import { PCard, PortalScreen } from "@/components/portal/ui";
import { requireCustomer } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { business, customer } = await requireCustomer(slug);
  const supabase = await createClient();
  const [{ data: pays }, { data: open }] = await Promise.all([
    supabase.from("payments").select("id, amount, method, created_at, order_id, orders(order_number)").eq("customer_id", customer.id).eq("status", "successful").order("created_at", { ascending: false }).limit(50),
    supabase.from("orders").select("id, order_number, total, amount_paid").eq("customer_id", customer.id).is("cancelled_at", null).gt("total", 0),
  ]);
  const money = (n: number | string) => formatMoney(Number(n), business.currency);
  const owing = (open ?? []).filter((o) => Number(o.total) > Number(o.amount_paid));
  const balance = owing.reduce((a, o) => a + Number(o.total) - Number(o.amount_paid), 0);
  const when = (v: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: business.timezone }).format(new Date(v));
  return (
    <PortalScreen business={business} title="Payments & receipts" back={`/b/${slug}/profile`}>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr] lg:items-start">
        <PCard className="p-4">
          <p className="flex items-center gap-2 text-[13px] text-[#6B7A90]"><Wallet className="size-4" />Balance to pay</p>
          <p className="mt-1 text-[26px] font-semibold tabular-nums">{money(balance)}</p>
          {owing.map((o) => <Link key={o.id} href={`/b/${slug}/orders/${o.id}`} className="mt-1 flex justify-between text-[12.5px] text-[var(--p-secondary)]"><span>{o.order_number}</span><span>{money(Number(o.total) - Number(o.amount_paid))}</span></Link>)}
        </PCard>
        <PCard className="divide-y divide-[#EEF1F5]">
          {(pays ?? []).length === 0 && <p className="p-6 text-center text-[13px] text-[#8A96A8]">Your payments will appear here.</p>}
          {(pays ?? []).map((p) => (
            <Link key={p.id} href={p.order_id ? `/b/${slug}/orders/${p.order_id}/receipt` : "#"} className="flex items-center gap-3 px-4 py-3 text-[13px] hover:bg-[#F6F8FB]">
              <Receipt className="size-4 text-[#9AA5B5]" />
              <span className="min-w-0 flex-1"><span className="block font-medium">{(p.orders as unknown as { order_number: string } | null)?.order_number ?? "Payment"}</span><span className="text-[11.5px] capitalize text-[#8A96A8]">{when(p.created_at)} · {p.method.replaceAll("_", " ")}</span></span>
              <span className="font-semibold tabular-nums">{money(p.amount)}</span>
            </Link>
          ))}
        </PCard>
      </div>
    </PortalScreen>
  );
}
