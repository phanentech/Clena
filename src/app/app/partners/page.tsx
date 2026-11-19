import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Factory } from "lucide-react";
import { ReceiveBatchButton } from "@/components/ops/manage";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge, Card, CardHeader, EmptyState, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";
import { can, requireTenant } from "@/lib/auth/session";
import { getStages, hasLaundryOps } from "@/lib/ops";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils";
import { savePartner, sendToPartner } from "../ops-actions";

export const metadata: Metadata = { title: "Processing partners" };

export default async function PartnersPage() {
  const { membership } = await requireTenant("orders.view");
  if (!(await hasLaundryOps(membership.tenantId))) notFound();
  const supabase = await createClient();
  const stages = await getStages(membership.tenantId);
  const eligibleStages = stages.filter((s) => ["received", "sorting", "processing"].includes(s.key)).map((s) => s.id);
  const [{ data: partners }, { data: batches }, { data: t }] = await Promise.all([
    supabase.from("processing_partners").select("*").eq("tenant_id", membership.tenantId).order("name"),
    supabase.from("partner_batches").select("id, partner_id, reference, status, bag_count, weight_kg, sent_at, expected_back_at, returned_at, partner_batch_orders(order_id, orders(order_number))")
      .eq("tenant_id", membership.tenantId).order("sent_at", { ascending: false }).limit(40),
    supabase.from("tenants").select("timezone, currency").eq("id", membership.tenantId).single(),
  ]);
  const outIds = new Set((batches ?? []).filter((b) => b.status === "sent").flatMap((b) => (b.partner_batch_orders ?? []).map((x) => x.order_id)));
  const { data: candidates } = eligibleStages.length ? await supabase.from("orders").select("id, order_number, received_weight_kg, received_item_count, on_hold, customers(full_name), current_stage_id")
    .eq("tenant_id", membership.tenantId).is("cancelled_at", null).in("current_stage_id", eligibleStages).order("created_at").limit(80) : { data: [] };
  const ready = (candidates ?? []).filter((o) => !outIds.has(o.id) && !o.on_hold);
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const pname = new Map((partners ?? []).map((p) => [p.id, p.name]));
  const tz = t?.timezone ?? "Africa/Lagos";
  const when = (v: string | null) => (v ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(v)) : "—");
  const manageSettings = can(membership, "settings.manage");
  const send = can(membership, "orders.manage") || can(membership, "ops.process");
  const active = (partners ?? []).filter((p) => p.is_active);

  return (
    <>
      <PageHeader title="Processing partners" description="Send orders to the laundry that cleans them for you, track each batch and receive it back into quality control." />
      <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
        <div className="grid gap-5">
          <Card>
            <CardHeader title="Batches" description={`${(batches ?? []).filter((b) => b.status === "sent").length} out now`} />
            {!(batches ?? []).length ? <EmptyState icon={<Factory />} title="No batches yet" description="Send your first batch from the form." /> : (
              <Table>
                <thead><tr><Th>Batch</Th><Th>Partner</Th><Th>Orders</Th><Th>Sent</Th><Th>Due back</Th><Th>Status</Th><Th /></tr></thead>
                <tbody>
                  {(batches ?? []).map((b) => {
                    const late = b.status === "sent" && b.expected_back_at && new Date(b.expected_back_at) < new Date();
                    return (
                      <tr key={b.id}>
                        <Td className="font-semibold tnum">{b.reference}</Td>
                        <Td>{pname.get(b.partner_id)}</Td>
                        <Td className="text-xs">{(b.partner_batch_orders ?? []).map((x) => (x.orders as unknown as { order_number: string } | null)?.order_number).filter(Boolean).join(", ")}<span className="block text-muted">{[b.bag_count && `${b.bag_count} bags`, b.weight_kg && `${Number(b.weight_kg)} kg`].filter(Boolean).join(" · ")}</span></Td>
                        <Td className="text-xs">{when(b.sent_at)}</Td>
                        <Td className="text-xs">{when(b.status === "returned" ? b.returned_at : b.expected_back_at)}</Td>
                        <Td>{b.status === "returned" ? <Badge tone="success">Returned</Badge> : late ? <Badge tone="danger">Late</Badge> : <Badge tone="info">At partner</Badge>}</Td>
                        <Td>{b.status === "sent" && send && <ReceiveBatchButton batchId={b.id} />}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
          <Card>
            <CardHeader title="Partners" />
            {!(partners ?? []).length ? <EmptyState title="Add your processing partner" description="Name, contact and price per kg. Turnaround sets the default due-back time." /> : (
              <Table>
                <thead><tr><Th>Partner</Th><Th>Contact</Th><Th>Cost per kg</Th><Th>Turnaround</Th><Th>Status</Th></tr></thead>
                <tbody>{(partners ?? []).map((p) => (
                  <tr key={p.id}>
                    <Td><p className="font-medium">{p.name}</p><p className="text-xs text-muted">{p.services}</p></Td>
                    <Td className="text-xs">{p.contact_name}{p.phone && <a href={`tel:${p.phone}`} className="block text-teal-600">{p.phone}</a>}</Td>
                    <Td className="tnum">{p.cost_per_kg ? formatMoney(Number(p.cost_per_kg), t?.currency ?? "NGN") : "—"}</Td>
                    <Td>{p.turnaround_hours}h</Td>
                    <Td>{p.is_active ? <Badge tone="success">Active</Badge> : <Badge>Off</Badge>}</Td>
                  </tr>
                ))}</tbody>
              </Table>
            )}
          </Card>
        </div>
        <div className="grid gap-5 self-start">
          {send && (
            <Card>
              <CardHeader title="Send a batch" description="Orders that have been received and counted." />
              {active.length === 0 ? <p className="p-4 pt-0 text-sm text-muted">Add a partner first.</p> : ready.length === 0 ? <p className="p-4 pt-0 text-sm text-muted">No orders waiting to go out.</p> : (
                <ActionForm action={sendToPartner} className="grid gap-3 p-4 pt-0" resetOnSuccess>
                  <Field label="Partner" htmlFor="partner"><Select id="partner" name="partner">{active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
                  <fieldset className="grid max-h-64 gap-1 overflow-y-auto rounded-lg border border-line p-2">
                    <legend className="px-1 text-xs font-medium text-muted">Orders</legend>
                    {ready.map((o) => (
                      <label key={o.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-subtle">
                        <input type="checkbox" name="order" value={o.id} className="size-4 accent-brand-600" />
                        <span className="font-medium tnum">{o.order_number}</span>
                        <span className="truncate text-muted">{(o.customers as unknown as { full_name: string } | null)?.full_name}</span>
                        <span className="ms-auto text-xs text-faint">{o.received_weight_kg ? `${Number(o.received_weight_kg)} kg` : stageName.get(o.current_stage_id)}</span>
                      </label>
                    ))}
                  </fieldset>
                  <Field label="Due back (optional)" htmlFor="expected" hint="Defaults to the partner's turnaround"><Input id="expected" name="expected" type="datetime-local" /></Field>
                  <Field label="Notes" htmlFor="notes"><Input id="notes" name="notes" placeholder="e.g. 2 delicate items in bag 3" /></Field>
                  <SubmitButton>Send batch</SubmitButton>
                </ActionForm>
              )}
            </Card>
          )}
          {manageSettings && (
            <Card>
              <CardHeader title="Add partner" />
              <ActionForm action={savePartner} className="grid gap-3 p-4 pt-0" resetOnSuccess>
                <Field label="Name" htmlFor="pn"><Input id="pn" name="name" required /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Contact person" htmlFor="pc"><Input id="pc" name="contact_name" /></Field>
                  <Field label="Phone" htmlFor="pp"><Input id="pp" name="phone" type="tel" /></Field>
                </div>
                <Field label="Address" htmlFor="pa"><Input id="pa" name="address" /></Field>
                <Field label="Services" htmlFor="ps"><Input id="ps" name="services" placeholder="Wash & fold, dry cleaning" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Cost per kg" htmlFor="pk"><Input id="pk" name="cost_per_kg" type="number" min={0} step="0.01" inputMode="decimal" /></Field>
                  <Field label="Turnaround (hours)" htmlFor="pt"><Input id="pt" name="turnaround_hours" type="number" min={1} defaultValue={48} /></Field>
                </div>
                <SubmitButton>Save partner</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
      <p className="mt-4 text-xs text-muted">In-house processing (your own machines) is planned. Until then, orders go through a partner and come back for your quality check. <Link href="/app/orders" className="text-teal-600">All orders</Link></p>
    </>
  );
}
