import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Badge, Card, PageHeader, Textarea } from "@/components/ui/primitives";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/session";
import { cn, formatDateTime } from "@/lib/utils";
import { replyAsBusiness } from "../actions";

export const metadata: Metadata = { title: "Support request" };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { membership } = await requireTenant();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: t } = await supabase.from("support_tickets").select("*").eq("id", id).eq("tenant_id", membership.tenantId).maybeSingle();
  if (!t) notFound();
  const { data: messages } = await supabase.from("support_messages").select("id, body, from_platform, created_at").eq("ticket_id", id).order("created_at");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/app/support", label: "Help & support" }} title={t.subject} description={<span className="flex items-center gap-2">{t.number}<Badge>{t.status}</Badge></span>} />
      <Card>
        <ol className="divide-y divide-line">
          {(messages ?? []).map((m) => (
            <li key={m.id} className={cn("px-4 py-3", m.from_platform && "bg-teal-50/60")}>
              <p className="text-xs text-muted">{m.from_platform ? "Clena support" : "You"}, {formatDateTime(m.created_at)}</p>
              <p className="mt-1 whitespace-pre-wrap text-[13px]">{m.body}</p>
            </li>
          ))}
        </ol>
        {t.status !== "closed" && (
          <ActionForm action={replyAsBusiness} resetOnSuccess className="grid gap-3 border-t border-line p-4">
            <input type="hidden" name="ticketId" value={t.id} />
            <Textarea name="body" placeholder="Reply…" aria-label="Reply" />
            <div className="flex justify-end"><SubmitButton pendingLabel="Sending…">Send</SubmitButton></div>
          </ActionForm>
        )}
      </Card>
    </div>
  );
}
