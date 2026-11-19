import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChatComposer, ChatThread, type ChatMessage } from "@/components/portal/chat";
import { Card, PageHeader } from "@/components/ui/primitives";
import { requireTenant } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { replyToCustomer } from "../../settings/portal-actions";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireTenant("customers.view");
  const supabase = await createClient();
  const [{ data: customer }, { data: msgs }, { data: t }] = await Promise.all([
    supabase.from("customers").select("id, full_name, phone, email").eq("id", id).eq("tenant_id", membership.tenantId).maybeSingle(),
    supabase.from("customer_messages").select("id, sender, body, created_at, orders(order_number)").eq("customer_id", id).eq("tenant_id", membership.tenantId).order("created_at").limit(300),
    supabase.from("tenants").select("timezone").eq("id", membership.tenantId).single(),
  ]);
  if (!customer) notFound();
  await supabase.rpc("mark_conversation_read", { p_tenant: membership.tenantId, p_customer: id });
  const messages: ChatMessage[] = (msgs ?? []).map((m) => ({
    id: m.id, sender: m.sender as ChatMessage["sender"], body: m.body, created_at: m.created_at,
    order_number: (m.orders as unknown as { order_number: string } | null)?.order_number ?? null,
  }));
  const canReply = membership.permissions.includes("customers.manage");
  return (
    <>
      <PageHeader title={customer.full_name} back={{ href: "/app/messages", label: "Messages" }}
        description={<>{[customer.phone, customer.email].filter(Boolean).join(" · ")} · <Link href={`/app/customers/${customer.id}`} className="font-medium text-teal-600 hover:underline">Customer profile</Link></>} />
      <Card className="mx-auto flex min-h-[460px] max-w-3xl flex-col p-4">
        <div className="flex-1"><ChatThread messages={messages} mine="business" timeZone={t?.timezone ?? "Africa/Lagos"} emptyText="No messages yet." /></div>
        {canReply && <div className="mt-4"><ChatComposer action={replyToCustomer.bind(null, customer.id)} placeholder={`Reply to ${customer.full_name.split(" ")[0]}`} /></div>}
      </Card>
    </>
  );
}
