import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChecklistItem } from "@/components/ops/manage";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { can, requireTenant } from "@/lib/auth/session";
import { hasLaundryOps, memberNames, queueCounts } from "@/lib/ops";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Daily checklist" };

type Item = { key: string; label: string; count?: string; href?: string; hint?: (c: Record<string, number>) => string };

const SECTIONS: { title: string; items: Item[] }[] = [
  { title: "Start of day", items: [
    { key: "review_pickups", label: "Review today's pickups and deliveries", count: "pickups_today", href: "/app/dispatch", hint: (c) => `${c.pickups_today ?? 0} pickups, ${c.deliveries_today ?? 0} deliveries scheduled` },
    { key: "assign_drivers", label: "Assign every job to a driver", count: "unassigned_jobs", href: "/app/dispatch", hint: (c) => `${c.unassigned_jobs ?? 0} unassigned` },
    { key: "confirm_partner", label: "Confirm partner capacity and batches due back", count: "at_partner", href: "/app/partners", hint: (c) => `${c.at_partner ?? 0} batches at partner` },
    { key: "check_supplies", label: "Check bags, tags, labels and packaging stock" },
    { key: "reply_messages", label: "Reply to overnight customer messages", href: "/app/messages" },
  ] },
  { title: "During the day", items: [
    { key: "receive_orders", label: "Receive, tag and weigh incoming orders", count: "awaiting_receiving", href: "/staff", hint: (c) => `${c.awaiting_receiving ?? 0} waiting, ${c.sorting ?? 0} in sorting` },
    { key: "price_approvals", label: "Follow up price approvals with customers", count: "pending_approvals", href: "/app/orders", hint: (c) => `${c.pending_approvals ?? 0} waiting for the customer` },
    { key: "quality_checks", label: "Quality-check everything back from processing", count: "quality", href: "/staff", hint: (c) => `${c.quality ?? 0} in quality check` },
    { key: "failed_attempts", label: "Reschedule failed pickups and deliveries", count: "failed_jobs", href: "/app/dispatch?view=failed", hint: (c) => `${c.failed_jobs ?? 0} need a new attempt` },
    { key: "incidents", label: "Work open incidents and complaints", count: "open_incidents", href: "/app/incidents", hint: (c) => `${c.open_incidents ?? 0} open` },
  ] },
  { title: "End of day", items: [
    { key: "overdue_review", label: "Review overdue orders and tell affected customers", count: "overdue", href: "/staff/exceptions", hint: (c) => `${c.overdue ?? 0} overdue` },
    { key: "reconcile_payments", label: "Reconcile cash, transfers and POS collected by drivers", href: "/app/payments" },
    { key: "ready_tomorrow", label: "Confirm ready orders are scheduled for delivery", count: "ready", href: "/app/dispatch?view=upcoming", hint: (c) => `${c.ready ?? 0} ready` },
    { key: "secure_items", label: "Secure customer items and lock up the facility" },
  ] },
];

export default async function ChecklistPage() {
  const { membership } = await requireTenant("orders.view");
  if (!(await hasLaundryOps(membership.tenantId))) notFound();
  const supabase = await createClient();
  const { data: t } = await supabase.from("tenants").select("timezone").eq("id", membership.tenantId).single();
  const tz = t?.timezone ?? "Africa/Lagos";
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [counts, { data: marks }] = await Promise.all([
    queueCounts(membership.tenantId),
    supabase.from("ops_checklist_marks").select("item_key, done_by").eq("tenant_id", membership.tenantId).eq("day", day),
  ]);
  const { data: members } = await supabase.from("tenant_members").select("id, user_id").eq("tenant_id", membership.tenantId);
  const names = await memberNames(membership.tenantId);
  const byUser = new Map((members ?? []).map((m) => [m.user_id, names.get(m.id)?.name]));
  const done = new Map((marks ?? []).map((m) => [m.item_key, m.done_by ? byUser.get(m.done_by) ?? null : null]));
  const total = SECTIONS.reduce((a, s) => a + s.items.length, 0);
  const canEdit = can(membership, "orders.manage") || can(membership, "logistics.manage");
  const label = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(new Date());
  return (
    <>
      <PageHeader title="Daily checklist" description={`${label} · ${done.size} of ${total} done`} />
      <div className="grid gap-5 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Card key={s.title} className="self-start">
            <CardHeader title={s.title} />
            <div className="divide-y divide-line">
              {s.items.map((it) => (
                <div key={it.key} className="flex items-center">
                  <div className="flex-1"><ChecklistItem day={day} itemKey={it.key} label={it.label} hint={it.hint?.(counts)} done={done.has(it.key)} doneBy={done.get(it.key)} canEdit={canEdit} /></div>
                  {it.href && <Link href={it.href} className="pe-4 text-xs font-medium text-teal-600">Open</Link>}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
