import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge, Card, CardHeader, Field, Input, Select, Table, Td, Th } from "@/components/ui/primitives";
import { ZoneToggle } from "@/components/ops/zone-toggle";
import { requireTenant } from "@/lib/auth/session";
import { hasLaundryOps } from "@/lib/ops";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils";
import { saveOpsSettings, saveZone } from "../../ops-actions";

export const metadata: Metadata = { title: "Operations settings" };

function Toggle({ name, label, hint, on }: { name: string; label: string; hint?: string; on: boolean }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={on} className="mt-0.5 size-4 accent-brand-600" />
      <span><span className="font-medium">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
}

export default async function OperationsSettings() {
  const { membership } = await requireTenant("settings.manage");
  if (!(await hasLaundryOps(membership.tenantId))) notFound();
  const supabase = await createClient();
  const [{ data: t }, { data: zones }] = await Promise.all([
    supabase.from("tenants").select("settings, currency").eq("id", membership.tenantId).single(),
    supabase.from("service_zones").select("*").eq("tenant_id", membership.tenantId).order("sort_order").order("name"),
  ]);
  const s = (t?.settings ?? {}) as Record<string, Record<string, unknown>>;
  const p = s.portal ?? {}, o = s.ops ?? {}, l = s.loyalty ?? {};
  const v = (x: unknown) => (x === null || x === undefined ? "" : String(x));
  const cur = t?.currency ?? "NGN";
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader title="Service rules" description="How orders are booked, processed and handed over." />
        <ActionForm action={saveOpsSettings} className="grid gap-6 p-4 pt-0">
          <section className="grid gap-3">
            <p className="text-sm font-semibold">Booking and turnaround</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Orders per 2-hour pickup slot" htmlFor="slot_capacity" hint="0 = no limit"><Input id="slot_capacity" name="slot_capacity" type="number" min={0} defaultValue={v(p.slot_capacity ?? 6)} /></Field>
              <Field label="Standard turnaround (hours)" htmlFor="standard_hours"><Input id="standard_hours" name="standard_hours" type="number" min={2} defaultValue={v(p.standard_hours ?? 48)} /></Field>
              <Field label="Express turnaround (hours)" htmlFor="express_hours"><Input id="express_hours" name="express_hours" type="number" min={2} defaultValue={v(p.express_hours ?? 24)} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
              <Toggle name="express_enabled" label="Offer express service" on={Boolean(p.express_enabled ?? true)} />
              <Field label="Express surcharge (%)" htmlFor="express_surcharge_pct"><Input id="express_surcharge_pct" name="express_surcharge_pct" type="number" min={0} max={300} defaultValue={v(p.express_surcharge_pct ?? 50)} /></Field>
              <Field label="Service reminder after (days)" htmlFor="reminder_default_days" hint="Used until we learn each customer's rhythm"><Input id="reminder_default_days" name="reminder_default_days" type="number" min={1} defaultValue={v(o.reminder_default_days ?? 14)} /></Field>
            </div>
          </section>
          <section className="grid gap-3">
            <p className="text-sm font-semibold">Quality and handover</p>
            <Toggle name="weigh_before_processing" label="Count or weigh before processing" hint="Orders can't leave sorting without a count or weight" on={Boolean(o.weigh_before_processing ?? true)} />
            <Toggle name="qc_required" label="Quality check before Ready" hint="Every order passes the 8-point check before it can go out" on={Boolean(o.qc_required ?? true)} />
            <Toggle name="auto_complete_when_paid" label="Complete orders automatically when delivered and paid" on={Boolean(o.auto_complete_when_paid ?? true)} />
            <Field label="Delivery proof drivers must collect" htmlFor="proof_required">
              <Select id="proof_required" name="proof_required" defaultValue={v(o.proof_required ?? "any")}>
                <option value="any">Any: code, signature or photo</option><option value="otp">Delivery code only</option><option value="signature">Signature only</option><option value="photo">Photo only</option>
              </Select>
            </Field>
          </section>
          <section className="grid gap-3">
            <p className="text-sm font-semibold">Loyalty and referrals</p>
            <Toggle name="loyalty_enabled" label="Reward customers with points" on={Boolean(l.enabled)} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={`Points per ${formatMoney(100, cur)} spent`} htmlFor="points_per_100"><Input id="points_per_100" name="points_per_100" type="number" min={0} step="0.1" defaultValue={v(l.points_per_100 ?? 1)} /></Field>
              <Field label={`Value of 1 point (${cur})`} htmlFor="point_value"><Input id="point_value" name="point_value" type="number" min={0} step="0.01" defaultValue={v(l.point_value ?? 1)} /></Field>
              <Field label="Minimum points to redeem" htmlFor="min_redeem"><Input id="min_redeem" name="min_redeem" type="number" min={0} defaultValue={v(l.min_redeem ?? 100)} /></Field>
              <Field label="Referrer reward (points)" htmlFor="referral_points" hint="After the friend's first completed order"><Input id="referral_points" name="referral_points" type="number" min={0} defaultValue={v(l.referral_points ?? 0)} /></Field>
              <Field label="Referred friend's bonus (points)" htmlFor="referee_points" hint="Also after their first completed order"><Input id="referee_points" name="referee_points" type="number" min={0} defaultValue={v(l.referee_points ?? 0)} /></Field>
              <Field label="Milestone every N orders" htmlFor="milestone_every" hint="0 = off"><Input id="milestone_every" name="milestone_every" type="number" min={0} defaultValue={v(l.milestone_every ?? 0)} /></Field>
              <Field label="Milestone bonus (points)" htmlFor="milestone_points"><Input id="milestone_points" name="milestone_points" type="number" min={0} defaultValue={v(l.milestone_points ?? 0)} /></Field>
            </div>
          </section>
          <section className="grid gap-3">
            <p className="text-sm font-semibold">Costs for margin reports</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Processing cost per kg" htmlFor="processing_cost_per_kg"><Input id="processing_cost_per_kg" name="processing_cost_per_kg" type="number" min={0} step="0.01" defaultValue={v(o.processing_cost_per_kg)} /></Field>
              <Field label="Cost per pickup or delivery" htmlFor="delivery_cost_per_job"><Input id="delivery_cost_per_job" name="delivery_cost_per_job" type="number" min={0} step="0.01" defaultValue={v(o.delivery_cost_per_job)} /></Field>
              <Field label="Marketing spend per month" htmlFor="marketing_spend_month" hint="Used for acquisition cost"><Input id="marketing_spend_month" name="marketing_spend_month" type="number" min={0} defaultValue={v(o.marketing_spend_month)} /></Field>
            </div>
          </section>
          <div><SubmitButton>Save operations settings</SubmitButton></div>
        </ActionForm>
      </Card>
      <Card>
        <CardHeader title="Delivery areas" description="Customers pick their area when they add an address. Each area sets its own fee and minimum order." />
        <Table>
          <thead><tr><Th>Area</Th><Th>Neighbourhoods</Th><Th className="text-right">Fee</Th><Th className="text-right">Minimum</Th><Th>Status</Th></tr></thead>
          <tbody>{(zones ?? []).map((z) => (
            <tr key={z.id}>
              <Td className="font-medium">{z.name}</Td>
              <Td className="text-xs text-muted">{z.areas}</Td>
              <Td className="text-right tnum">{formatMoney(Number(z.delivery_fee), cur)}</Td>
              <Td className="text-right tnum">{formatMoney(Number(z.min_order), cur)}</Td>
              <Td>{z.is_active ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>} <ZoneToggle id={z.id} active={z.is_active} /></Td>
            </tr>
          ))}</tbody>
        </Table>
        <ActionForm action={saveZone} className="grid gap-3 border-t border-line p-4 sm:grid-cols-[1fr_1.5fr_120px_120px_auto] sm:items-end" resetOnSuccess>
          <Field label="New area" htmlFor="zn"><Input id="zn" name="name" placeholder="e.g. Ikeja" /></Field>
          <Field label="Neighbourhoods" htmlFor="za"><Input id="za" name="areas" placeholder="Allen, Opebi, Alausa" /></Field>
          <Field label="Fee" htmlFor="zf"><Input id="zf" name="delivery_fee" type="number" min={0} defaultValue={0} /></Field>
          <Field label="Minimum" htmlFor="zm"><Input id="zm" name="min_order" type="number" min={0} defaultValue={0} /></Field>
          <SubmitButton>Add area</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
