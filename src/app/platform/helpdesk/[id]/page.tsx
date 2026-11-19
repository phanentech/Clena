import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Badge, Card, CardHeader, DescriptionList, Select, Textarea } from "@/components/ui/primitives";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient } from "@/lib/supabase/server";
import { requirePlatform } from "@/lib/auth/session";
import { cn, formatDateTime } from "@/lib/utils";
import { replyTicket } from "../../actions";

export const metadata: Metadata = { title: "Ticket" };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatform("helpdesk.manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: t } = await supabase.from("support_tickets").select("*, tenants(id, name, slug)").eq("id", id).maybeSingle();
  if (!t) notFound();
  const { data: messages } = await supabase.from("support_messages").select("id, body, from_platform, is_internal, created_at, author_id").eq("ticket_id", id).order("created_at");
  const tenant = t.tenants as { id: string; name: string } | null;
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <div className="grid gap-5">
        <div>
          <Link href="/platform/helpdesk" className="text-xs font-medium text-muted hover:text-ink">← Help desk</Link>
          <h1 className="mt-1 text-[22px] font-semibold">{t.subject}</h1>
        </div>
        <Card>
          <ol className="divide-y divide-line">
            {(messages ?? []).map((m) => (
              <li key={m.id} className={cn("px-4 py-3", m.is_internal && "bg-warning-50/60")}>
                <p className="text-xs text-muted">{m.from_platform ? (m.is_internal ? "Internal note" : "Clena support") : tenant?.name}, {formatDateTime(m.created_at)}</p>
                <p className="mt-1 whitespace-pre-wrap text-[13px]">{m.body}</p>
              </li>
            ))}
            {!messages?.length && <li className="px-4 py-6 text-center text-[13px] text-muted">No messages yet.</li>}
          </ol>
          <ActionForm action={replyTicket} resetOnSuccess className="grid gap-3 border-t border-line p-4">
            <input type="hidden" name="ticketId" value={t.id} />
            <Textarea name="body" placeholder="Write a reply to the business…" aria-label="Reply" />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="internal" className="size-4 accent-navy-900" />Internal note (business can&apos;t see it)</label>
              <Select name="status" defaultValue="" className="ml-auto w-48" aria-label="Set status">
                <option value="">Waiting on business</option><option value="open">Keep open</option><option value="resolved">Mark resolved</option><option value="closed">Close</option>
              </Select>
              <SubmitButton pendingLabel="Sending…">Send</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </div>
      <Card className="self-start">
        <CardHeader title="Details" />
        <div className="px-4 py-1">
          <DescriptionList items={[
            ["Ticket", t.number], ["Business", tenant ? <Link key="b" href={`/platform/organizations/${tenant.id}`} className="text-teal-600 hover:underline">{tenant.name}</Link> : "—"],
            ["Category", t.category], ["Priority", <Badge key="p">{t.priority}</Badge>], ["Status", t.status], ["Opened", formatDateTime(t.created_at)],
          ]} />
        </div>
      </Card>
    </div>
  );
}
