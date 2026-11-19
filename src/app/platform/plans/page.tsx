import type { Metadata } from "next";
import { Card, CardHeader, Field, Input, Textarea } from "@/components/ui/primitives";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient } from "@/lib/supabase/server";
import { requirePlatform } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";
import { addCurrency, savePeriods, savePlan } from "../actions";

export const metadata: Metadata = { title: "Pricing Plans" };

const LIMITS: [string, string][] = [["branches", "Branches"], ["staff", "Team members"], ["customers", "Customers"], ["orders_per_month", "Orders a month"],
  ["storage_mb", "Storage (MB)"], ["automations", "Automations"], ["ai_requests_per_month", "AI requests a month"], ["whatsapp_messages_per_month", "WhatsApp messages a month"]];
const FEATURES: [string, string][] = [["subscriptions", "Customer subscriptions"], ["marketing", "Marketing & loyalty"], ["inventory", "Inventory"], ["ai", "AI assistant"], ["white_label", "White-label"], ["custom_domain", "Custom domain"]];

export default async function PlansPage() {
  await requirePlatform("plans.manage");
  const supabase = await createClient();
  const [{ data: plans }, { data: prices }, { data: periods }] = await Promise.all([
    supabase.from("plans").select("*").order("sort_order"),
    supabase.from("plan_prices").select("plan_id, currency, monthly_price, is_active"),
    supabase.from("billing_periods").select("*").order("sort_order"),
  ]);
  const currencies = [...new Set((prices ?? []).map((p) => p.currency))].sort((a, b) => (a === "NGN" ? -1 : b === "NGN" ? 1 : a.localeCompare(b)));
  const price = (plan: string, cur: string) => prices?.find((p) => p.plan_id === plan && p.currency === cur);
  const growth = plans?.find((p) => p.code === "growth");

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader title="Billing periods" description="Businesses can pay for any active period. The discount applies to the full period price." />
        <ActionForm action={savePeriods}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead><tr className="border-b border-line bg-canvas/70 text-xs text-muted"><th className="px-4 py-2 text-left font-medium">Period</th><th className="px-4 py-2 text-left font-medium">Label</th><th className="px-4 py-2 text-left font-medium">Discount %</th>{growth && currencies.map((c) => <th key={c} className="px-4 py-2 text-right font-medium">Growth in {c}</th>)}<th className="px-4 py-2 font-medium">Offered</th></tr></thead>
              <tbody>
                {(periods ?? []).map((p) => (
                  <tr key={p.key} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 font-medium">{p.months} month{p.months === 1 ? "" : "s"}<input type="hidden" name="period_key" value={p.key} /></td>
                    <td className="px-4 py-2"><Input name={`label_${p.key}`} defaultValue={p.label} className="w-40" aria-label="Label" /></td>
                    <td className="px-4 py-2"><Input name={`discount_${p.key}`} type="number" min={0} max={90} step="0.5" defaultValue={p.discount_percent} className="w-20" aria-label="Discount" /></td>
                    {growth && currencies.map((c) => {
                      const m = Number(price(growth.id, c)?.monthly_price ?? 0);
                      return <td key={c} className="px-4 py-2 text-right text-muted tnum">{m ? formatMoney(m * p.months * (1 - Number(p.discount_percent) / 100), c, { decimals: 0 }) : "—"}</td>;
                    })}
                    <td className="px-4 py-2 text-center"><input type="checkbox" name={`active_${p.key}`} defaultChecked={p.is_active} className="size-4 accent-navy-900" aria-label={`Offer ${p.label}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end border-t border-line px-4 py-3"><SubmitButton pendingLabel="Saving…">Save periods</SubmitButton></div>
        </ActionForm>
      </Card>

      {(plans ?? []).map((plan) => (
        <Card key={plan.id}>
          <CardHeader title={plan.name} description={`Code: ${plan.code}`} />
          <ActionForm action={savePlan} className="grid gap-5 p-4">
            <input type="hidden" name="id" value={plan.id} />
            <div className="grid gap-4 md:grid-cols-[200px_1fr]">
              <Field label="Name" htmlFor={`n-${plan.id}`}><Input id={`n-${plan.id}`} name="name" defaultValue={plan.name} /></Field>
              <Field label="Description" htmlFor={`d-${plan.id}`}><Textarea id={`d-${plan.id}`} name="description" defaultValue={plan.description ?? ""} className="min-h-9" /></Field>
            </div>
            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold">Monthly price by currency</legend>
              <div className="flex flex-wrap gap-3">
                {currencies.map((c) => (
                  <label key={c} className="grid gap-1 text-xs text-muted">{c}<Input name={`price_${c}`} type="number" min={0} step="0.01" defaultValue={price(plan.id, c)?.monthly_price ?? ""} className="w-32 tnum" /></label>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-faint">0 means &quot;contact sales&quot; for that currency.</p>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold">Limits <span className="font-normal text-faint">(leave empty for unlimited)</span></legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {LIMITS.map(([k, l]) => (
                  <label key={k} className="grid gap-1 text-xs text-muted">{l}<Input name={`limit_${k}`} type="number" min={0} defaultValue={(plan.limits as Record<string, number | null>)[k] ?? ""} className="tnum" /></label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold">Features</legend>
              <div className="flex flex-wrap gap-2">
                {FEATURES.map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[13px]"><input type="checkbox" name={`feature_${k}`} defaultChecked={(plan.features as Record<string, boolean>)[k]} className="size-4 accent-navy-900" />{l}</label>
                ))}
              </div>
            </fieldset>
            <div className="flex items-center justify-between border-t border-line pt-4">
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="is_active" defaultChecked={plan.is_active} className="size-4 accent-navy-900" />Show on pricing page and checkout</label>
              <SubmitButton pendingLabel="Saving…">Save {plan.name}</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      ))}

      <Card>
        <CardHeader title="Add a currency" description="Adds the currency to every plan with no price yet. Set the prices above to make it available." />
        <ActionForm action={addCurrency} resetOnSuccess className="flex gap-2 p-4">
          <Input name="currency" placeholder="e.g. GHS, KES, EUR, XOF" maxLength={3} className="w-full max-w-48 uppercase" aria-label="Currency code" />
          <SubmitButton variant="outline" pendingLabel="Adding…">Add currency</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
