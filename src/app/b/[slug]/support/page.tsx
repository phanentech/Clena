import type { Metadata } from "next";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { ChatComposer, ChatThread, type ChatMessage } from "@/components/portal/chat";
import { PCard, PortalScreen } from "@/components/portal/ui";
import { requireCustomer } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { sendMessage } from "../actions";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ order?: string }> }) {
  const { slug } = await params;
  const { order } = await searchParams;
  const { business, customer } = await requireCustomer(slug);
  const supabase = await createClient();
  const { data } = await supabase.from("customer_messages").select("id, sender, body, created_at, orders(order_number)")
    .eq("customer_id", customer.id).order("created_at").limit(200);
  await supabase.rpc("mark_conversation_read", { p_tenant: business.id });
  let orderNumber: string | null = null;
  if (order) {
    const { data: o } = await supabase.from("orders").select("order_number").eq("id", order).maybeSingle();
    orderNumber = o?.order_number ?? null;
  }
  const messages: ChatMessage[] = (data ?? []).map((m) => ({
    id: m.id, sender: m.sender as ChatMessage["sender"], body: m.body, created_at: m.created_at,
    order_number: (m.orders as unknown as { order_number: string } | null)?.order_number ?? null,
  }));
  const p = business.portal;
  const wa = p.support_whatsapp?.replace(/[^0-9]/g, "");

  return (
    <PortalScreen business={business} title="Support" subtitle={`Chat with the ${business.name} team. We usually reply within working hours.`} back={`/b/${slug}`}>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px] lg:items-start">
        <PCard className="flex min-h-[420px] flex-col p-4">
          <div className="flex-1"><ChatThread messages={messages} mine="customer" timeZone={business.timezone} emptyText="Ask us anything about your orders, prices or pickups." /></div>
          <div className="mt-4">
            {orderNumber && <p className="mb-2 px-2 text-[12px] text-[#6B7A90]">About order {orderNumber}</p>}
            <ChatComposer action={sendMessage.bind(null, slug)} orderId={orderNumber ? order : null} />
          </div>
        </PCard>
        {(p.support_phone || wa || p.support_email) && (
          <PCard className="grid gap-1 p-2">
            <p className="px-2 pt-2 text-[13px] font-semibold">Other ways to reach us</p>
            {p.support_phone && <a href={`tel:${p.support_phone}`} className="flex items-center gap-3 rounded-[calc(var(--p-radius)*0.6)] p-2.5 text-[13.5px] hover:bg-[#F6F8FB]"><Phone className="size-4 text-[var(--p-secondary)]" />{p.support_phone}</a>}
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-[calc(var(--p-radius)*0.6)] p-2.5 text-[13.5px] hover:bg-[#F6F8FB]"><MessageCircle className="size-4 text-[var(--p-secondary)]" />WhatsApp</a>}
            {p.support_email && <a href={`mailto:${p.support_email}`} className="flex items-center gap-3 rounded-[calc(var(--p-radius)*0.6)] p-2.5 text-[13.5px] hover:bg-[#F6F8FB]"><Mail className="size-4 text-[var(--p-secondary)]" />{p.support_email}</a>}
          </PCard>
        )}
      </div>
    </PortalScreen>
  );
}
