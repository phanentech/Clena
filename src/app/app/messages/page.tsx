import Link from "next/link";
import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";
import { Avatar, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireTenant } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const { membership } = await requireTenant("customers.view");
  const supabase = await createClient();
  const { data: convs, error } = await supabase.rpc("customer_conversations", { p_tenant: membership.tenantId });
  if (error) throw new Error(error.message);
  const unread = (convs ?? []).reduce((s: number, c: { unread: number }) => s + c.unread, 0);
  return (
    <>
      <PageHeader title="Messages" description={unread ? `${unread} unread from customers` : "Chats from customers using your customer app."} />
      <Card>
        {!convs?.length ? (
          <EmptyState icon={<MessagesSquare />} title="No messages yet" description="When customers use Support in your customer app, their messages arrive here." />
        ) : (
          <ul className="divide-y divide-line">
            {convs.map((c: { customer_id: string; full_name: string; phone: string | null; last_body: string; last_sender: string; last_at: string; unread: number }) => (
              <li key={c.customer_id}>
                <Link href={`/app/messages/${c.customer_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle/60">
                  <Avatar name={c.full_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className={c.unread ? "truncate font-semibold" : "truncate font-medium"}>{c.full_name}</p>
                      <span className="shrink-0 text-xs text-faint">{formatDateTime(c.last_at)}</span>
                    </div>
                    <p className="truncate text-[13px] text-muted">{c.last_sender === "business" ? "You: " : ""}{c.last_body}</p>
                  </div>
                  {c.unread > 0 && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-500 text-[10.5px] font-bold text-navy-950">{c.unread}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
