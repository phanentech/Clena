"use client";

import { useActionState, useState } from "react";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn, nowMs } from "@/lib/utils";
import { createCoupon } from "../actions";
import type { FormState } from "@/app/auth/actions";

type Draft = { code: string; name: string; kind: string; value: string; currency: string; periods: string[]; newOnly: boolean; max: string; days: number | null; perTenant: string };
const blank: Draft = { code: "", name: "", kind: "percent", value: "", currency: "NGN", periods: [], newOnly: false, max: "", days: null, perTenant: "1" };

/** Ready-made coupon ideas. Each fills the form; everything stays editable. */
const TEMPLATES: { label: string; hint: string; draft: Partial<Draft> }[] = [
  { label: "Launch offer", hint: "20% off the first payment, 30 days only", draft: { code: "LAUNCH20", name: "Launch offer", kind: "percent", value: "20", newOnly: true, days: 30 } },
  { label: "Yearly bonus", hint: "2 months free on yearly or longer", draft: { code: "YEAR2FREE", name: "2 months free on yearly", kind: "free_months", value: "2", periods: ["annual", "biennial", "triennial", "quinquennial"] } },
  { label: "Long-term commitment", hint: "Extra 10% on 2, 3 or 5 years", draft: { code: "COMMIT10", name: "Long-term commitment", kind: "percent", value: "10", periods: ["biennial", "triennial", "quinquennial"] } },
  { label: "First month free", hint: "New businesses, monthly plan", draft: { code: "FIRSTFREE", name: "First month free", kind: "free_months", value: "1", periods: ["monthly"], newOnly: true } },
  { label: "Extended trial", hint: "Add 14 days to a free trial", draft: { code: "TRIAL14", name: "Extended trial", kind: "trial_extension", value: "14" } },
  { label: "Fixed amount off", hint: "₦10,000 off any plan", draft: { code: "SAVE10K", name: "₦10,000 off", kind: "fixed", value: "10000", currency: "NGN" } },
  { label: "Dollar discount", hint: "$20 off for international customers", draft: { code: "USD20", name: "$20 off", kind: "fixed", value: "20", currency: "USD" } },
  { label: "Win-back", hint: "50% off to bring back cancelled businesses", draft: { code: "COMEBACK50", name: "Welcome back", kind: "percent", value: "50" } },
  { label: "Seasonal sale", hint: "40% off, first 100 businesses", draft: { code: "DETTY40", name: "December sale", kind: "percent", value: "40", max: "100", days: 21 } },
  { label: "Nonprofit & schools", hint: "30% off for every payment", draft: { code: "IMPACT30", name: "Nonprofit discount", kind: "percent", value: "30", perTenant: "100" } },
  { label: "Partner referral", hint: "10% off for a partner's referrals", draft: { code: "PARTNER10", name: "Partner referral", kind: "percent", value: "10" } },
  { label: "Custom deal", hint: "A private discount for chosen businesses", draft: { code: "", name: "Custom deal", kind: "percent", value: "25" } },
];

export function CouponForm({ tenants, plans, periods, partners }: {
  tenants: { id: string; name: string }[]; plans: { id: string; name: string }[]; periods: { key: string; label: string }[]; partners: { id: string; name: string; referral_code: string }[];
}) {
  const [state, action] = useActionState<FormState, FormData>(createCoupon, undefined);
  const [d, setD] = useState<Draft>(blank);
  const [version, setVersion] = useState(0);
  const apply = (t: Partial<Draft>) => { setD({ ...blank, ...t }); setVersion((v) => v + 1); };
  const expires = d.days ? new Date(nowMs() + d.days * 86_400_000).toISOString().slice(0, 10) : "";

  return (
    <div className="grid gap-4">
      <div>
        <p className="mb-2 text-xs font-medium text-muted">Start from a template</p>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map((t) => (
            <button key={t.label} type="button" title={t.hint} onClick={() => apply(t.draft)}
              className={cn("rounded-md border border-line px-2 py-1 text-xs font-medium hover:border-navy-700", d.name === t.draft.name && "border-navy-900 bg-subtle")}>{t.label}</button>
          ))}
        </div>
      </div>
      <form key={version} action={action} className="grid gap-4" noValidate>
        {state?.error && <Alert>{state.error}</Alert>}
        {state?.success && <Alert tone="success">{state.success}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code" htmlFor="code"><Input id="code" name="code" defaultValue={d.code} className="uppercase tracking-wide" placeholder="LAUNCH20" /></Field>
          <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={d.name} /></Field>
          <Field label="Type" htmlFor="kind">
            <Select id="kind" name="kind" defaultValue={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value })}>
              <option value="percent">Percentage off</option><option value="fixed">Fixed amount off</option>
              <option value="free_months">Free months added</option><option value="trial_extension">Trial days added</option>
            </Select>
          </Field>
          <Field label={d.kind === "percent" ? "Percent" : d.kind === "fixed" ? "Amount" : d.kind === "free_months" ? "Months" : "Days"} htmlFor="value">
            <div className="flex gap-2">
              <Input id="value" name="value" type="number" min={1} defaultValue={d.value} />
              {d.kind === "fixed" && <Select name="currency" defaultValue={d.currency} className="w-24" aria-label="Currency"><option>NGN</option><option>USD</option><option>GHS</option><option>KES</option><option>EUR</option></Select>}
            </div>
          </Field>
          <Field label="Starts" htmlFor="starts_at"><Input id="starts_at" name="starts_at" type="date" /></Field>
          <Field label="Ends" htmlFor="expires_at"><Input id="expires_at" name="expires_at" type="date" defaultValue={expires} /></Field>
          <Field label="Total uses" htmlFor="max_redemptions" hint="Empty for unlimited"><Input id="max_redemptions" name="max_redemptions" type="number" min={1} defaultValue={d.max} /></Field>
          <Field label="Uses per business" htmlFor="per_tenant_limit"><Input id="per_tenant_limit" name="per_tenant_limit" type="number" min={1} defaultValue={d.perTenant} /></Field>
        </div>
        <Field label="Only for these businesses" htmlFor="tenant_ids" hint="Hold Ctrl or Cmd to choose several. Leave empty for everyone.">
          <select id="tenant_ids" name="tenant_ids" multiple className="h-28 w-full rounded-lg border border-line-strong bg-surface p-1 text-[13px]">
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Plans" htmlFor="plan_ids" hint="Empty for all plans">
            <select id="plan_ids" name="plan_ids" multiple className="h-24 w-full rounded-lg border border-line-strong bg-surface p-1 text-[13px]">
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Billing periods" htmlFor="period_keys" hint="Empty for all periods">
            <select id="period_keys" name="period_keys" multiple defaultValue={d.periods} className="h-24 w-full rounded-lg border border-line-strong bg-surface p-1 text-[13px]">
              {periods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
        </div>
        {partners.length > 0 && (
          <Field label="Partner" htmlFor="partner_id"><Select id="partner_id" name="partner_id" defaultValue=""><option value="">None</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.referral_code})</option>)}</Select></Field>
        )}
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="new_businesses_only" defaultChecked={d.newOnly} className="size-4 accent-navy-900" />Only for a business&apos;s first payment</label>
        <Field label="Internal note" htmlFor="description"><Textarea id="description" name="description" className="min-h-16" /></Field>
        <SubmitButton pendingLabel="Creating…">Create coupon</SubmitButton>
      </form>
    </div>
  );
}
