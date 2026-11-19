import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Card, Table, Td, Th, Tabs, type Tone } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { requirePlatform } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Help Desk" };
const PRIORITY_TONE: Record<string, Tone> = { low: "neutral", normal: "info", high: "warning", urgent: "danger" };

export default async function HelpdeskPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePlatform("helpdesk.manage");
  const { status = "open" } = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("support_tickets").select("id, number, subject, category, priority, status, updated_at, tenants(name)").order("updated_at", { ascending: false }).limit(100);
  q = status === "open" ? q.in("status", ["open", "pending"]) : q.eq("status", status);
  const { data: tickets } = await q;
  return (
    <>
      <Tabs active={status} items={[
        { key: "open", label: "Open", href: "/platform/helpdesk" },
        { key: "resolved", label: "Resolved", href: "/platform/helpdesk?status=resolved" },
        { key: "closed", label: "Closed", href: "/platform/helpdesk?status=closed" },
      ]} />
      <Card className="mt-5">
        <Table>
          <thead><tr><Th>Ticket</Th><Th>Business</Th><Th className="hidden md:table-cell">Category</Th><Th>Priority</Th><Th>Status</Th><Th className="hidden lg:table-cell">Updated</Th></tr></thead>
          <tbody>
            {(tickets ?? []).map((t) => (
              <tr key={t.id} className="hover:bg-canvas/60">
                <Td><Link href={`/platform/helpdesk/${t.id}`} className="font-semibold hover:text-teal-600">{t.subject}</Link><p className="text-xs text-faint">{t.number}</p></Td>
                <Td>{(t.tenants as unknown as { name: string } | null)?.name}</Td>
                <Td className="hidden capitalize md:table-cell">{t.category}</Td>
                <Td><Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge></Td>
                <Td><Badge tone={t.status === "open" ? "warning" : t.status === "pending" ? "info" : "success"}>{t.status === "pending" ? "waiting on business" : t.status}</Badge></Td>
                <Td className="hidden text-muted lg:table-cell">{formatDateTime(t.updated_at)}</Td>
              </tr>
            ))}
            {!tickets?.length && <tr><Td colSpan={6} className="py-10 text-center text-muted">No tickets here.</Td></tr>}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
