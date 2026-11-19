import type { Metadata } from "next";
import { Alert, Badge, Card, CardHeader, DescriptionList, Input, Table, Td, Th } from "@/components/ui/primitives";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/session";
import { formatDate, formatMoney, nowMs } from "@/lib/utils";
import { applyTrialCoupon } from "./actions";
import { Checkout } from "./checkout";

export const metadata: Metadata = { title: "Plan & billing" };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const { membership } = await requireTenant("billing.manage");
  const { payment } = await searchParams;
  const supabase = await createClient();
  const [{ data: sub }, { data: plans }, { data: prices }, { data: periods }, { data: gateways }, { data: invoices }, { data: tenant }, usage] = await Promise.all([
    supabase.from("tenant_subscriptions").select("status, current_period_end, plans(id, name, limits)").eq("tenant_id", membership.tenantId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("plans").select("id, code, name, description, limits, features").eq("is_active", true).order("sort_order"),
    supabase.from("plan_prices").select("plan_id, currency, monthly_price").eq("is_active", true),
    supabase.from("billing_periods").select("key, label, months, discount_percent").eq("is_active", true).order("sort_order"),
    supabase.from("payment_gateways").select("key, display_name, supported_currencies").eq("is_enabled", true).order("sort_order"),
    supabase.from("saas_invoices").select("id, number, total, currency, status, gateway, period_key, created_at, plans(name)").eq("tenant_id", membership.tenantId).order("created_at", { ascending: false }).limit(12),
    supabase.from("tenants").select("currency").eq("id", membership.tenantId).single(),
    Promise.all([
      supabase.from("branches").select("id", { count: "exact", head: true }).eq("tenant_id", membership.tenantId),
      supabase.from("tenant_members").select("id", { count: "exact", head: true }).eq("tenant_id", membership.tenantId),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("tenant_id", membership.tenantId).gte("created_at", new Date(nowMs() - 30 * 86_400_000).toISOString()),
    ]),
  ]);
  const current = (Array.isArray(sub?.plans) ? sub?.plans[0] : sub?.plans) as { id: string; name: string; limits: Record<string, number | null> } | undefined;
  const trial = sub?.status === "trial";
  const daysLeft = sub ? Math.ceil((new Date(sub.current_period_end).getTime() - nowMs()) / 86_400_000) : 0;
  const currencies = [...new Set((prices ?? []).filter((p) => Number(p.monthly_price) > 0).map((p) => p.currency))];
  const defaultCurrency = currencies.includes(tenant?.currency ?? "") ? tenant!.currency : currencies[0] ?? "NGN";
  const [{ count: branches }, { count: staff }, { count: orders }] = usage;
  const planName = (v: unknown) => (Array.isArray(v) ? v[0]?.name : (v as { name: string } | null)?.name);

  return (
    <div className="grid gap-5">
      {payment === "success" && <Alert tone="success">Payment received. Your subscription has been updated.</Alert>}
      {payment === "failed" && <Alert>The payment didn&apos;t go through. Try again or choose another method.</Alert>}
      {payment === "pending" && <Alert tone="info">We&apos;re waiting for the payment provider to confirm. Refresh this page in a minute.</Alert>}

      <Card>
        <CardHeader title={current ? `${current.name} plan` : "No plan yet"}
          action={sub && <Badge tone={trial ? (daysLeft <= 3 ? "warning" : "info") : sub.status === "active" ? "success" : "warning"}>{trial ? `Free trial, ${Math.max(daysLeft, 0)} day${daysLeft === 1 ? "" : "s"} left` : sub.status}</Badge>} />
        <div className="grid gap-4 px-4 py-3 md:grid-cols-2">
          <DescriptionList items={[
            [trial ? "Trial ends" : "Paid until", formatDate(sub?.current_period_end)],
            ["Branches", `${branches ?? 0} of ${current?.limits.branches ?? "unlimited"}`],
            ["Team", `${staff ?? 0} of ${current?.limits.staff ?? "unlimited"}`],
            ["Orders, last 30 days", `${orders ?? 0} of ${current?.limits.orders_per_month ?? "unlimited"}`],
          ]} />
          {trial && (
            <ActionForm action={applyTrialCoupon} resetOnSuccess className="self-start rounded-lg border border-line bg-canvas p-3">
              <p className="mb-2 text-[13px] font-medium">Have a trial extension code?</p>
              <div className="flex gap-2"><Input name="code" placeholder="TRIAL14" className="uppercase" aria-label="Trial code" /><SubmitButton variant="outline" pendingLabel="…">Apply to trial</SubmitButton></div>
            </ActionForm>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={trial ? "Choose a plan" : "Change or renew your plan"} description="Pay for longer and save. Prices shown include the period discount." />
        <div className="p-4">
          {currencies.length === 0 ? <p className="text-[13px] text-muted">Plans are not on sale yet. Contact support.</p> : (
            <Checkout
              plans={(plans ?? []).map((p) => ({ id: p.id, code: p.code, name: p.name, description: p.description, limits: p.limits as Record<string, number | null>, features: p.features as Record<string, boolean> }))}
              prices={(prices ?? []).map((p) => ({ planId: p.plan_id, currency: p.currency, monthly: Number(p.monthly_price) }))}
              periods={(periods ?? []).map((p) => ({ key: p.key, label: p.label, months: p.months, discount: Number(p.discount_percent) }))}
              gateways={(gateways ?? []).map((g) => ({ key: g.key, name: g.display_name, currencies: g.supported_currencies }))}
              currencies={currencies} defaultCurrency={defaultCurrency} currentPlanId={current?.id ?? null} />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Invoices" />
        <Table>
          <thead><tr><Th>Invoice</Th><Th>Plan</Th><Th className="hidden sm:table-cell">Method</Th><Th>Status</Th><Th className="text-right">Total</Th></tr></thead>
          <tbody>
            {(invoices ?? []).map((i) => (
              <tr key={i.id}>
                <Td><a href={`/app/settings/plan/invoice/${i.id}`} className="font-medium hover:text-teal-600">{i.number}</a><p className="text-xs text-faint">{formatDate(i.created_at)}</p></Td>
                <Td>{planName(i.plans)}, {periods?.find((p) => p.key === i.period_key)?.label ?? i.period_key}</Td>
                <Td className="hidden sm:table-cell">{gateways?.find((g) => g.key === i.gateway)?.display_name ?? i.gateway}</Td>
                <Td><Badge tone={i.status === "paid" ? "success" : i.status === "awaiting_confirmation" ? "warning" : i.status === "failed" ? "danger" : "neutral"}>{i.status === "awaiting_confirmation" ? "being confirmed" : i.status}</Badge></Td>
                <Td className="text-right font-medium tnum">{formatMoney(i.total, i.currency)}</Td>
              </tr>
            ))}
            {!invoices?.length && <tr><Td colSpan={5} className="py-6 text-center text-muted">No invoices yet.</Td></tr>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
