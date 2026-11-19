import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MapPin, MessageSquareText, Phone, Zap } from "lucide-react";
import { OpsShell, staffNav } from "@/components/ops/shell";
import { dueLabel } from "@/components/ops/order-row";
import { Alert, Badge, Card, CardHeader, OrderTag, StageBadge } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/session";
import { memberNames } from "@/lib/ops";
import { INCIDENT_KINDS, JOB_STATUS } from "@/lib/ops-shared";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { staffContext } from "../../data";
import {
  BagsPanel, ChargePanel, CountWeightPanel, GarmentsPanel, IncidentPanel, NotesPanel, OnBehalfButtons, PhotosPanel, QcPanel, StageControl,
} from "./panels";

export const metadata: Metadata = { title: "Order", robots: { index: false } };

const UNIT: Record<string, string> = { per_kg: "kg", per_item: "items", per_room: "rooms", per_hour: "hours", per_sqm: "m²", fixed: "" };

export default async function StaffOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await staffContext();
  const { membership, stages, tz, module } = ctx;
  const supabase = await createClient();
  const { data: o } = await supabase.from("orders")
    .select("*, customers(full_name, phone, preferences, whatsapp_opt_in), order_items(id, description, quantity, unit_price, line_total, pricing_model)")
    .eq("id", id).eq("tenant_id", membership.tenantId).maybeSingle();
  if (!o) notFound();
  const [{ data: bags }, { data: garments }, { data: media }, { data: adjustments }, { data: qcs }, { data: incidents }, { data: jobs }, { data: notes }, { data: history }, names, { data: partner }] = await Promise.all([
    supabase.from("order_bags").select("attached_at, released_at, bags(code)").eq("order_id", id).order("attached_at"),
    supabase.from("order_garments").select("id, tag_code, description, color, condition_note, bags(code)").eq("order_id", id).order("created_at"),
    supabase.from("ops_media").select("id, kind, caption, data_url, created_at").eq("order_id", id).order("created_at", { ascending: false }).limit(9),
    supabase.from("order_adjustments").select("id, kind, amount, reason, status, decided_via, created_at").eq("order_id", id).order("created_at", { ascending: false }),
    supabase.from("quality_checks").select("passed, notes, created_at").eq("order_id", id).order("created_at", { ascending: false }).limit(3),
    supabase.from("incidents").select("id, kind, status, severity, description, freezes_order, created_at, source").eq("order_id", id).order("created_at", { ascending: false }),
    supabase.from("delivery_jobs").select("id, kind, status, attempt, driver_member_id, scheduled_start, failed_reason, proof_type, completed_at").eq("order_id", id).order("created_at"),
    supabase.from("order_notes").select("id, body, created_at, created_by").eq("order_id", id).order("created_at"),
    supabase.from("order_status_history").select("to_stage_id, note, created_at").eq("order_id", id).order("created_at", { ascending: false }).limit(12),
    memberNames(membership.tenantId),
    o.processing_partner_id ? supabase.from("processing_partners").select("name").eq("id", o.processing_partner_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const wf = stages.filter((s) => s.workflow_id === o.workflow_id);
  const cur = wf.find((s) => s.id === o.current_stage_id)!;
  const allowed = (s: (typeof wf)[number]) => !s.allowed_roles?.length || s.allowed_roles.includes(membership.roleKey);
  // stages a person can move to by hand (driver-only steps happen in the driver app)
  const manual = wf.filter((s) => s.id !== cur.id && allowed(s) && !(module && ["pickup_assigned", "picked_up", "out_for_delivery"].includes(s.key))
    && !(module && s.key === "delivered" && o.delivery_required));
  const next = manual.find((s) => s.position > cur.position && !(module && s.key === "ready")) ?? null;
  const others = manual.filter((s) => s.id !== next?.id);
  const customer = o.customers as unknown as { full_name: string; phone: string | null; preferences: Record<string, unknown> } | null;
  const prefs = Object.entries(customer?.preferences ?? {}).filter(([k, v]) => k !== "payment_method" && v);
  const activeBags = (bags ?? []).filter((b) => !b.released_at).map((b) => ({ code: (b.bags as unknown as { code: string }).code, attached_at: b.attached_at }));
  const pendingAdj = (adjustments ?? []).find((a) => a.status === "pending_approval" && a.kind === "weight_change");
  const due = dueLabel(o.expected_at, tz);
  const has = (p: string) => can(membership, p as never);
  const byStage = new Map(wf.map((s) => [s.id, s.name]));
  const authorIds = [...new Set((notes ?? []).map((n) => n.created_by).filter(Boolean))] as string[];
  const { data: authors } = authorIds.length ? await supabase.from("profiles").select("id, full_name").in("id", authorIds) : { data: [] };
  const authorName = new Map((authors ?? []).map((a) => [a.id, a.full_name as string]));
  const userName = (uid: string | null) => (uid ? authorName.get(uid) ?? "Team member" : "System");
  const items = (o.order_items ?? []) as { id: string; description: string; quantity: number; unit_price: number; line_total: number; pricing_model: string }[];

  return (
    <OpsShell business={membership.tenantName} role={membership.roleName} title={o.order_number} back="/staff"
      nav={staffNav({ exceptions: ctx.counts.exceptions, mine: ctx.mine })}>
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <OrderTag number={o.order_number} />
          <StageBadge name={cur.name} color={cur.color} />
          {o.is_express && <Badge tone="warning"><Zap className="size-3" />Express</Badge>}
          {o.on_hold && <Badge tone="danger">Frozen</Badge>}
          {partner && <Badge tone="info">At {partner.name}</Badge>}
        </div>
        <p className="mt-3 text-[16px] font-semibold">{customer?.full_name}</p>
        {customer?.phone && <a href={`tel:${customer.phone}`} className="mt-0.5 inline-flex items-center gap-1 text-[13px] text-teal-600"><Phone className="size-3.5" />{customer.phone}</a>}
        {(o.pickup_address || o.delivery_address) && <p className="mt-1 flex items-start gap-1 text-xs text-muted"><MapPin className="mt-0.5 size-3.5 shrink-0" />{o.delivery_address ?? o.pickup_address}</p>}
        {due && <p className={`mt-2 text-[13px] font-medium ${due.tone === "danger" ? "text-danger-600" : due.tone === "warning" ? "text-warning-600" : "text-muted"}`}>{due.text}</p>}
        {(o.notes || prefs.length > 0) && (
          <div className="mt-3 rounded-lg bg-warning-50 p-3 text-[13px] text-ink">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warning-600"><MessageSquareText className="size-3.5" />Customer instructions</p>
            {o.notes && <p className="whitespace-pre-wrap">{o.notes}</p>}
            {prefs.length > 0 && <p className="mt-1 text-xs text-muted">Preferences: {prefs.map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}</p>}
          </div>
        )}
        <div className="mt-4"><StageControl orderId={o.id} next={next ? { id: next.id, name: next.name } : null} others={others.map((s) => ({ id: s.id, name: s.name }))} frozen={o.on_hold} /></div>
        {module && cur.key === "quality_check" && !has("ops.qc") && <p className="mt-2 text-xs text-muted">Quality control releases this order once the checklist passes.</p>}
      </Card>

      {(incidents ?? []).filter((i) => i.status !== "resolved").map((i) => (
        <Alert key={i.id} tone="danger">
          <span className="font-semibold">{INCIDENT_KINDS[i.kind]?.label ?? i.kind}{i.source === "customer" && " (from customer)"}:</span> {i.description}
        </Alert>
      ))}

      <div className="mt-3 grid gap-3">
        {module && cur.key === "quality_check" && has("ops.qc") && (
          <Card><CardHeader title="Quality control" description="All 8 checks must pass to release the order." /><div className="p-4"><QcPanel orderId={o.id} /></div></Card>
        )}

        <Card><CardHeader title="Bags" description="Physical bags this order travels in" /><div className="p-4"><BagsPanel orderId={o.id} bags={activeBags} canEdit={has("ops.receive") || has("ops.sort") || has("orders.manage")} /></div></Card>

        {(has("ops.sort") || has("ops.receive") || has("orders.manage")) && (
          <Card>
            <CardHeader title="Count and weight" description="Record before processing. A higher weight asks the customer to approve the new price." />
            <div className="p-4">
              <CountWeightPanel orderId={o.id} count={o.received_item_count} kg={o.received_weight_kg == null ? null : Number(o.received_weight_kg)}
                lines={items.filter((i) => i.pricing_model === "per_kg" || i.pricing_model === "per_item").map((i) => ({ id: i.id, description: i.description, quantity: Number(i.quantity), unit: UNIT[i.pricing_model] }))}
                pending={pendingAdj ? { amount: Number(pendingAdj.amount), currency: o.currency } : null} />
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Items and tags" description={`${(garments ?? []).length} registered`} />
          <div className="p-4">
            <GarmentsPanel orderId={o.id} bags={activeBags.map((b) => b.code)} canEdit={has("ops.receive") || has("ops.sort") || has("orders.manage")}
              items={(garments ?? []).map((g) => ({ ...g, bag: (g.bags as unknown as { code: string } | null)?.code ?? null }))} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Services and price" />
          <ul className="divide-y divide-line text-[13px]">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 px-4 py-2.5"><span className="min-w-0">{i.description} <span className="text-faint">× {Number(i.quantity)} {UNIT[i.pricing_model]}</span></span><span className="tnum">{formatMoney(i.line_total, o.currency)}</span></li>
            ))}
            <li className="flex justify-between px-4 py-2.5 font-semibold"><span>Total</span><span className="tnum">{formatMoney(o.total, o.currency)}</span></li>
          </ul>
          {(adjustments ?? []).length > 0 && (
            <div className="grid gap-2 border-t border-line p-4">
              {(adjustments ?? []).map((a) => (
                <div key={a.id} className="rounded-lg bg-canvas p-3 text-[13px]">
                  <div className="flex justify-between gap-3"><span className="font-medium">{a.reason}</span><span className="tnum">{Number(a.amount) > 0 ? "+" : ""}{formatMoney(a.amount, o.currency)}</span></div>
                  <p className="text-xs text-muted">{a.status === "pending_approval" ? "Waiting for customer approval" : a.status === "applied" ? `Applied${a.decided_via === "customer_app" ? " · approved by customer in the app" : a.decided_via === "staff_on_behalf" ? " · approved on the customer's behalf" : ""}` : a.status}</p>
                  {a.status === "pending_approval" && has("orders.manage") && <div className="mt-2"><OnBehalfButtons orderId={o.id} adjustmentId={a.id} /></div>}
                </div>
              ))}
            </div>
          )}
          {(has("orders.manage") || has("incidents.manage")) && <div className="border-t border-line p-4"><ChargePanel orderId={o.id} currency={o.currency} /></div>}
        </Card>

        <Card><CardHeader title="Photos" description="Condition, stains, packaging" /><div className="p-4"><PhotosPanel orderId={o.id} photos={(media ?? []).filter((m) => m.kind !== "signature")} /></div></Card>

        <Card>
          <CardHeader title="Team notes" />
          <div className="p-4"><NotesPanel orderId={o.id} notes={(notes ?? []).map((n) => ({ id: n.id, body: n.body, at: formatDateTime(n.created_at), by: userName(n.created_by) }))} /></div>
        </Card>

        <Card><CardHeader title="Report an incident" description="Missing, damaged, stains, wrong item, delays" /><div className="p-4"><IncidentPanel orderId={o.id} /></div></Card>

        {(jobs ?? []).length > 0 && (
          <Card>
            <CardHeader title="Pickup and delivery" />
            <ul className="divide-y divide-line text-[13px]">
              {(jobs ?? []).map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span><span className="font-medium capitalize">{j.kind}</span>{j.attempt > 1 && ` · attempt ${j.attempt}`}<span className="block text-xs text-muted">{j.driver_member_id ? names.get(j.driver_member_id)?.name : "No driver"}{j.failed_reason && ` · ${j.failed_reason.replace(/_/g, " ")}`}{j.proof_type && ` · proof: ${j.proof_type}`}</span></span>
                  <Badge tone={j.status === "completed" ? "success" : j.status === "failed" ? "danger" : "neutral"}>{JOB_STATUS[j.status]}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <CardHeader title="History" />
          <ol className="divide-y divide-line text-[13px]">
            {(qcs ?? []).map((q, i) => <li key={`qc${i}`} className="flex gap-2 px-4 py-2.5"><Badge tone={q.passed ? "success" : "danger"}>QC {q.passed ? "passed" : "failed"}</Badge><span className="min-w-0 flex-1 text-muted">{q.notes}</span><span className="shrink-0 text-xs text-faint">{formatDateTime(q.created_at)}</span></li>)}
            {(history ?? []).map((h, i) => (
              <li key={i} className="px-4 py-2.5"><div className="flex justify-between gap-3"><span className="font-medium">{byStage.get(h.to_stage_id) ?? "Stage"}</span><span className="shrink-0 text-xs text-faint">{formatDateTime(h.created_at)}</span></div>{h.note && <p className="text-xs text-muted">{h.note}</p>}</li>
            ))}
          </ol>
        </Card>
      </div>
    </OpsShell>
  );
}
