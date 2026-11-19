import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/utils";
import { openTicket } from "./actions";

export const metadata: Metadata = { title: "Help & support" };

export default async function SupportPage() {
  const { membership } = await requireTenant();
  const supabase = await createClient();
  const { data: tickets } = await supabase.from("support_tickets").select("id, number, subject, status, updated_at").eq("tenant_id", membership.tenantId).order("updated_at", { ascending: false });
  return (
    <>
      <PageHeader title="Help & support" description="Ask the Clena team a question or report a problem." />
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <Card className="self-start">
          <CardHeader title="Your requests" />
          <ul className="divide-y divide-line">
            {(tickets ?? []).map((t) => (
              <li key={t.id}><Link href={`/app/support/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-subtle">
                <div><p className="text-[13px] font-medium">{t.subject}</p><p className="text-xs text-faint">{t.number}, updated {formatDateTime(t.updated_at)}</p></div>
                <Badge tone={t.status === "pending" ? "warning" : t.status === "open" ? "info" : "success"}>{t.status === "pending" ? "reply from Clena" : t.status}</Badge>
              </Link></li>
            ))}
            {!tickets?.length && <li className="px-4 py-10 text-center text-[13px] text-muted">No requests yet.</li>}
          </ul>
        </Card>
        <Card className="self-start">
          <CardHeader title="New request" />
          <ActionForm action={openTicket} className="grid gap-4 p-4">
            <Field label="Subject" htmlFor="subject"><Input id="subject" name="subject" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Topic" htmlFor="category"><Select id="category" name="category" defaultValue="question"><option value="question">Question</option><option value="billing">Billing</option><option value="bug">Something isn&apos;t working</option><option value="feature">Feature idea</option><option value="account">My account</option><option value="other">Other</option></Select></Field>
              <Field label="Urgency" htmlFor="priority"><Select id="priority" name="priority" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent, we can&apos;t work</option></Select></Field>
            </div>
            <Field label="What do you need?" htmlFor="body"><Textarea id="body" name="body" className="min-h-32" /></Field>
            <SubmitButton pendingLabel="Sending…">Send request</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
