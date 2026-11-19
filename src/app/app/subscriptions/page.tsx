import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Repeat } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge, Card, CardHeader, EmptyState, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";
import { can, requireTenant } from "@/lib/auth/session";
import { hasLaundryOps } from "@/lib/ops";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils";
import { activateSubscription, savePlan } from "../ops-actions";

export const metadata: Metadata = { title: "Subscriptions" };

const TONE = { active: "success", pending_payment: "warning", paused: "neutral", cancelled: "neutral", expired: "danger" } as const;
const LABEL: Record<string, string> = { active: "Active", pending_payment: "Awaiting payment", paused: "Paused", cancelled: "Cancelled", expired: "Expired" };

export default async function SubscriptionsAdmin() {
  const { membership } = await requireTenant("customers.view");
  if (!(await hasLaundryOps(membership.tenantId))) notFound();
  const supabase = await createClient();
  const [{ data: plans }, { data: subs }, { data: t }] = await Promise.all([
    supabase.from("subscription_plans").select("*").eq("tenant_id", membership.tenantId).order("sort_order").order("price"),
    supabase.from("customer_subscriptions").select("id, plan_id, status, current_period_end, auto_renew, created_at, customers(full_name, phone)").eq("tenant_id", membership.tenantId).order("created_at", { ascending: false }).limit(200),
    supabase.from("tenants").select("currency, timezone").eq("id", membership.tenantId).single(),
  ]);
  const money = (n: number) => formatMoney(n, t?.currency ?? "NGN");
  const plan = new Map((plans ?? []).map((p) => [p.id, p]));
  const when = (v: string | null) => (v ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: t?.timezone ?? "Africa/Lagos" }).format(new Date(v)) : "—");
  const activeCount = (subs ?? []).filter((s) => s.status === "active").length;
  const mrr = (subs ?? []).filter((s) => s.status === "active").reduce((a, s) => { const p = plan.get(s.plan_id); return a + (p ? Number(p.price) * 30 / p.period_days : 0); }, 0);
  const canActivate = can(membership, "subscriptions.manage");
  const canPlans = can(membership, "settings.manage");
  return (
    <>
      <PageHeader title="Subscriptions" description="Monthly laundry plans. Customers choose a plan in the app; you activate it when the first payment arrives." />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-muted">Active plans</p><p className="text-xl font-semibold tnum">{activeCount}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">Monthly recurring</p><p className="text-xl font-semibold tnum">{money(Math.round(mrr))}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">Awaiting payment</p><p className="text-xl font-semibold tnum">{(subs ?? []).filter((s) => s.status === "pending_payment").length}</p></Card>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Subscribers" />
          {!(subs ?? []).length ? <EmptyState icon={<Repeat />} title="No subscribers yet" description="Plans show in the customer app under Profile → Subscriptions." /> : (
            <Table>
              <thead><tr><Th>Customer</Th><Th>Plan</Th><Th>Status</Th><Th>Period ends</Th><Th /></tr></thead>
              <tbody>{(subs ?? []).map((s) => {
                const c = s.customers as unknown as { full_name: string; phone: string | null } | null;
                return (
                  <tr key={s.id}>
                    <Td><p className="font-medium">{c?.full_name}</p><p className="text-xs text-muted">{c?.phone}</p></Td>
                    <Td>{plan.get(s.plan_id)?.name}<p className="text-xs text-muted">{plan.get(s.plan_id) ? money(Number(plan.get(s.plan_id)!.price)) : ""}</p></Td>
                    <Td><Badge tone={TONE[s.status as keyof typeof TONE]}>{LABEL[s.status]}</Badge>{!s.auto_renew && s.status === "active" && <p className="text-xs text-muted">Won&apos;t renew</p>}</Td>
                    <Td className="text-xs">{when(s.current_period_end)}</Td>
                    <Td>
                      {canActivate && (s.status === "pending_payment" || s.status === "expired") && (
                        <ActionForm action={activateSubscription.bind(null, s.id)} compact className="flex flex-wrap gap-2">
                          <Select name="method" aria-label="Payment method" className="h-9 w-[130px]"><option value="bank_transfer">Transfer</option><option value="cash">Cash</option><option value="pos">POS</option></Select>
                          <Input name="reference" placeholder="Ref" aria-label="Reference" className="h-9 w-24" />
                          <SubmitButton size="sm">Record &amp; activate</SubmitButton>
                        </ActionForm>
                      )}
                    </Td>
                  </tr>
                );
              })}</tbody>
            </Table>
          )}
        </Card>
        <div className="grid gap-5 self-start">
          <Card>
            <CardHeader title="Plans" />
            <div className="divide-y divide-line">
              {(plans ?? []).map((p) => (
                <details key={p.id} className="px-4 py-3">
                  <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm"><span className="font-medium">{p.name}</span><span className="tnum">{money(Number(p.price))} · {Number(p.included_kg)} kg {!p.is_active && <Badge className="ms-1">Off</Badge>}</span></summary>
                  {canPlans && <PlanForm plan={p} />}
                </details>
              ))}
            </div>
          </Card>
          {canPlans && <Card><CardHeader title="New plan" /><PlanForm /></Card>}
        </div>
      </div>
    </>
  );
}

function PlanForm({ plan }: { plan?: { id: string; name: string; description: string | null; price: number; period_days: number; included_kg: number; free_delivery: boolean; is_active: boolean } }) {
  return (
    <ActionForm action={savePlan} className="grid gap-3 p-4 pt-3" resetOnSuccess={!plan}>
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <Field label="Name" htmlFor={`n${plan?.id}`}><Input id={`n${plan?.id}`} name="name" defaultValue={plan?.name} required /></Field>
      <Field label="Description" htmlFor={`d${plan?.id}`}><Input id={`d${plan?.id}`} name="description" defaultValue={plan?.description ?? ""} /></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Price" htmlFor={`p${plan?.id}`}><Input id={`p${plan?.id}`} name="price" type="number" min={0} defaultValue={plan?.price} required /></Field>
        <Field label="Days" htmlFor={`pd${plan?.id}`}><Input id={`pd${plan?.id}`} name="period_days" type="number" min={7} max={366} defaultValue={plan?.period_days ?? 30} /></Field>
        <Field label="Kg incl." htmlFor={`k${plan?.id}`}><Input id={`k${plan?.id}`} name="included_kg" type="number" min={0} step="0.5" defaultValue={plan?.included_kg ?? 10} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="free_delivery" defaultChecked={plan?.free_delivery ?? true} className="size-4 accent-brand-600" />Free pickup and delivery</label>
      {plan && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={plan.is_active} className="size-4 accent-brand-600" />Offered to customers</label>}
      <SubmitButton size="sm">{plan ? "Save plan" : "Add plan"}</SubmitButton>
    </ActionForm>
  );
}
