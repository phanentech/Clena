import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge, Card, EmptyState, PageHeader, Select, Tabs, Textarea } from "@/components/ui/primitives";
import { can, requireTenant } from "@/lib/auth/session";
import { hasLaundryOps, memberNames } from "@/lib/ops";
import { INCIDENT_KINDS } from "@/lib/ops-shared";
import { createClient } from "@/lib/supabase/server";
import { updateIncident } from "../ops-actions";

export const metadata: Metadata = { title: "Incidents" };

const SEV = { high: "danger", medium: "warning", low: "neutral" } as const;

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { membership } = await requireTenant("orders.view");
  if (!(await hasLaundryOps(membership.tenantId))) notFound();
  const { status = "open" } = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("incidents").select("id, kind, severity, status, freezes_order, source, description, resolution, assigned_member_id, created_at, resolved_at, order_id, orders(order_number)")
    .eq("tenant_id", membership.tenantId).order("created_at", { ascending: false }).limit(100);
  q = status === "resolved" ? q.eq("status", "resolved") : q.in("status", ["open", "investigating"]);
  const [{ data }, { data: t }, names, { count: openCount }] = await Promise.all([
    q, supabase.from("tenants").select("timezone").eq("id", membership.tenantId).single(), memberNames(membership.tenantId),
    supabase.from("incidents").select("id", { count: "exact", head: true }).eq("tenant_id", membership.tenantId).in("status", ["open", "investigating"]),
  ]);
  const manage = can(membership, "incidents.manage");
  const when = (v: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: t?.timezone ?? "Africa/Lagos" }).format(new Date(v));
  const team = [...names.entries()];
  const incidents = data ?? [];
  return (
    <>
      <PageHeader title="Incidents" description="Missing or damaged items, complaints, delays and failed attempts. Frozen orders can't move until the incident is resolved." />
      <div className="mb-4"><Tabs active={status === "resolved" ? "resolved" : "open"} items={[{ key: "open", label: "Open", href: "/app/incidents", count: openCount }, { key: "resolved", label: "Resolved", href: "/app/incidents?status=resolved" }]} /></div>
      {incidents.length === 0 ? <Card><EmptyState icon={<ShieldAlert />} title={status === "resolved" ? "No resolved incidents yet" : "No open incidents"} description="Staff, drivers and customers report problems from their apps." /></Card> : (
        <div className="grid gap-3">
          {incidents.map((i) => {
            const k = INCIDENT_KINDS[i.kind];
            const on = (i.orders as unknown as { order_number: string } | null)?.order_number;
            return (
              <Card key={i.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{k?.label ?? i.kind}{on && <> · <Link href={`/app/orders/${i.order_id}`} className="text-teal-600">{on}</Link></>}</p>
                    <p className="text-xs text-muted">{when(i.created_at)} · reported by {i.source}{i.assigned_member_id ? ` · assigned to ${names.get(i.assigned_member_id)?.name ?? "team member"}` : ""}</p>
                  </div>
                  <div className="flex gap-1">
                    <Badge tone={SEV[i.severity as keyof typeof SEV]}>{i.severity}</Badge>
                    {i.freezes_order && i.status !== "resolved" && <Badge tone="danger">Order frozen</Badge>}
                    <Badge tone={i.status === "resolved" ? "success" : "info"}>{i.status}</Badge>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{i.description}</p>
                {k?.action && i.status !== "resolved" && <p className="mt-1 text-xs text-muted">Procedure: {k.action}</p>}
                {i.resolution && <p className="mt-2 rounded-lg bg-canvas p-2.5 text-sm"><span className="font-medium">Resolution:</span> {i.resolution}</p>}
                {manage && i.status !== "resolved" && (
                  <ActionForm action={updateIncident.bind(null, i.id)} className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[150px_180px_1fr]">
                    <Select name="status" defaultValue={i.status} aria-label="Status"><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option></Select>
                    <Select name="assign" defaultValue={i.assigned_member_id ?? ""} aria-label="Assign to"><option value="">Not assigned</option>{team.map(([id, m]) => <option key={id} value={id}>{m.name}</option>)}</Select>
                    <Textarea name="resolution" rows={1} placeholder="What was done / outcome (required to resolve)" aria-label="Resolution" />
                    <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="notify" className="size-4 accent-brand-600" />Tell the customer when resolved</label>
                    <div className="sm:text-right"><SubmitButton size="sm">Update</SubmitButton></div>
                  </ActionForm>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
